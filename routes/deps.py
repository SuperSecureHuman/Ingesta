"""
Shared dependencies: authentication, path validation, manager access.
"""

import re
from pathlib import Path
from typing import Optional
from fastapi import Header, Cookie, HTTPException, Request

from config import settings
from routes.auth import verify_session_token

# Path validation constants
MEDIA_ROOT = Path(settings.media_root).resolve()
SESSION_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


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


def validate_session_id(session_id: str):
    """Validate session_id is a valid UUID format."""
    if not SESSION_RE.match(session_id):
        raise HTTPException(400, "Invalid session_id")


def validate_path(path: str) -> Path:
    """Validate path is within MEDIA_ROOT and exists."""
    p = Path(path).resolve()
    if MEDIA_ROOT != Path("/"):
        media_root_str = str(MEDIA_ROOT)
        p_str = str(p)
        # Allow exact match or anything under MEDIA_ROOT
        if p_str != media_root_str and not p_str.startswith(media_root_str + "/"):
            raise HTTPException(403, "Path outside MEDIA_ROOT")
    if not p.exists():
        raise HTTPException(404, "File not found")
    return p


def get_manager(request: Request):
    """Get the TranscodeManager singleton from app state."""
    return request.app.state.manager
