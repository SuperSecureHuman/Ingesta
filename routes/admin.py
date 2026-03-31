"""
Admin API endpoints (/api/admin). All endpoints require admin role.
"""

from pathlib import Path
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import db.crud as crud
from routes.auth import pwd_context
from routes.deps import require_role

router = APIRouter(prefix="/api/admin", tags=["admin"])

_require_admin = Depends(require_role('admin'))

VALID_ROLES = {'viewer', 'editor', 'admin'}
VALID_PERM_ROLES = {'editor', 'viewer'}


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = 'viewer'


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None


class SetPermissionRequest(BaseModel):
    role: str


@router.get("/users", dependencies=[_require_admin])
async def list_users():
    """List all users (excludes password hashes)."""
    users = await crud.get_all_users()
    return {"users": users}


@router.post("/users", status_code=201, dependencies=[_require_admin])
async def create_user(req: CreateUserRequest):
    """Create a new user."""
    if req.role not in VALID_ROLES:
        raise HTTPException(400, "role must be viewer, editor, or admin")
    existing = await crud.get_user_by_username(req.username)
    if existing:
        raise HTTPException(409, "Username already exists")
    password_hash = pwd_context.hash(req.password)
    user_id = await crud.create_user(req.username, password_hash, role=req.role)
    return {"id": user_id, "username": req.username, "role": req.role}


@router.patch("/users/{user_id}", dependencies=[_require_admin])
async def update_user(user_id: str, req: UpdateUserRequest):
    """Update a user's role and/or password."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if req.role is not None:
        if req.role not in VALID_ROLES:
            raise HTTPException(400, "role must be viewer, editor, or admin")
        await crud.update_user_role(user_id, req.role)
    if req.password is not None:
        password_hash = pwd_context.hash(req.password)
        await crud.update_user_password(user_id, password_hash)
    return {"status": "updated"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, payload: dict = Depends(require_role('admin'))):
    """Delete a user. Cannot delete your own account."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user_id == payload.get("user_id"):
        raise HTTPException(400, "Cannot delete your own account")
    await crud.delete_user(user_id)
    return {"status": "deleted"}


@router.get("/users/{user_id}/permissions", dependencies=[_require_admin])
async def get_user_permissions(user_id: str):
    """List per-library permission overrides for a user."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    perms = await crud.get_library_permissions_for_user(user_id)
    return {"permissions": perms}


@router.put("/users/{user_id}/permissions/{library_id}", dependencies=[_require_admin])
async def set_permission(user_id: str, library_id: str, req: SetPermissionRequest):
    """Set a per-library permission override for a user."""
    if req.role not in VALID_PERM_ROLES:
        raise HTTPException(400, "role must be editor or viewer")
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    library = await crud.get_library(library_id)
    if not library:
        raise HTTPException(404, "Library not found")
    await crud.set_library_permission(user_id, library_id, req.role)
    return {"status": "set", "user_id": user_id, "library_id": library_id, "role": req.role}


@router.delete("/users/{user_id}/permissions/{library_id}", dependencies=[_require_admin])
async def delete_permission(user_id: str, library_id: str):
    """Remove a per-library permission override."""
    await crud.delete_library_permission(user_id, library_id)
    return {"status": "deleted"}


@router.get("/fs-browse", dependencies=[_require_admin])
async def fs_browse(path: str = Query("/")):
    """Browse server filesystem directories (admin only). No MEDIA_ROOT restriction."""
    p = Path(os.path.normpath(os.path.abspath(path)))
    if not p.exists() or not p.is_dir():
        raise HTTPException(status_code=400, detail=f"Path not found or not a directory: {path}")
    entries = []
    try:
        for entry in sorted(p.iterdir(), key=lambda e: e.name.lower()):
            if not entry.is_dir():
                continue
            try:
                entry.stat()
                entries.append({"name": entry.name, "path": str(entry), "is_dir": True})
            except PermissionError:
                pass
    except PermissionError:
        raise HTTPException(status_code=400, detail=f"Permission denied: {path}")
    return {
        "path": str(p),
        "parent": str(p.parent) if p != p.parent else None,
        "entries": entries,
    }
