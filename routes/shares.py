"""
Share Link API endpoints (/api/share/*).
Provides password-protected access to projects with scoped streaming.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import hashlib
from jose import JWTError, jwt

from config import settings
import db.crud as crud
from playlist import probe_media
from transcoder import TICKS_PER_SECOND
from thumbs import get_or_generate_thumb


router = APIRouter(prefix="/api/share", tags=["shares"])

# JWT configuration
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    """Hash a plaintext password using SHA256."""
    # For POC purposes, use SHA256. In production, use bcrypt/argon2.
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plaintext password against hash."""
    return hashlib.sha256(plain.encode()).hexdigest() == hashed


def create_access_token(share_id: str, project_id: str) -> str:
    """Create a JWT access token."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "share_id": share_id,
        "project_id": project_id,
        "exp": expires.timestamp(),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return token


def verify_token(token: str) -> dict:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")


# ============================================================================
# SHARE CREATION (requires ADMIN_API_KEY)
# ============================================================================


def require_admin_key(x_admin_key: Optional[str] = None) -> str:
    """Dependency to validate ADMIN_API_KEY header."""
    if not x_admin_key or x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing ADMIN_API_KEY")
    return x_admin_key


class CreateShareRequest(BaseModel):
    """Request to create a share link."""

    password: str
    expires_in_days: Optional[int] = None


@router.post("/{project_id}/share")
async def create_share(
    project_id: str,
    req: CreateShareRequest,
    admin_key: str = Depends(require_admin_key),
):
    """Create a share link for a project (returns plaintext password once)."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    password_hash = hash_password(req.password)
    expires_at = None
    if req.expires_in_days:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=req.expires_in_days)
        ).isoformat()

    share_id = await crud.create_share(
        project_id=project_id,
        password_hash=password_hash,
        expires_at=expires_at,
    )

    return {
        "share_id": share_id,
        "password": req.password,
        "expires_at": expires_at,
    }


@router.get("/{project_id}/shares")
async def list_shares(
    project_id: str,
    admin_key: str = Depends(require_admin_key),
):
    """List active shares for a project."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    shares = await crud.get_project_shares(project_id)

    # Filter out password hashes and check expiry
    now = datetime.now(timezone.utc)
    result = []
    for share in shares:
        if share["expires_at"]:
            expires = datetime.fromisoformat(share["expires_at"])
            if expires < now:
                continue
        result.append(
            {
                "id": share["id"],
                "project_id": share["project_id"],
                "created_at": share["created_at"],
                "expires_at": share["expires_at"],
            }
        )

    return {"shares": result}


@router.delete("/{share_id}")
async def revoke_share(
    share_id: str,
    admin_key: str = Depends(require_admin_key),
):
    """Revoke a share (mark inactive)."""
    share = await crud.get_share(share_id)
    if not share:
        raise HTTPException(404, "Share not found")

    await crud.revoke_share(share_id)
    return {"status": "revoked"}


# ============================================================================
# SHARE AUTHENTICATION (public, no API key needed)
# ============================================================================


class AuthRequest(BaseModel):
    """Password submission for share access."""

    password: str


@router.post("/{share_id}/auth")
async def authenticate_share(share_id: str, req: AuthRequest):
    """Submit password and receive JWT token."""
    share = await crud.get_share(share_id)
    if not share:
        raise HTTPException(404, "Share not found")

    # Check if active
    if not share["active"]:
        raise HTTPException(403, "Share has been revoked")

    # Check if expired
    if share["expires_at"]:
        expires = datetime.fromisoformat(share["expires_at"])
        if expires < datetime.now(timezone.utc):
            raise HTTPException(403, "Share has expired")

    # Verify password
    if not verify_password(req.password, share["password_hash"]):
        raise HTTPException(401, "Incorrect password")

    # Generate token
    token = create_access_token(share_id, share["project_id"])
    return {
        "token": token,
        "expires_in_hours": TOKEN_EXPIRE_HOURS,
    }


# ============================================================================
# SCOPED SHARE ENDPOINTS (require valid JWT token)
# ============================================================================


def get_token_payload(authorization: Optional[str] = Header(None)) -> dict:
    """Extract and verify JWT token from Authorization header."""
    if not authorization:
        raise HTTPException(401, "Missing authorization header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(401, "Invalid authorization header")

    token = parts[1]
    return verify_token(token)


async def validate_file_in_project(project_id: str, file_path: str) -> str:
    """
    Validate that a file path belongs to the given project.
    Returns the absolute file path if valid.
    """
    files = await crud.get_project_files(project_id)
    for f in files:
        if f["file_path"] == file_path:
            # File is in project, return it
            return f["file_path"]

    raise HTTPException(403, "File not in project")


@router.get("/{share_id}/files")
async def list_share_files(
    share_id: str,
    token: dict = Depends(get_token_payload),
):
    """List all files in the shared project."""
    # Verify token matches share
    if token["share_id"] != share_id:
        raise HTTPException(403, "Token mismatch")

    # Get files for this project
    files = await crud.get_project_files(token["project_id"])

    # Return file info (excluding scan_error from response)
    return {
        "files": [
            {
                "id": f["id"],
                "file_path": f["file_path"],
                "file_size": f["file_size"],
                "duration_seconds": f["duration_seconds"],
                "width": f["width"],
                "height": f["height"],
                "bitrate": f["bitrate"],
                "video_codec": f["video_codec"],
                "scan_status": f["scan_status"],
            }
            for f in files
        ]
    }


@router.get("/{share_id}/probe")
async def share_probe(
    share_id: str,
    path: str = Query(...),
    token: dict = Depends(get_token_payload),
):
    """Probe file in shared project."""
    if token["share_id"] != share_id:
        raise HTTPException(403, "Token mismatch")

    try:
        path = unquote(path)
        await validate_file_in_project(token["project_id"], path)

        info = await probe_media(path)
        return {
            "duration_seconds": info.duration_seconds,
            "duration_ticks": info.duration_ticks,
            "width": info.width,
            "height": info.height,
            "bitrate": info.bitrate,
            "video_codec": info.video_codec,
            "pix_fmt": info.pix_fmt,
            "bit_depth": info.bit_depth,
            "audio_codec": info.audio_codec,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/{share_id}/playlist/{stream_id}/main.m3u8")
async def share_playlist(
    share_id: str,
    stream_id: str,
    path: str = Query(...),
    quality: str = Query("720p"),
    segment_length: int = Query(6),
    token: dict = Depends(get_token_payload),
):
    """Generate HLS playlist for shared project file."""
    if token["share_id"] != share_id:
        raise HTTPException(403, "Token mismatch")

    try:
        path = unquote(path)
        await validate_file_in_project(token["project_id"], path)

        # Import here to avoid circular dependency
        from transcoder import get_bitrate_preset
        from playlist import compute_equal_length_segments, build_vod_playlist

        # Validate quality
        if quality != "source":
            try:
                get_bitrate_preset(quality)
            except ValueError:
                raise ValueError(f"Unknown quality: {quality}")

        # Probe media
        info = await probe_media(path)

        # Compute segments
        segments = compute_equal_length_segments(info.duration_ticks, segment_length)

        # Build playlist
        playlist_text = build_vod_playlist(
            stream_id, segments, segment_length, quote(path), quality
        )

        return StreamingResponse(
            iter([playlist_text]),
            media_type="application/vnd.apple.mpegurl",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/{share_id}/segment/{stream_id}/{segment_id}.ts")
async def share_segment(
    share_id: str,
    stream_id: str,
    segment_id: int,
    path: str = Query(...),
    quality: str = Query("720p"),
    segment_length: int = Query(6),
    runtimeTicks: int = Query(None),
    actualSegmentLengthTicks: int = Query(None),
    token: dict = Depends(get_token_payload),
):
    """
    Stream segment for shared project file.
    Reuses transcoding infrastructure from main endpoints.
    """
    if token["share_id"] != share_id:
        raise HTTPException(403, "Token mismatch")

    try:
        path = unquote(path)
        await validate_file_in_project(token["project_id"], path)

        # Delegate to main segment endpoint with same logic
        # Import manager here to avoid circular dependency
        from main import manager
        from transcoder import (
            TranscodeJob,
            get_current_transcode_index,
            get_bitrate_preset,
        )

        # Concurrent stream guard
        active_count = sum(1 for j in manager.get_all_jobs() if not j.has_exited)
        if active_count >= 10:
            raise HTTPException(503, "Too many active streams")

        # Validate quality
        if quality != "source":
            try:
                get_bitrate_preset(quality)
            except ValueError:
                raise ValueError(f"Unknown quality: {quality}")

        if runtimeTicks is None or actualSegmentLengthTicks is None:
            raise ValueError("runtimeTicks and actualSegmentLengthTicks are required")

        seek_time_sec = runtimeTicks / TICKS_PER_SECOND

        # Create work directory
        work_dir = Path(f"/tmp/hls_srv/{stream_id}")
        segment_path = work_dir / f"{stream_id}{segment_id}.ts"
        next_segment_path = work_dir / f"{stream_id}{segment_id + 1}.ts"

        # FAST PATH: segment already on disk
        if segment_path.exists():
            job = manager.get_job(stream_id)
            if job:
                await manager.request_begin(job)
                # Can't use background_tasks in this context, so just record the stats
                # The cleanup loop will handle old segments
            return FileResponse(segment_path, media_type="video/mp2t")

        # Acquire per-stream lock
        lock = manager.get_lock(stream_id)
        async with lock:
            # Double-check inside lock
            if segment_path.exists():
                job = manager.get_job(stream_id)
                if job:
                    await manager.request_begin(job)
                return FileResponse(segment_path, media_type="video/mp2t")

            # Get current transcoding index
            current_index = get_current_transcode_index(work_dir, stream_id)

            # Decide whether to restart transcoding
            job = manager.get_job(stream_id)
            start_transcoding = False

            if job is None:
                start_transcoding = True
            else:
                gap_threshold = 24 / segment_length
                if current_index is None:
                    start_transcoding = True
                elif segment_id < current_index:
                    start_transcoding = True
                elif segment_id - current_index > gap_threshold:
                    start_transcoding = True

            if start_transcoding:
                if job is None:
                    job = TranscodeJob(
                        stream_id=stream_id,
                        source_path=path,
                        quality=quality,
                        segment_length=segment_length,
                        work_dir=work_dir,
                    )
                    await manager.register_job(job)

                success = await manager.spawn_ffmpeg(job, seek_time_sec, segment_id)
                if not success:
                    raise RuntimeError("Failed to spawn FFmpeg")

                if current_index is not None:
                    await manager.broadcast_event(
                        {
                            "type": "seek",
                            "stream_id": stream_id,
                            "from_segment": current_index,
                            "to_segment": segment_id,
                            "seek_time_sec": seek_time_sec,
                        }
                    )
            else:
                pass

            await manager.request_begin(job)

        # Poll for segment readiness
        try:
            if not await manager.wait_for_segment(job, segment_path, next_segment_path):
                raise HTTPException(504, "Segment generation timeout")

            await manager.broadcast_event(
                {
                    "type": "served",
                    "stream_id": stream_id,
                    "segment_id": segment_id,
                    "from_cache": False,
                }
            )

            return FileResponse(segment_path, media_type="video/mp2t")
        except Exception as e:
            await manager.broadcast_event(
                {
                    "type": "error",
                    "stream_id": stream_id,
                    "message": str(e),
                }
            )
            raise

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/{share_id}/thumb")
async def share_thumb(
    share_id: str,
    path: str = Query(...),
    t: float = Query(0),
    w: int = Query(320),
    token: dict = Depends(get_token_payload),
):
    """Get thumbnail for shared project file."""
    if token["share_id"] != share_id:
        raise HTTPException(403, "Token mismatch")

    try:
        path = unquote(path)
        await validate_file_in_project(token["project_id"], path)

        thumb_path = await get_or_generate_thumb(path, t, w)
        if not thumb_path:
            raise HTTPException(500, "Failed to extract thumbnail")

        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "max-age=86400"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/{share_id}/download")
async def share_download(
    share_id: str,
    path: str = Query(...),
    token: dict = Depends(get_token_payload),
):
    """Download original file from shared project."""
    if token["share_id"] != share_id:
        raise HTTPException(403, "Token mismatch")

    try:
        path = unquote(path)
        await validate_file_in_project(token["project_id"], path)

        p = Path(path).resolve()
        if not p.exists() or not p.is_file():
            raise HTTPException(404, "File not found")

        filename = p.name
        return FileResponse(
            p,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))
