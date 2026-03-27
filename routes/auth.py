"""
Authentication routes: login, logout, session validation.
Uses JWT tokens stored as HttpOnly cookies.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Cookie, Response
from pydantic import BaseModel
from jose import jwt, JWTError
import hashlib

from config import settings
import db.crud as crud


router = APIRouter(prefix="/api/auth", tags=["auth"])

# JWT configuration
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8


class LoginRequest(BaseModel):
    """Login request with username and password."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Login response with username and API key."""
    username: str
    admin_api_key: str


class MeResponse(BaseModel):
    """Current user info."""
    username: str


def hash_password(password: str) -> str:
    """Hash a password using SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plaintext password against hash."""
    return hashlib.sha256(plain.encode()).hexdigest() == hashed


def create_session_token(user_id: str, username: str) -> str:
    """Create a JWT session token."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": expires.timestamp(),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return token


def verify_session_token(token: str) -> dict:
    """Verify and decode session JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(401, "Invalid or expired session")


async def get_session_payload(session: Optional[str] = Cookie(None)) -> dict:
    """Extract and verify session from cookie."""
    if not session:
        raise HTTPException(401, "Not logged in")
    return verify_session_token(session)


@router.post("/login")
async def login(req: LoginRequest, response: Response):
    """Login with username and password. Returns JWT in HttpOnly cookie."""
    user = await crud.get_user_by_username(req.username)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")

    token = create_session_token(user["id"], user["username"])

    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=TOKEN_EXPIRE_HOURS * 3600,
    )

    return LoginResponse(
        username=user["username"],
        admin_api_key=settings.admin_api_key,
    )


@router.post("/logout")
async def logout(response: Response):
    """Clear session cookie."""
    response.delete_cookie("session", path="/", samesite="lax")
    return {"status": "logged out"}


@router.get("/me")
async def get_me(payload: dict = Depends(get_session_payload)):
    """Get current user from session."""
    return MeResponse(username=payload["username"])
