"""
Authentication routes: login, logout, session validation.
Uses JWT tokens stored as HttpOnly cookies.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Cookie, Request, Response
from pydantic import BaseModel
import jwt as pyjwt
from jwt import InvalidTokenError
from passlib.context import CryptContext

from config import settings
import db.crud as crud

# Password hashing context
pwd_context = CryptContext(schemes=["scrypt"], deprecated="auto")


router = APIRouter(prefix="/api/auth", tags=["auth"])

# JWT configuration
ALGORITHM = "HS256"


class LoginRequest(BaseModel):
    """Login request with username and password."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Login response with username and role."""
    username: str
    role: str


class MeResponse(BaseModel):
    """Current user info."""
    username: str
    role: str
    display_name: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plaintext password against bcrypt hash."""
    return pwd_context.verify(plain, hashed)


def create_session_token(user_id: str, username: str, role: str, jti: str) -> str:
    """Create a JWT session token with a jti claim for server-side session tracking."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=settings.session_expiry_hours)
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "jti": jti,
        "exp": int(expires.timestamp()),
    }
    token = pyjwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return token


def verify_session_token(token: str) -> dict:
    """Verify and decode session JWT token. Does NOT check server-side session validity."""
    try:
        payload = pyjwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except InvalidTokenError:
        raise HTTPException(401, "Invalid or expired session")


async def get_session_payload(
    request: Request,
    session: Optional[str] = Cookie(None),
) -> dict:
    """Extract, verify, and validate server-side session from cookie."""
    if not session:
        raise HTTPException(401, "Not logged in")
    payload = verify_session_token(session)

    jti = payload.get("jti")
    if jti:
        if not await crud.is_session_valid(jti):
            raise HTTPException(401, "Session revoked or expired")
        await crud.touch_session(jti)

    # Check account is still active
    user_id = payload.get("user_id")
    if user_id:
        user = await crud.get_user(user_id)
        if user and not user.get("active", True):
            raise HTTPException(403, "Account suspended")

    return payload


def _get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP from request (forwarded header if set)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    """Login with username and password. Returns JWT in HttpOnly cookie."""
    user = await crud.get_user_by_username(req.username)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")

    if not user.get("active", True):
        raise HTTPException(403, "Account suspended")

    ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent")

    jti = str(uuid.uuid4())
    token = create_session_token(user["id"], user["username"], user["role"], jti)

    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(hours=settings.session_expiry_hours)).isoformat()
    await crud.create_session(jti, user["id"], expires_at, ip, user_agent)
    await crud.record_login_success(user["id"], ip, user_agent)
    await crud.write_audit(
        user["id"], user["username"], "user.login",
        target_type="user", target_id=user["id"], target_name=user["username"],
        ip=ip,
    )

    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
        max_age=settings.session_expiry_hours * 3600,
    )

    return LoginResponse(username=user["username"], role=user["role"])


@router.post("/logout")
async def logout(
    response: Response,
    session: Optional[str] = Cookie(None),
):
    """Revoke current session and clear cookie."""
    if session:
        try:
            payload = verify_session_token(session)
            jti = payload.get("jti")
            if jti:
                await crud.revoke_session(jti)
        except HTTPException:
            pass  # token invalid/expired — nothing to revoke
    response.delete_cookie("session", path="/", samesite="lax")
    return {"status": "logged out"}


@router.post("/logout-all")
async def logout_all(
    response: Response,
    payload: dict = Depends(get_session_payload),
):
    """Revoke all sessions for the current user."""
    user_id = payload["user_id"]
    count = await crud.revoke_all_sessions(user_id)
    await crud.write_audit(
        user_id, payload["username"], "session.revoke_all",
        target_type="user", target_id=user_id, target_name=payload["username"],
        detail=json.dumps({"sessions_revoked": count}),
    )
    response.delete_cookie("session", path="/", samesite="lax")
    return {"revoked": count}


@router.get("/me")
async def get_me(payload: dict = Depends(get_session_payload)):
    """Get current user from session."""
    user = await crud.get_user(payload["user_id"])
    display_name = user.get("display_name") if user else None
    return MeResponse(
        username=payload["username"],
        role=payload.get("role", "viewer"),
        display_name=display_name,
    )


@router.get("/sessions")
async def list_sessions(
    request: Request,
    payload: dict = Depends(get_session_payload),
):
    """List all active sessions for the current user."""
    sessions = await crud.get_user_sessions(payload["user_id"])
    current_jti = payload.get("jti")
    for s in sessions:
        s["is_current"] = s["id"] == current_jti
    return sessions


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    payload: dict = Depends(get_session_payload),
):
    """Revoke a specific session (must belong to the current user)."""
    sess = await crud.get_session(session_id)
    if not sess or sess["user_id"] != payload["user_id"]:
        raise HTTPException(404, "Session not found")
    await crud.revoke_session(session_id)
    return {"status": "revoked"}


@router.put("/password")
async def change_password(
    req: PasswordChangeRequest,
    session: Optional[str] = Cookie(None),
    payload: dict = Depends(get_session_payload),
):
    """Self-service password change. Requires current password."""
    if len(req.new_password) < settings.min_password_length:
        raise HTTPException(422, f"Password must be at least {settings.min_password_length} characters")

    user = await crud.get_user(payload["user_id"])
    if not user or not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(401, "Current password is incorrect")

    new_hash = hash_password(req.new_password)
    await crud.update_user_password(payload["user_id"], new_hash)
    await crud.set_pwd_changed_at(payload["user_id"])
    await crud.write_audit(
        payload["user_id"], payload["username"], "user.password_change",
        target_type="user", target_id=payload["user_id"], target_name=payload["username"],
    )
    return {"status": "password updated"}


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None


@router.patch("/profile")
async def update_profile(
    req: ProfileUpdateRequest,
    payload: dict = Depends(get_session_payload),
):
    """Self-service profile update (display name)."""
    if req.display_name is not None:
        await crud.update_user_display_name(payload["user_id"], req.display_name)
    return {"status": "updated"}
