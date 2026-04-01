"""
Public invite redemption endpoints. No auth required — invite token is the credential.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

import db.crud as crud
from config import settings
from routes.auth import hash_password, create_session_token

router = APIRouter(prefix="/api/invite", tags=["invite"])


class RedeemRequest(BaseModel):
    username: str
    password: str


@router.get("/{invite_id}")
async def get_invite(invite_id: str):
    """Validate an invite and return its metadata (role, expiry)."""
    invite = await crud.get_invite(invite_id)
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite["used_at"]:
        raise HTTPException(410, "This invite has already been used")
    now = datetime.now(timezone.utc).isoformat()
    if invite["expires_at"] < now:
        raise HTTPException(410, "This invite has expired")
    return {"role": invite["role"], "expires_at": invite["expires_at"]}


@router.post("/{invite_id}/redeem")
async def redeem_invite(invite_id: str, req: RedeemRequest, request: Request, response: Response):
    """Redeem an invite: create account, log in, return session cookie."""
    invite = await crud.get_invite(invite_id)
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite["used_at"]:
        raise HTTPException(410, "This invite has already been used")
    now_iso = datetime.now(timezone.utc).isoformat()
    if invite["expires_at"] < now_iso:
        raise HTTPException(410, "This invite has expired")

    # Validate new account
    if len(req.username.strip()) < 1:
        raise HTTPException(422, "Username is required")
    if len(req.password) < settings.min_password_length:
        raise HTTPException(422, f"Password must be at least {settings.min_password_length} characters")
    existing = await crud.get_user_by_username(req.username)
    if existing:
        raise HTTPException(409, "Username already taken")

    # Create user
    password_hash = hash_password(req.password)
    user_id = await crud.create_user(req.username, password_hash, role=invite["role"])

    # Mark invite consumed
    await crud.consume_invite(invite_id, user_id)

    # Audit
    creator = await crud.get_user(invite["created_by"])
    creator_name = creator["username"] if creator else "system"
    await crud.write_audit(
        invite["created_by"], creator_name, "user.create",
        target_type="user", target_id=user_id, target_name=req.username,
        detail='{"via": "invite"}',
        ip=request.client.host if request.client else None,
    )

    # Auto-login: create session + set cookie
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    jti = str(uuid.uuid4())
    token = create_session_token(user_id, req.username, invite["role"], jti)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(hours=settings.session_expiry_hours)
    ).isoformat()
    await crud.create_session(jti, user_id, expires_at, ip, user_agent)
    await crud.record_login_success(user_id, ip, user_agent)

    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
        max_age=settings.session_expiry_hours * 3600,
    )
    return {"username": req.username, "role": invite["role"]}
