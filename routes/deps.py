"""
Shared dependencies: authentication, path validation, manager access.
"""

import re
from pathlib import Path
from typing import Optional
from fastapi import Header, Cookie, HTTPException, Request, Depends

from config import settings
from routes.auth import verify_session_token
import db.crud as crud

# Path validation constants
MEDIA_ROOT = Path(settings.media_root).resolve()
SESSION_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# Role hierarchy: higher index = more permissive
ROLE_RANK: dict[str, int] = {'viewer': 0, 'editor': 1, 'admin': 2}


async def require_auth(
    x_admin_key: Optional[str] = Header(None),
    session: Optional[str] = Cookie(None),
) -> str:
    """
    Unified auth dependency accepting either:
    1. X-Admin-Key header (for API clients)
    2. Session cookie with JWT (for browser)

    Returns the authenticated identity (username or "admin").
    """
    # Try API key first (programmatic clients)
    if x_admin_key and x_admin_key == settings.admin_api_key:
        return "admin"

    # Try session cookie (browser)
    if session:
        try:
            payload = verify_session_token(session)
            return payload["username"]
        except HTTPException:
            pass

    # Neither credential worked
    raise HTTPException(401, "Authentication required")


async def _get_auth_payload(
    x_admin_key: Optional[str] = Header(None),
    session: Optional[str] = Cookie(None),
) -> dict:
    """Internal: decode and return full JWT payload (or synthetic admin payload for API key)."""
    if x_admin_key and x_admin_key == settings.admin_api_key:
        return {"user_id": "__admin_key__", "username": "admin", "role": "admin"}
    if session:
        try:
            return verify_session_token(session)
        except HTTPException:
            pass
    raise HTTPException(401, "Authentication required")


def require_role(minimum_role: str):
    """Dependency factory enforcing a minimum role.

    Usage: some_dep: dict = Depends(require_role('admin'))
    Role hierarchy: viewer < editor < admin
    """
    async def dependency(payload: dict = Depends(_get_auth_payload)) -> dict:
        user_role = payload.get("role", "viewer")
        if ROLE_RANK.get(user_role, 0) < ROLE_RANK[minimum_role]:
            raise HTTPException(403, f"Requires {minimum_role} role or higher")
        return payload
    return dependency


def require_library_access(minimum_role: str):
    """Dependency factory for per-library role check.

    FastAPI injects `library_id` from the path parameter by name match.
    Only use on routes whose path template contains {library_id}.
    """
    async def dependency(
        library_id: str,
        payload: dict = Depends(_get_auth_payload),
    ) -> dict:
        user_role = payload.get("role", "viewer")
        if user_role == "admin":
            return payload
        user_id = payload.get("user_id")
        effective = await crud.get_effective_role(user_id, library_id)
        if ROLE_RANK.get(effective, 0) < ROLE_RANK[minimum_role]:
            raise HTTPException(403, f"Requires {minimum_role} access to this library")
        return payload
    return dependency


def validate_session_id(session_id: str):
    """Validate session_id is a valid UUID format."""
    if not SESSION_RE.match(session_id):
        raise HTTPException(400, "Invalid session_id")


def validate_path(path: str) -> Path:
    """Validate path is within MEDIA_ROOT and exists."""
    p = Path(path).resolve()
    media_root_str = str(MEDIA_ROOT)
    p_str = str(p)
    # Always enforce MEDIA_ROOT boundary
    if p_str != media_root_str and not p_str.startswith(media_root_str + "/"):
        raise HTTPException(403, "Path outside MEDIA_ROOT")
    if not p.exists():
        raise HTTPException(404, "File not found")
    return p


def get_manager(request: Request):
    """Get the TranscodeManager singleton from app state."""
    return request.app.state.manager
