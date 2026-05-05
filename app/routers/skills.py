import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form, Query
from loguru import logger
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.database.models import Employee, Skill
from app.services.auth_service import get_current_user, require_admin, require_permission
from app.services.skill_service import SkillService, TagService
from app.services.permission_engine import (
    _get_user_permissions,
    build_skill_filter,
    can_access_skill,
)

router = APIRouter()

# --- Pydantic Models ---

class SkillResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    tags: List[str] = []
    department_id: Optional[uuid.UUID]
    department_name: Optional[str] = None
    current_version: int
    version_hash: Optional[str]
    status: str
    scope_type: str = "global"
    scope_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def transform_tags(cls, v):
        if isinstance(v, list):
            return [t.name if hasattr(t, 'name') else t for t in v]
        return v


class SkillVersionResponse(BaseModel):
    version_number: int
    version_hash: Optional[str]
    storage_path: Optional[str]
    changelog: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class SkillListResponse(BaseModel):
    items: List[SkillResponse]
    total: int


class SkillDeleteRequest(BaseModel):
    ids: List[uuid.UUID]


class SkillBulkTagRequest(BaseModel):
    skill_ids: List[uuid.UUID]
    tags: List[str]


class SkillBulkTagSyncRequest(BaseModel):
    skill_ids: List[uuid.UUID]
    add_tags: List[str] = []
    remove_tags: List[str] = []


class SkillBulkVisibilityRequest(BaseModel):
    skill_ids: List[uuid.UUID]
    scope_type: str
    scope_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None  # Legacy support


class SkillUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
    scope_type: Optional[str] = None
    scope_id: Optional[uuid.UUID] = None
    increment_version: bool = False
    tags: Optional[List[str]] = None


class TagCreateRequest(BaseModel):
    names: List[str]


class TagDeleteRequest(BaseModel):
    names: List[str]


# --- Skill Routes ---

@router.post("/skills/upload")
async def upload_skills(
    files: List[UploadFile] = File(...),
    categories: Optional[str] = Form(None),
    department_id: Optional[uuid.UUID] = Form(None),
    scope_type: str = Form("global"),
    scope_id: Optional[uuid.UUID] = Form(None),
    force: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Upload one or more ZIP packages containing AI skills."""
    # Scope validation
    perms = _get_user_permissions(user)
    if user.role != "admin" and "skill:create:all" not in perms:
        if "skill:create:own_dept" not in perms:
            raise HTTPException(403, "Permission required: skill:create")
        
        # User only has own_dept scope
        if department_id and department_id != user.department_id:
            raise HTTPException(403, "You can only assign skills to your own department")
        if scope_type == "department" and scope_id != user.department_id:
            raise HTTPException(403, "You can only assign skills to your own department")
        if scope_type == "global":
            # Auto-force to own department if trying to create global without :all permission?
            # Or just deny. Let's deny for now to be safe.
            raise HTTPException(403, "You do not have permission to create global skills")

    results = await SkillService.upload_skills(
        db, files, categories, department_id, scope_type, scope_id, force, user.id
    )
    return {"results": results}


@router.post("/skills/{slug}/reupload")
async def reupload_skill(
    slug: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Re-upload content for a specific skill to create a new version."""
    skill = await SkillService.get_skill(db, slug)
    if not await can_access_skill(db, user, skill, "create"):
        raise HTTPException(status_code=403, detail="Access denied")

    result = await SkillService.reupload_skill(db, slug, file, user.id)
    return result


@router.post("/skills/inspect-zip")
async def inspect_skill_zip(
    file: UploadFile = File(...),
    _user: Employee = require_permission("skill:create"),
):
    """Peek into a ZIP package to extract metadata without saving anything to the database."""
    result = await SkillService.inspect_zip(file)
    return result


@router.get("/skills", response_model=SkillListResponse)
async def list_skills(
    q: Optional[str] = Query(None),
    tag: Optional[List[str]] = Query(None),
    department_id: Optional[uuid.UUID] = Query(None),
    scope_type: Optional[str] = Query(None),
    scope_id: Optional[uuid.UUID] = Query(None),
    ids: Optional[List[uuid.UUID]] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(20),
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """List and filter skills available in the system."""
    # --- Scope filtering ---
    needs_filter, allowed_depts = build_skill_filter(user, "read")
    
    # If allowed_depts is None and needs_filter is True, it means NO permission
    if needs_filter and allowed_depts is None:
        return {"items": [], "total": 0}

    # Pass allowed_depts to service for filtering
    # Note: If allowed_depts is [], it means user can see Global (dept=None)
    # The service needs to handle this logic: (department_id IN allowed_depts) OR (department_id IS NULL)
    
    skills, total = await SkillService.list_skills(
        db, q, tag, department_id, scope_type, scope_id, ids, cursor, limit,
        allowed_department_ids=allowed_depts if needs_filter else None
    )
    items = []
    for s in skills:
        resp = SkillResponse.model_validate(s)
        resp.department_name = s.department.name if s.department else None
        items.append(resp)
    return {"items": items, "total": total}


@router.delete("/skills/bulk")
async def bulk_delete_skills(
    req: SkillDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Delete multiple skills at once."""
    if not req.ids:
        return {"message": "No skills selected"}
        
    # Check each skill
    for skill_id in req.ids:
        skill = await db.get(Skill, skill_id)
        if not skill: continue
        if not await can_access_skill(db, user, skill, "delete"):
            raise HTTPException(403, f"Access denied for skill {skill.name}")

    count = await SkillService.bulk_delete_skills(db, req.ids)
    return {"message": f"Queued {count} skills for deletion"}


@router.post("/skills/bulk/tags")
async def bulk_add_tags(
    req: SkillBulkTagRequest,
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Add a set of tags to multiple skills without removing existing ones."""
    if not req.skill_ids or not req.tags:
        return {"message": "No skills or tags provided"}
        
    for skill_id in req.skill_ids:
        skill = await db.get(Skill, skill_id)
        if not skill: continue
        if not await can_access_skill(db, user, skill, "edit"):
            raise HTTPException(403, f"Access denied for skill {skill.name}")

    count = await SkillService.bulk_add_tags(db, req.skill_ids, req.tags)
    return {"message": f"Added tags to {count} skills"}


@router.post("/skills/bulk/tags/update")
async def bulk_update_tags(
    req: SkillBulkTagSyncRequest,
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Perform a bulk update of tags (add and remove) for multiple skills."""
    if not req.skill_ids:
        return {"message": "No skills provided"}
        
    for skill_id in req.skill_ids:
        skill = await db.get(Skill, skill_id)
        if not skill: continue
        if not await can_access_skill(db, user, skill, "edit"):
            raise HTTPException(403, f"Access denied for skill {skill.name}")

    count = await SkillService.bulk_update_tags(db, req.skill_ids, req.add_tags, req.remove_tags)
    return {"message": f"Updated tags for {count} skills"}


@router.post("/skills/bulk/department")
async def bulk_change_visibility(
    req: SkillBulkVisibilityRequest,
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Change visibility/scope for multiple skills at once."""
    if not req.skill_ids:
        return {"message": "No skills provided"}
    
    # Check access to all skills
    for skill_id in req.skill_ids:
        skill = await db.get(Skill, skill_id)
        if not skill: continue
        if not await can_access_skill(db, user, skill, "edit"):
            raise HTTPException(403, f"Access denied for skill {skill.name}")

    # Handle legacy department_id if scope_type is not provided
    effective_scope_type = req.scope_type
    effective_scope_id = req.scope_id
    
    if not effective_scope_type and req.department_id:
        effective_scope_type = "department"
        effective_scope_id = req.department_id

    # Scope validation for new scope
    perms = _get_user_permissions(user)
    if user.role != "admin" and "skill:edit:all" not in perms:
        if effective_scope_type == "department" and effective_scope_id != user.department_id:
            raise HTTPException(403, "You can only assign skills to your own department")
        if effective_scope_type == "global":
            raise HTTPException(403, "You do not have permission to make skills global")

    count = await SkillService.bulk_change_scope(
        db, req.skill_ids, effective_scope_type, effective_scope_id
    )
    return {"updated": count, "message": f"Updated visibility for {count} skills"}


# --- Tag Routes ---

@router.get("/tags")
async def list_tags(
    q: Optional[str] = Query(None),
    limit: int = Query(1000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    _user: Employee = require_permission("skill:read"),
):
    """Retrieve all tags currently stored in the system."""
    items, total = await TagService.list_tags(db, q, limit, offset)
    return {"items": items, "total": total}


@router.post("/tags/bulk")
async def bulk_create_tags(
    req: TagCreateRequest,
    db: AsyncSession = Depends(get_db),
    _user: Employee = require_permission("skill:edit"),
):
    """Create multiple tags in bulk. Skips names that already exist."""
    count = await TagService.bulk_create_tags(db, req.names)
    return {"message": f"Added {count} new tags", "added": count}


@router.delete("/tags/bulk")
async def bulk_delete_tags(
    req: TagDeleteRequest,
    db: AsyncSession = Depends(get_db),
    _user: Employee = require_permission("skill:edit"),
):
    """Permanently delete multiple tags from the system."""
    count = await TagService.bulk_delete_tags(db, req.names)
    return {"message": f"Deleted {count} tags"}


@router.get("/skills/tags")
async def get_all_tags(
    db: AsyncSession = Depends(get_db),
    _user: Employee = require_permission("skill:read"),
):
    """Get all unique tags used across all skills."""
    return await TagService.get_all_used_tags(db)


# --- Individual Skill Routes (MUST BE LAST) ---

@router.get("/skills/{slug}", response_model=SkillResponse)
async def get_skill(
    slug: str,
    version: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Get detailed information for a single skill."""
    skill = await SkillService.get_skill(db, slug, version_number=version)
    
    # Check access using permission engine
    if not await can_access_skill(db, user, skill, "read"):
        raise HTTPException(status_code=403, detail="Access denied")

    resp = SkillResponse.model_validate(skill)
    resp.department_name = skill.department.name if skill.department else None
    return resp


@router.get("/skills/{slug}/versions", response_model=List[SkillVersionResponse])
async def list_skill_versions(
    slug: str,
    db: AsyncSession = Depends(get_db),
    _user: Employee = require_permission("skill:read"),
):
    """List all versions for a specific skill."""
    return await SkillService.list_versions(db, slug)


@router.post("/skills/{slug}/set-latest")
async def set_latest_version(
    slug: str,
    version: int = Query(..., alias="version"),
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Set a specific version as the latest/current version."""
    skill = await SkillService.get_skill(db, slug)
    if not await can_access_skill(db, user, skill, "edit"):
        raise HTTPException(status_code=403, detail="Access denied")

    skill = await SkillService.set_latest_version(db, slug, version)
    return {"message": f"Version {version} set as latest", "current_version": skill.current_version}


@router.delete("/skills/{slug}")
async def delete_skill(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Delete a single skill by its identifier."""
    skill = await SkillService.get_skill(db, slug)
    if not await can_access_skill(db, user, skill, "delete"):
        raise HTTPException(status_code=403, detail="Access denied")

    await SkillService.delete_skill(db, slug)
    return {"message": "Skill marked for deletion"}


@router.patch("/skills/{slug}", response_model=SkillResponse)
async def update_skill(
    slug: str,
    req: SkillUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Update a skill's metadata or documentation content."""
    skill = await SkillService.get_skill(db, slug)
    if not await can_access_skill(db, user, skill, "edit"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Scope validation for new department/scope
    perms = _get_user_permissions(user)
    if user.role != "admin" and "skill:edit:all" not in perms:
        # User only has own_dept scope
        if req.department_id and req.department_id != user.department_id:
            raise HTTPException(403, "You can only assign skills to your own department")
        if req.scope_type == "department" and req.scope_id != user.department_id:
            raise HTTPException(403, "You can only assign skills to your own department")
        if req.scope_type == "global":
            raise HTTPException(403, "You do not have permission to make skills global")

    # Pass explicit fields so service knows if department_id was explicitly set to None
    req_data = req.model_dump()
    req_data["_explicit_fields"] = req.model_fields_set
    
    updated_skill = await SkillService.update_skill(db, slug, req_data)
    
    resp = SkillResponse.model_validate(updated_skill)
    resp.department_name = updated_skill.department.name if updated_skill.department else None
    return resp
