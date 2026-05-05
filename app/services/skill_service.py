import io
import os
import uuid
import zipfile
import hashlib
from typing import List, Optional, Tuple, Dict, Any

import sqlalchemy as sa
from fastapi import HTTPException
from loguru import logger
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import Skill, SkillVersion, Tag, Department
from app.utils.text import slugify
from app.worker import get_arq_pool
from app.services.storage_service import storage_service

class TagService:
    @staticmethod
    async def get_or_create_tags(db: AsyncSession, tag_names: List[str]) -> List[Tag]:
        """Helper to get existing tags or create new ones"""
        tag_names = [t.strip().lower() for t in tag_names if t.strip()]
        if not tag_names:
            return []
            
        stmt = select(Tag).where(Tag.name.in_(tag_names))
        res = await db.execute(stmt)
        existing_tags = {t.name: t for t in res.scalars().all()}
        
        tag_objs = []
        for name in tag_names:
            if name in existing_tags:
                tag_objs.append(existing_tags[name])
            else:
                new_tag = Tag(name=name)
                db.add(new_tag)
                tag_objs.append(new_tag)
        await db.flush()
        return tag_objs

    @staticmethod
    async def list_tags(db: AsyncSession, q: Optional[str], limit: int, offset: int) -> Tuple[List[str], int]:
        stmt = select(Tag).order_by(Tag.name.asc())
        count_stmt = select(func.count()).select_from(Tag)
        if q:
            stmt = stmt.where(Tag.name.ilike(f"%{q}%"))
            count_stmt = count_stmt.where(Tag.name.ilike(f"%{q}%"))
        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0
        stmt = stmt.limit(limit).offset(offset)
        res = await db.execute(stmt)
        return [t.name for t in res.scalars().all()], total

    @staticmethod
    async def bulk_create_tags(db: AsyncSession, names: List[str]) -> int:
        names = [n.strip().lower() for n in names if n.strip()]
        if not names:
            return 0
        stmt = select(Tag).where(Tag.name.in_(names))
        res = await db.execute(stmt)
        existing_names = {t.name for t in res.scalars().all()}
        new_names = [n for n in names if n not in existing_names]
        for name in new_names:
            db.add(Tag(name=name))
        await db.commit()
        return len(new_names)

    @staticmethod
    async def bulk_delete_tags(db: AsyncSession, names: List[str]) -> int:
        from sqlalchemy import delete
        if not names:
            return 0
        stmt = delete(Tag).where(Tag.name.in_(names))
        await db.execute(stmt)
        await db.commit()
        return len(names)

    @staticmethod
    async def get_all_used_tags(db: AsyncSession) -> List[Tag]:
        stmt = select(Tag).order_by(Tag.name)
        res = await db.execute(stmt)
        return res.scalars().all()


class SkillService:
    @staticmethod
    async def validate_zip_content(file_data: bytes, zip_name: str) -> str:
        """Validates ZIP and extracts README. Returns error message if invalid, None if valid."""
        try:
            with zipfile.ZipFile(io.BytesIO(file_data)) as zf:
                file_list = [f.filename.lower() for f in zf.infolist()]
                target_readme = f"{zip_name}/SKILL.md".lower()
                has_readme = any(f == "skill.md" or f == target_readme or f.endswith("/skill.md") for f in file_list)
                if not has_readme:
                    return "Missing SKILL.md file in package."
        except zipfile.BadZipFile:
            return "Invalid ZIP file."
        return None

    @staticmethod
    async def upload_skills(
        db: AsyncSession, 
        files: List[Any], 
        categories: Optional[str], 
        department_id: Optional[uuid.UUID], 
        scope_type: str,
        scope_id: Optional[uuid.UUID],
        force: bool, 
        current_user_id: uuid.UUID
    ) -> List[Any]:
        pool = await get_arq_pool()
        tag_names = [c.strip().lower() for c in categories.split(",")] if categories else []
        tag_objs = await TagService.get_or_create_tags(db, tag_names)
        
        results = []
        duplicates = []
        jobs_to_enqueue = []

        try:
            for file in files:
                file_data = await file.read()
                file_hash = hashlib.sha256(file_data).hexdigest()
                name = file.filename.rsplit(".", 1)[0]
                
                # Validate ZIP
                err = await SkillService.validate_zip_content(file_data, name)
                if err:
                    results.append({"name": name, "status": "error" if "Invalid" in err else "rejected", "message": err})
                    continue

                # Check existing
                stmt = select(Skill).where(Skill.name == name).options(selectinload(Skill.tags))
                res = await db.execute(stmt)
                existing_skill = res.scalars().first()

                if existing_skill:
                    if not force:
                        duplicates.append(name)
                        continue
                    # Always prioritize department_id for Skills
                    if scope_type == "department" or department_id:
                        existing_skill.scope_type = "department"
                        existing_skill.scope_id = scope_id or department_id
                        existing_skill.department_id = scope_id or department_id
                    else:
                        existing_skill.scope_type = "global"
                        existing_skill.scope_id = None
                        existing_skill.department_id = None

                    
                    existing_tag_ids = {t.id for t in existing_skill.tags}
                    for t in tag_objs:
                        if t.id not in existing_tag_ids:
                            existing_skill.tags.append(t)
                    
                    if existing_skill.version_hash == file_hash:
                        results.append({"name": name, "status": "updated_metadata", "message": "Metadata updated, content unchanged."})
                        continue
                    
                    new_version_num = existing_skill.current_version + 1
                    skill_id = existing_skill.id
                    existing_skill.status = "processing"
                    existing_skill.version_hash = file_hash
                    returned_obj = existing_skill
                else:
                    # For skills, we only care about department vs global
                    effective_dept_id = scope_id if scope_type == "department" else department_id
                    new_skill = Skill(
                        name=name, slug=slugify(name), status="processing", current_version=1,
                        version_hash=file_hash, tags=tag_objs, 
                        department_id=effective_dept_id,
                        scope_type="department" if effective_dept_id else "global",
                        scope_id=effective_dept_id
                    )
                    db.add(new_skill)
                    await db.flush()
                    skill_id = new_skill.id
                    new_version_num = 1
                    returned_obj = new_skill

                new_version = SkillVersion(
                    skill_id=skill_id, version_number=new_version_num, version_hash=file_hash, created_by=current_user_id
                )
                db.add(new_version)
                await db.flush()

                temp_dir = "temp_uploads"
                os.makedirs(temp_dir, exist_ok=True)
                temp_path = os.path.join(temp_dir, f"{uuid.uuid4()}.zip")
                with open(temp_path, "wb") as f:
                    f.write(file_data)
                jobs_to_enqueue.append((str(skill_id), str(new_version.id), temp_path, file.filename))
                
                # Append ORM object for frontend Response model validation if it's new or updated content
                results.append(returned_obj)

            if duplicates and not force:
                await db.rollback()
                raise HTTPException(status_code=409, detail={"message": "Duplicate skill names detected", "duplicates": duplicates})
                
            await db.commit()
            
            for job_args in jobs_to_enqueue:
                await pool.enqueue_job("ingest_skill_task", *job_args, _queue_name="skills_queue")
                
        except Exception as e:
            for job_args in jobs_to_enqueue:
                temp_path = job_args[2]
                if os.path.exists(temp_path):
                    try: os.remove(temp_path)
                    except: pass
            raise e
            
        return results

    @staticmethod
    async def reupload_skill(db: AsyncSession, slug: str, file: Any, current_user_id: uuid.UUID) -> Dict:
        pool = await get_arq_pool()
        try:
            skill_uuid = uuid.UUID(slug)
            stmt = select(Skill).where(Skill.id == skill_uuid)
        except ValueError:
            stmt = select(Skill).where(Skill.slug == slug)

        res = await db.execute(stmt)
        skill = res.scalars().first()
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")

        file_data = await file.read()
        file_hash = hashlib.sha256(file_data).hexdigest()
        zip_name = file.filename.rsplit(".", 1)[0]
        
        if zip_name != skill.name:
            raise HTTPException(status_code=400, detail=f"Filename mismatch. Expected '{skill.name}.zip', got '{file.filename}'.")

        if skill.version_hash == file_hash:
            return {"status": "skipped", "message": "Content unchanged. No new version created.", "skill_id": str(skill.id), "version": skill.current_version}

        err = await SkillService.validate_zip_content(file_data, zip_name)
        if err:
            raise HTTPException(status_code=400, detail=err)

        new_version_num = skill.current_version + 1
        skill.status = "processing"
        skill.version_hash = file_hash
        
        new_version = SkillVersion(skill_id=skill.id, version_number=new_version_num, version_hash=file_hash, created_by=current_user_id)
        db.add(new_version)
        
        temp_dir = "temp_uploads"
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, f"{uuid.uuid4()}.zip")
        
        try:
            with open(temp_path, "wb") as f:
                f.write(file_data)
            await db.commit()
            await pool.enqueue_job("ingest_skill_task", str(skill.id), str(new_version.id), temp_path, file.filename, _queue_name="skills_queue")
        except Exception as e:
            if os.path.exists(temp_path):
                try: os.remove(temp_path)
                except: pass
            raise e
            
        return {"status": "processing", "skill_id": str(skill.id), "version": new_version_num}

    @staticmethod
    async def inspect_zip(file: Any) -> Dict:
        file_data = await file.read()
        name = file.filename.rsplit(".", 1)[0]
        readme_content = ""
        try:
            with zipfile.ZipFile(io.BytesIO(file_data)) as zf:
                target_readme = f"{name}/SKILL.md".lower()
                for member in zf.infolist():
                    curr = member.filename.lower()
                    if curr == "skill.md" or curr == target_readme or curr.endswith("/skill.md"):
                        with zf.open(member) as f:
                            readme_content = f.read().decode("utf-8", errors="ignore")
                        break
            return {"name": name, "description": readme_content}
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid ZIP file.")
        except Exception as e:
            logger.error(f"Error inspecting zip: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @staticmethod
    async def list_skills(
        db: AsyncSession, 
        q: Optional[str], 
        tag: Optional[List[str]], 
        department_id: Optional[uuid.UUID], 
        scope_type: Optional[str],
        scope_id: Optional[uuid.UUID],
        ids: Optional[List[uuid.UUID]], 
        cursor: Optional[str], 
        limit: int,
        allowed_department_ids: Optional[List[uuid.UUID]] = None
    ) -> Tuple[List[Skill], int]:
        stmt = select(Skill).options(selectinload(Skill.department), selectinload(Skill.tags)).order_by(Skill.updated_at.desc(), Skill.id.desc())

        if cursor:
            ref_skill_res = await db.execute(select(Skill).where(Skill.slug == cursor))
            ref_skill = ref_skill_res.scalars().first()
            if ref_skill:
                stmt = stmt.where(or_(Skill.updated_at < ref_skill.updated_at, and_(Skill.updated_at == ref_skill.updated_at, Skill.id < ref_skill.id)))

        # --- RBAC Filtering ---
        if allowed_department_ids is not None:
            rbac_filter = or_(Skill.department_id.in_(allowed_department_ids), Skill.department_id == None)
            stmt = stmt.where(rbac_filter)

        if q:
            filter_expr = or_(Skill.name.ilike(f"%{q}%"), Skill.description.ilike(f"%{q}%"))
            stmt = stmt.where(filter_expr)

        if ids:
            stmt = stmt.where(Skill.id.in_(ids))

        if tag:
            stmt = stmt.join(Skill.tags).where(Tag.name.in_(tag)).distinct()

        if department_id:
            stmt = stmt.where(Skill.department_id == department_id)
            
        if scope_type:
            stmt = stmt.where(Skill.scope_type == scope_type)
            if scope_id:
                stmt = stmt.where(Skill.scope_id == scope_id)

        count_stmt = select(func.count(func.distinct(Skill.id))).select_from(Skill)
        
        # Apply filters to count_stmt as well
        if allowed_department_ids is not None:
            count_stmt = count_stmt.where(or_(Skill.department_id.in_(allowed_department_ids), Skill.department_id == None))
            
        if ids:
            count_stmt = count_stmt.where(Skill.id.in_(ids))
        else:
            if q:
                count_stmt = count_stmt.where(or_(Skill.name.ilike(f"%{q}%"), Skill.description.ilike(f"%{q}%")))
            if tag:
                count_stmt = count_stmt.join(Skill.tags).where(Tag.name.in_(tag))
            if department_id:
                count_stmt = count_stmt.where(Skill.department_id == department_id)
            if scope_type:
                count_stmt = count_stmt.where(Skill.scope_type == scope_type)
                if scope_id:
                    count_stmt = count_stmt.where(Skill.scope_id == scope_id)

        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = stmt.limit(limit)
        res = await db.execute(stmt)
        return res.scalars().unique().all(), total

    @staticmethod
    async def bulk_delete_skills(db: AsyncSession, ids: List[uuid.UUID]) -> int:
        if not ids: return 0
        pool = await get_arq_pool()
        stmt = sa.update(Skill).where(Skill.id.in_(ids)).values(status="deleting")
        await db.execute(stmt)
        await db.commit()
        for skill_id in ids:
            await pool.enqueue_job("delete_skill_task", str(skill_id), _queue_name="skills_queue")
        return len(ids)

    @staticmethod
    async def get_skill(db: AsyncSession, slug: str, version_number: Optional[int] = None) -> Skill:
        try:
            skill_uuid = uuid.UUID(slug)
            stmt = select(Skill).where(Skill.id == skill_uuid)
        except ValueError:
            stmt = select(Skill).where(Skill.slug == slug)
        stmt = stmt.options(selectinload(Skill.department), selectinload(Skill.tags))
        res = await db.execute(stmt)
        skill = res.scalars().first()
        if not skill or skill.status == "deleting":
            raise HTTPException(status_code=404, detail="Skill not found")
            
        # If a specific version is requested, load its description/content
        if version_number and version_number != skill.current_version:
            v_stmt = select(SkillVersion).where(SkillVersion.skill_id == skill.id, SkillVersion.version_number == version_number)
            v_res = await db.execute(v_stmt)
            version = v_res.scalars().first()
            if not version:
                raise HTTPException(status_code=404, detail=f"Version {version_number} not found")
            
            # Try to fetch SKILL.md from this version's storage
            if version.storage_path:
                try:
                    # Try both direct path and skill-named subfolder path
                    possible_paths = [
                        f"{version.storage_path.rstrip('/')}/SKILL.md",
                        f"{version.storage_path.rstrip('/')}/{skill.name}/SKILL.md"
                    ]
                    
                    content_bytes = None
                    for path in possible_paths:
                        try:
                            content_bytes = storage_service.download_file(path)
                            if content_bytes: 
                                logger.debug(f"Found SKILL.md at: {path}")
                                break
                        except:
                            continue

                    if content_bytes:
                        skill.description = content_bytes.decode("utf-8", errors="ignore")
                except Exception as e:
                    logger.warning(f"Failed to fetch description for version {version_number}: {e}")
                    # Keep existing description if fetch fails

        return skill

    @staticmethod
    async def list_versions(db: AsyncSession, slug: str) -> List[SkillVersion]:
        skill = await SkillService.get_skill(db, slug)
        stmt = select(SkillVersion).where(SkillVersion.skill_id == skill.id).order_by(SkillVersion.version_number.desc())
        res = await db.execute(stmt)
        return res.scalars().all()

    @staticmethod
    async def set_latest_version(db: AsyncSession, slug: str, version_number: int) -> Skill:
        skill = await SkillService.get_skill(db, slug)
        if version_number == skill.current_version:
            return skill
            
        stmt = select(SkillVersion).where(SkillVersion.skill_id == skill.id, SkillVersion.version_number == version_number)
        res = await db.execute(stmt)
        version = res.scalars().first()
        if not version:
            raise HTTPException(status_code=404, detail=f"Version {version_number} not found")
            
        # Update skill record
        skill.current_version = version_number
        skill.version_hash = version.version_hash
        skill.storage_path = version.storage_path
        
        # Sync description from SKILL.md of this version
        if version.storage_path:
            try:
                # Try both direct path and skill-named subfolder path
                possible_paths = [
                    f"{version.storage_path.rstrip('/')}/SKILL.md",
                    f"{version.storage_path.rstrip('/')}/{skill.name}/SKILL.md"
                ]
                
                content_bytes = None
                for path in possible_paths:
                    try:
                        content_bytes = storage_service.download_file(path)
                        if content_bytes: break
                    except:
                        continue

                if content_bytes:
                    skill.description = content_bytes.decode("utf-8", errors="ignore")
            except Exception as e:
                logger.error(f"Failed to sync description while setting latest version: {e}")

        await db.commit()
        await db.refresh(skill)
        return skill

    @staticmethod
    async def delete_skill(db: AsyncSession, slug: str):
        skill = await SkillService.get_skill(db, slug)
        pool = await get_arq_pool()
        skill.status = "deleting"
        await db.commit()
        await pool.enqueue_job("delete_skill_task", str(skill.id), _queue_name="skills_queue")

    @staticmethod
    async def update_skill(db: AsyncSession, slug: str, req_data: dict) -> Skill:
        skill = await SkillService.get_skill(db, slug)
        
        name = req_data.get("name")
        description = req_data.get("description")
        department_id = req_data.get("department_id")
        increment_version = req_data.get("increment_version", False)
        tags = req_data.get("tags")
        is_department_explicit = "department_id" in req_data.get("_explicit_fields", [])
        scope_type = req_data.get("scope_type")
        scope_id = req_data.get("scope_id")
        is_scope_explicit = "scope_type" in req_data.get("_explicit_fields", [])

        if name is not None and name != skill.name:
            stmt = select(Skill).where(Skill.name == name, Skill.id != skill.id)
            res = await db.execute(stmt)
            if res.scalars().first():
                raise HTTPException(status_code=409, detail=f"Skill with name '{name}' already exists.")
            skill.name = name
            skill.slug = slugify(name)

        if description is not None and description != skill.description:
            if increment_version:
                new_version_num = skill.current_version + 1
                content_hash = hashlib.sha256(description.encode()).hexdigest()
                skill.version_hash = content_hash
                new_v = SkillVersion(skill_id=skill.id, version_number=new_version_num, changelog="Manual update via UI", storage_path=f"skills/{skill.id}/versions/{new_version_num}/content/")
                db.add(new_v)
                skill.current_version = new_version_num
                skill.storage_path = new_v.storage_path
            
            skill.description = description
            if skill.storage_path:
                base_path = skill.storage_path.rstrip("/")
                object_name = f"{base_path}/SKILL.md"
                storage_service.upload_file(object_name=object_name, data=description.encode("utf-8"), content_type="text/markdown")

        # Skill visibility: only Department or Global
        if scope_type is not None or is_scope_explicit:
            if scope_type == "department" and scope_id:
                skill.scope_type = "department"
                skill.scope_id = scope_id
                skill.department_id = scope_id
            else:
                skill.scope_type = "global"
                skill.scope_id = None
                skill.department_id = None
        elif department_id is not None or is_department_explicit:
            if department_id:
                skill.scope_type = "department"
                skill.scope_id = department_id
                skill.department_id = department_id
            else:
                skill.scope_type = "global"
                skill.scope_id = None
                skill.department_id = None

        if tags is not None:
            skill.tags = await TagService.get_or_create_tags(db, tags)

        await db.commit()
        await db.refresh(skill)
        return skill

    @staticmethod
    async def bulk_add_tags(db: AsyncSession, skill_ids: List[uuid.UUID], tags: List[str]) -> int:
        if not skill_ids or not tags: return 0
        tag_objs = await TagService.get_or_create_tags(db, tags)
        stmt = select(Skill).where(Skill.id.in_(skill_ids)).options(selectinload(Skill.tags))
        res = await db.execute(stmt)
        skills = res.scalars().all()
        for skill in skills:
            existing_tag_names = {t.name for t in skill.tags}
            for tag in tag_objs:
                if tag.name not in existing_tag_names:
                    skill.tags.append(tag)
        await db.commit()
        return len(skills)

    @staticmethod
    async def bulk_update_tags(db: AsyncSession, skill_ids: List[uuid.UUID], add_tags: List[str], remove_tags: List[str]) -> int:
        if not skill_ids: return 0
        tag_objs_to_add = await TagService.get_or_create_tags(db, add_tags) if add_tags else []
        remove_names = {t.strip().lower() for t in remove_tags if t.strip()}
        
        stmt = select(Skill).where(Skill.id.in_(skill_ids)).options(selectinload(Skill.tags))
        res = await db.execute(stmt)
        skills = res.scalars().all()

        for skill in skills:
            if remove_names:
                skill.tags = [t for t in skill.tags if t.name not in remove_names]
            if tag_objs_to_add:
                existing_tag_names = {t.name for t in skill.tags}
                for tag in tag_objs_to_add:
                    if tag.name not in existing_tag_names:
                        skill.tags.append(tag)
        await db.commit()
        return len(skills)

    @staticmethod
    async def bulk_change_scope(
        db: AsyncSession, 
        skill_ids: List[uuid.UUID], 
        scope_type: str,
        scope_id: Optional[uuid.UUID]
    ) -> int:
        if not skill_ids: return 0
        
        # Sync department_id for compatibility
        dept_id = scope_id if scope_type == "department" else None
        
        stmt = sa.update(Skill).where(Skill.id.in_(skill_ids)).values(
            scope_type=scope_type,
            scope_id=scope_id,
            department_id=dept_id
        )
        await db.execute(stmt)
        await db.commit()
        return len(skill_ids)
