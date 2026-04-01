"""
Admin API endpoints (/api/admin). All endpoints require admin role.
"""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

import db.crud as crud
from config import settings
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
    display_name: Optional[str] = None


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = None
    display_name: Optional[str] = None


class SetPermissionRequest(BaseModel):
    role: str


class SetStatusRequest(BaseModel):
    active: bool


class CreateInviteRequest(BaseModel):
    role: str = 'viewer'
    expires_hours: Optional[int] = None


@router.get("/users", dependencies=[_require_admin])
async def list_users():
    """List all users with extended fields (excludes password hashes)."""
    users = await crud.get_all_users_full()
    return {"users": users}


@router.post("/users", status_code=201, dependencies=[_require_admin])
async def create_user(req: CreateUserRequest, request: Request, payload: dict = Depends(require_role('admin'))):
    """Create a new user."""
    if req.role not in VALID_ROLES:
        raise HTTPException(400, "role must be viewer, editor, or admin")
    if len(req.password) < settings.min_password_length:
        raise HTTPException(422, f"Password must be at least {settings.min_password_length} characters")
    existing = await crud.get_user_by_username(req.username)
    if existing:
        raise HTTPException(409, "Username already exists")
    password_hash = pwd_context.hash(req.password)
    user_id = await crud.create_user(req.username, password_hash, role=req.role)
    if req.display_name:
        await crud.update_user_display_name(user_id, req.display_name)
    await crud.write_audit(
        payload["user_id"], payload["username"], "user.create",
        target_type="user", target_id=user_id, target_name=req.username,
        detail=json.dumps({"role": req.role}),
        ip=request.client.host if request.client else None,
    )
    return {"id": user_id, "username": req.username, "role": req.role}


@router.patch("/users/{user_id}", dependencies=[_require_admin])
async def update_user(user_id: str, req: UpdateUserRequest, request: Request, payload: dict = Depends(require_role('admin'))):
    """Update a user's role, password, and/or display name."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if req.role is not None:
        if req.role not in VALID_ROLES:
            raise HTTPException(400, "role must be viewer, editor, or admin")
        await crud.update_user_role(user_id, req.role)
        await crud.write_audit(
            payload["user_id"], payload["username"], "user.role_change",
            target_type="user", target_id=user_id, target_name=user["username"],
            detail=json.dumps({"from": user["role"], "to": req.role}),
            ip=request.client.host if request.client else None,
        )
    if req.password is not None:
        if len(req.password) < settings.min_password_length:
            raise HTTPException(422, f"Password must be at least {settings.min_password_length} characters")
        password_hash = pwd_context.hash(req.password)
        await crud.update_user_password(user_id, password_hash)
        await crud.set_pwd_changed_at(user_id)
        await crud.write_audit(
            payload["user_id"], payload["username"], "user.password_reset",
            target_type="user", target_id=user_id, target_name=user["username"],
            ip=request.client.host if request.client else None,
        )
    if req.display_name is not None:
        await crud.update_user_display_name(user_id, req.display_name)
    return {"status": "updated"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request, payload: dict = Depends(require_role('admin'))):
    """Delete a user. Cannot delete your own account. Cannot delete the last admin."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user_id == payload.get("user_id"):
        raise HTTPException(400, "Cannot delete your own account")
    # Prevent deleting the last admin
    if user["role"] == "admin":
        all_users = await crud.get_all_users_full()
        admin_count = sum(1 for u in all_users if u["role"] == "admin")
        if admin_count <= 1:
            raise HTTPException(400, "Cannot delete the last admin account")
    await crud.write_audit(
        payload["user_id"], payload["username"], "user.delete",
        target_type="user", target_id=user_id, target_name=user["username"],
        ip=request.client.host if request.client else None,
    )
    await crud.delete_user(user_id)
    return {"status": "deleted"}


@router.patch("/users/{user_id}/status")
async def set_user_status(user_id: str, req: SetStatusRequest, request: Request, payload: dict = Depends(require_role('admin'))):
    """Suspend or reactivate a user account."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    await crud.set_user_active(user_id, req.active)
    action = "user.activate" if req.active else "user.suspend"
    await crud.write_audit(
        payload["user_id"], payload["username"], action,
        target_type="user", target_id=user_id, target_name=user["username"],
        ip=request.client.host if request.client else None,
    )
    return {"status": "updated", "active": req.active}


@router.delete("/users/{user_id}/sessions", dependencies=[_require_admin])
async def force_logout_user(user_id: str, request: Request, payload: dict = Depends(require_role('admin'))):
    """Revoke all sessions for a user (force logout)."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    count = await crud.revoke_all_sessions(user_id)
    await crud.write_audit(
        payload["user_id"], payload["username"], "session.revoke_all",
        target_type="user", target_id=user_id, target_name=user["username"],
        detail=json.dumps({"sessions_revoked": count}),
        ip=request.client.host if request.client else None,
    )
    return {"revoked": count}


@router.get("/users/{user_id}/sessions", dependencies=[_require_admin])
async def get_user_sessions(user_id: str):
    """List active sessions for a user."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    sessions = await crud.get_user_sessions(user_id)
    return {"sessions": sessions}


@router.get("/users/{user_id}/audit", dependencies=[_require_admin])
async def get_user_audit(
    user_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Audit log entries where this user is the actor or target."""
    user = await crud.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    entries = await crud.get_audit_log(limit=limit, offset=offset, actor_id=user_id)
    return {"entries": entries, "total": len(entries)}


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


# ── Invites ───────────────────────────────────────────────────────────────────

@router.get("/invites", dependencies=[_require_admin])
async def list_invites(active_only: bool = Query(True)):
    """List invite links."""
    invites = await crud.list_invites(active_only=active_only)
    return {"invites": invites}


@router.post("/invites")
async def create_invite(req: CreateInviteRequest, request: Request, payload: dict = Depends(require_role('admin'))):
    """Create a new invite link."""
    if req.role not in VALID_ROLES:
        raise HTTPException(400, "role must be viewer, editor, or admin")
    expiry_hours = req.expires_hours or settings.invite_expiry_hours
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=expiry_hours)).isoformat()
    invite_id = await crud.create_invite(payload["user_id"], req.role, expires_at)
    await crud.write_audit(
        payload["user_id"], payload["username"], "user.invite_create",
        target_type="invite", target_id=invite_id,
        detail=json.dumps({"role": req.role, "expires_hours": expiry_hours}),
        ip=request.client.host if request.client else None,
    )
    return {
        "id": invite_id,
        "url": f"/invite/{invite_id}",
        "expires_at": expires_at,
        "role": req.role,
    }


@router.delete("/invites/{invite_id}")
async def delete_invite(invite_id: str, request: Request, payload: dict = Depends(require_role('admin'))):
    """Revoke an unused invite."""
    invite = await crud.get_invite(invite_id)
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite["used_at"]:
        raise HTTPException(400, "Cannot delete an already-used invite")
    await crud.delete_invite(invite_id)
    return {"status": "deleted"}


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit", dependencies=[_require_admin])
async def get_audit(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
):
    """Paginated audit log."""
    entries = await crud.get_audit_log(limit=limit, offset=offset, action=action)
    return {"entries": entries}


# ── Filesystem browse ─────────────────────────────────────────────────────────

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
