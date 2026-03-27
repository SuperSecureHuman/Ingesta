"""
Shared authentication dependencies.
Accepts either X-Admin-Key header (for programmatic clients) or session cookie (for browser).
"""

from typing import Optional
from fastapi import Header, Cookie, HTTPException

from config import settings
from routes.auth import verify_session_token


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
