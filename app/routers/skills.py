import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form, Query
from loguru import logger
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.database.models import Employee
from app.services.auth_service import get_current_user, require_admin
from app.services.skill_service import SkillService, TagService

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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def transform_tags(cls, v):
        if isinstance(v, list):
            return [t.name if hasattr(t, 'name') else t for t in v]
        return v


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


class SkillBulkDepartmentRequest(BaseModel):
    skill_ids: List[uuid.UUID]
    department_id: Optional[uuid.UUID] = None


class SkillUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    department_id: Optional[uuid.UUID] = None
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
    force: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
    _admin: Employee = Depends(require_admin),
):
    """Upload one or more ZIP packages containing AI skills."""
    results = await SkillService.upload_skills(
        db, files, categories, department_id, force, current_user.id
    )
    return {"results": results}


@router.post("/skills/{slug}/reupload")
async def reupload_skill(
    slug: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Employee = Depends(get_current_user),
    _admin: Employee = Depends(require_admin),
):
    """Re-upload content for a specific skill to create a new version."""
    result = await SkillService.reupload_skill(db, slug, file, current_user.id)
    return result


@router.post("/skills/inspect-zip")
async def inspect_skill_zip(
    file: UploadFile = File(...),
    _admin: Employee = Depends(require_admin),
):
    """Peek into a ZIP package to extract metadata without saving anything to the database."""
    result = await SkillService.inspect_zip(file)
    return result


@router.get("/skills", response_model=SkillListResponse)
async def list_skills(
    q: Optional[str] = Query(None),
    tag: Optional[List[str]] = Query(None),
    department_id: Optional[uuid.UUID] = Query(None),
    ids: Optional[List[uuid.UUID]] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(20),
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """List and filter skills available in the system."""
    skills, total = await SkillService.list_skills(db, q, tag, department_id, ids, cursor, limit)
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
    _admin: Employee = Depends(require_admin),
):
    """Delete multiple skills at once."""
    if not req.ids:
        return {"message": "No skills selected"}
    count = await SkillService.bulk_delete_skills(db, req.ids)
    return {"message": f"Queued {count} skills for deletion"}


@router.post("/skills/bulk/tags")
async def bulk_add_tags(
    req: SkillBulkTagRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Add a set of tags to multiple skills without removing existing ones."""
    if not req.skill_ids or not req.tags:
        return {"message": "No skills or tags provided"}
    count = await SkillService.bulk_add_tags(db, req.skill_ids, req.tags)
    return {"message": f"Added tags to {count} skills"}


@router.post("/skills/bulk/tags/update")
async def bulk_update_tags(
    req: SkillBulkTagSyncRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Perform a bulk update of tags (add and remove) for multiple skills."""
    if not req.skill_ids:
        return {"message": "No skills provided"}
    count = await SkillService.bulk_update_tags(db, req.skill_ids, req.add_tags, req.remove_tags)
    return {"message": f"Updated tags for {count} skills"}


@router.post("/skills/bulk/department")
async def bulk_change_department(
    req: SkillBulkDepartmentRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Bulk change the department ownership for a list of skills."""
    if not req.skill_ids:
        return {"message": "No skills provided"}
    count = await SkillService.bulk_change_department(db, req.skill_ids, req.department_id)
    return {"message": f"Updated department for {count} skills"}


# --- Tag Routes ---

@router.get("/tags")
async def list_tags(
    q: Optional[str] = Query(None),
    limit: int = Query(1000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Retrieve all tags currently stored in the system."""
    items, total = await TagService.list_tags(db, q, limit, offset)
    return {"items": items, "total": total}


@router.post("/tags/bulk")
async def bulk_create_tags(
    req: TagCreateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Create multiple tags in bulk. Skips names that already exist."""
    count = await TagService.bulk_create_tags(db, req.names)
    return {"message": f"Added {count} new tags", "added": count}


@router.delete("/tags/bulk")
async def bulk_delete_tags(
    req: TagDeleteRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Permanently delete multiple tags from the system."""
    count = await TagService.bulk_delete_tags(db, req.names)
    return {"message": f"Deleted {count} tags"}


@router.get("/skills/tags")
async def get_all_tags(
    db: AsyncSession = Depends(get_db),
    _user: Employee = Depends(get_current_user),
):
    """Get all unique tags used across all skills."""
    return await TagService.get_all_used_tags(db)


# --- Individual Skill Routes (MUST BE LAST) ---

@router.get("/skills/{slug}", response_model=SkillResponse)
async def get_skill(
    slug: str,
    db: AsyncSession = Depends(get_db),
    _current_user: Employee = Depends(get_current_user),
):
    """Get detailed information for a single skill."""
    skill = await SkillService.get_skill(db, slug)
    resp = SkillResponse.model_validate(skill)
    resp.department_name = skill.department.name if skill.department else None
    return resp


@router.delete("/skills/{slug}")
async def delete_skill(
    slug: str,
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Delete a single skill by its identifier."""
    await SkillService.delete_skill(db, slug)
    return {"message": "Skill marked for deletion"}


@router.patch("/skills/{slug}", response_model=SkillResponse)
async def update_skill(
    slug: str,
    req: SkillUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Employee = Depends(require_admin),
):
    """Update a skill's metadata or documentation content."""
    # Pass explicit fields so service knows if department_id was explicitly set to None
    req_data = req.model_dump()
    req_data["_explicit_fields"] = req.model_fields_set
    
    skill = await SkillService.update_skill(db, slug, req_data)
    
    resp = SkillResponse.model_validate(skill)
    resp.department_name = skill.department.name if skill.department else None
    return resp
