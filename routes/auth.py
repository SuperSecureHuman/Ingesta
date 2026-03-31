"""
Authentication routes: login, logout, session validation.
Uses JWT tokens stored as HttpOnly cookies.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Cookie, Response
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
TOKEN_EXPIRE_HOURS = 8


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


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plaintext password against bcrypt hash."""
    return pwd_context.verify(plain, hashed)


def create_session_token(user_id: str, username: str, role: str) -> str:
    """Create a JWT session token."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": int(expires.timestamp()),
    }
    token = pyjwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return token


def verify_session_token(token: str) -> dict:
    """Verify and decode session JWT token."""
    try:
        payload = pyjwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except InvalidTokenError:
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

    token = create_session_token(user["id"], user["username"], user["role"])

    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
        max_age=TOKEN_EXPIRE_HOURS * 3600,
    )

    return LoginResponse(
        username=user["username"],
        role=user["role"],
    )


@router.post("/logout")
async def logout(response: Response):
    """Clear session cookie."""
    response.delete_cookie("session", path="/", samesite="lax")
    return {"status": "logged out"}


@router.get("/me")
async def get_me(payload: dict = Depends(get_session_payload)):
    """Get current user from session."""
    return MeResponse(username=payload["username"], role=payload.get("role", "viewer"))
