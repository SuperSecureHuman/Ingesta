"""
Share Link API endpoints (/api/share/*).
Provides password-protected access to projects with scoped streaming.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import shutil

from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from config import settings
import db.crud as crud
from routes.deps import require_auth, decoded_path, or_404, validate_path_boundary
from routes.luts import _extract_folder
from routes.auth import pwd_context, hash_password, verify_password, create_jwt, decode_jwt
from routes.constants import VIDEO_EXTENSIONS
from media.playlist import probe_media
from media.transcoder import TICKS_PER_SECOND, BITRATE_TIERS
from media.thumbs import get_or_generate_thumb


router = APIRouter(prefix="/api/share", tags=["shares"])

# JWT configuration
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24



def create_access_token(share: dict) -> str:
    """Create a JWT access token embedding share scope."""
    return create_jwt(
        {
            "share_id": share["id"],
            "share_type": share.get("share_type", "project"),
            "project_id": share.get("project_id", ""),
            "library_id": share.get("library_id"),
            "folder_path": share.get("folder_path"),
        },
        timedelta(hours=TOKEN_EXPIRE_HOURS),
    )


def verify_token(token: str) -> dict:
    """Verify and decode JWT token (signature + expiry only)."""
    return decode_jwt(token, error_status=401, error_msg="Invalid or expired token")


async def verify_token_full(token: str) -> dict:
    """Verify JWT and check server-side share validity (revocation + expiry)."""
    payload = verify_token(token)
    share_id = payload.get("share_id")
    if share_id and not await crud.is_share_valid(share_id):
        raise HTTPException(403, "Share has been revoked or expired")
    return payload


# ============================================================================
# LIBRARY + FOLDER SHARE CREATION (must be registered BEFORE /{project_id}/share)
# ============================================================================


class CreateShareRequest(BaseModel):
    """Request to create a share link."""
    password: str
    expires_in_days: Optional[int] = None


class CreateFolderShareRequest(BaseModel):
    """Request to create a folder share link."""
    password: str
    folder_path: str
    expires_in_days: Optional[int] = None


def _compute_expires(expires_in_days: Optional[int]) -> Optional[str]:
    if not expires_in_days:
        return None
    return (datetime.now(timezone.utc) + timedelta(days=expires_in_days)).isoformat()


def _filter_active(shares: list) -> list:
    now = datetime.now(timezone.utc)
    return [s for s in shares if not s["expires_at"] or datetime.fromisoformat(s["expires_at"]) >= now]


@router.post("/library/{library_id}/share")
async def create_library_share(
    library_id: str,
    req: CreateShareRequest,
    _auth: str = Depends(require_auth),
):
    """Create a share link for an entire library."""
    or_404(await crud.get_library(library_id), "Library")
    password_hash = hash_password(req.password)
    expires_at = _compute_expires(req.expires_in_days)
    share_id = await crud.create_share(
        project_id='',
        password_hash=password_hash,
        expires_at=expires_at,
        share_type='library',
        library_id=library_id,
    )
    return {"share_id": share_id, "expires_at": expires_at}


@router.get("/library/{library_id}/shares")
async def list_library_shares(
    library_id: str,
    _auth: str = Depends(require_auth),
):
    """List active shares for a library."""
    or_404(await crud.get_library(library_id), "Library")
    return {"shares": _filter_active(await crud.get_library_shares(library_id))}


@router.post("/folder/share")
async def create_folder_share(
    req: CreateFolderShareRequest,
    _auth: str = Depends(require_auth),
):
    """Create a share link for a folder (must be within MEDIA_ROOT)."""
    folder_path = validate_path_boundary(req.folder_path)
    p = Path(folder_path)
    if not p.exists() or not p.is_dir():
        raise HTTPException(400, "Folder does not exist")
    password_hash = hash_password(req.password)
    expires_at = _compute_expires(req.expires_in_days)
    share_id = await crud.create_share(
        project_id='',
        password_hash=password_hash,
        expires_at=expires_at,
        share_type='folder',
        folder_path=folder_path,
    )
    return {"share_id": share_id, "expires_at": expires_at}


@router.get("/folder/shares")
async def list_folder_shares(
    folder_path: str = Query(...),
    _auth: str = Depends(require_auth),
):
    """List active shares for a folder."""
    resolved = validate_path_boundary(folder_path)
    return {"shares": _filter_active(await crud.get_folder_shares(resolved))}


# ============================================================================
# SHARE CREATION (requires authenticated session)
# ============================================================================


@router.post("/{project_id}/share")
async def create_share(
    project_id: str,
    req: CreateShareRequest,
    _auth: str = Depends(require_auth),
):
    """Create a share link for a project (returns plaintext password once)."""
    project = or_404(await crud.get_project(project_id), "Project")

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
        "expires_at": expires_at,
    }


@router.get("/{project_id}/shares")
async def list_shares(
    project_id: str,
    _auth: str = Depends(require_auth),
):
    """List active shares for a project."""
    or_404(await crud.get_project(project_id), "Project")

    shares = await crud.get_project_shares(project_id)

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
    _auth: str = Depends(require_auth),
):
    """Revoke a share (mark inactive)."""
    share = or_404(await crud.get_share(share_id), "Share")

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
    token = create_access_token(share)
    return {
        "token": token,
        "expires_in_hours": TOKEN_EXPIRE_HOURS,
    }


# ============================================================================
# SCOPED SHARE ENDPOINTS (require valid JWT token)
# ============================================================================


async def get_token_payload(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
) -> dict:
    """Extract and verify JWT token from Authorization header or ?token query param."""
    if authorization:
        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise HTTPException(401, "Invalid authorization header")
        return await verify_token_full(parts[1])

    if token:
        return await verify_token_full(token)

    raise HTTPException(401, "Missing authorization")


def require_share_match(
    share_id: str,
    token: dict = Depends(get_token_payload),
) -> dict:
    """Verify the token's share_id matches the path parameter."""
    if token["share_id"] != share_id:
        raise HTTPException(status_code=403, detail="Token mismatch")
    return token


async def _validate_share_file(share: dict, file_path: str) -> str:
    """Validate file_path is within the share's scope. Returns resolved path."""
    share_type = share.get("share_type", "project")
    p = Path(file_path).resolve()

    if share_type == "project":
        record = await crud.get_project_file_by_path(share["project_id"], file_path)
        if not record:
            raise HTTPException(403, "File not in share")
        return file_path

    elif share_type == "library":
        library = await crud.get_library(share["library_id"])
        if not library:
            raise HTTPException(404, "Library not found")
        root = Path(library["root_path"]).resolve()
        if not str(p).startswith(str(root) + "/") and p != root:
            raise HTTPException(403, "File not in library")
        return file_path

    elif share_type == "folder":
        root = Path(share["folder_path"]).resolve()
        if not str(p).startswith(str(root) + "/") and p != root:
            raise HTTPException(403, "File not in folder")
        return file_path

    raise HTTPException(403, "Unknown share type")


def _paths_to_share_files(file_paths: list, root_path: str) -> list:
    """Build share file list from filesystem paths (for library/folder shares)."""
    files = []
    root = Path(root_path).resolve()
    for p in file_paths:
        try:
            stat = p.stat()
            try:
                rel = str(p.resolve().relative_to(root))
            except ValueError:
                rel = p.name
            files.append({
                "id": str(p),  # no DB id for these files
                "file_path": str(p.resolve()),
                "relative_path": rel,
                "file_size": stat.st_size,
                "duration_seconds": None,
                "width": None,
                "height": None,
                "bitrate": None,
                "video_codec": None,
                "scan_status": "pending",
                "tags": [],
                "rating": None,
                "comments": [],
                "markers": [],
            })
        except OSError:
            continue
    return files


@router.get("/{share_id}/files")
async def list_share_files(
    share_id: str,
    token: dict = Depends(require_share_match),
):
    """List all files in the shared scope, including annotations."""
    share = await crud.get_share(share_id)
    if not share:
        raise HTTPException(404, "Share not found")

    share_type = share.get("share_type", "project")

    if share_type == "project":
        project, files_raw = await asyncio.gather(
            crud.get_project(token["project_id"]),
            crud.get_project_files(token["project_id"]),
        )
        file_paths = [f["file_path"] for f in files_raw]
        annotations = await crud.get_annotations_for_paths(file_paths)

        file_list = []
        for f in files_raw:
            ann = annotations.get(f["file_path"], {})
            try:
                rel = str(Path(f["file_path"]).relative_to(Path(settings.media_root).resolve()))
            except ValueError:
                rel = Path(f["file_path"]).name
            file_list.append({
                "id": f["id"],
                "file_path": f["file_path"],
                "relative_path": rel,
                "file_size": f["file_size"],
                "duration_seconds": f["duration_seconds"],
                "width": f["width"],
                "height": f["height"],
                "bitrate": f["bitrate"],
                "video_codec": f["video_codec"],
                "scan_status": f["scan_status"],
                "tags": ann.get("tags", []),
                "rating": ann.get("rating"),
                "comments": ann.get("comments", []),
                "markers": ann.get("markers", []),
            })

        share_name = project["name"] if project else None

    elif share_type == "library":
        library = await crud.get_library(share["library_id"])
        if not library:
            raise HTTPException(404, "Library not found")
        root = Path(library["root_path"])
        video_paths = [p for p in root.rglob("*") if p.suffix.lower() in VIDEO_EXTENSIONS and p.is_file()]
        video_paths.sort(key=lambda p: str(p))
        file_list_raw = _paths_to_share_files(video_paths, library["root_path"])

        all_paths = [f["file_path"] for f in file_list_raw]
        annotations = await crud.get_annotations_for_paths(all_paths)
        for f in file_list_raw:
            ann = annotations.get(f["file_path"], {})
            f["tags"] = ann.get("tags", [])
            f["rating"] = ann.get("rating")
            f["comments"] = ann.get("comments", [])
            f["markers"] = ann.get("markers", [])
        file_list = file_list_raw
        share_name = library["name"]

    elif share_type == "folder":
        folder = Path(share["folder_path"])
        if not folder.exists():
            raise HTTPException(404, "Folder not found")
        video_paths = [p for p in folder.rglob("*") if p.suffix.lower() in VIDEO_EXTENSIONS and p.is_file()]
        video_paths.sort(key=lambda p: str(p))
        file_list_raw = _paths_to_share_files(video_paths, share["folder_path"])

        all_paths = [f["file_path"] for f in file_list_raw]
        annotations = await crud.get_annotations_for_paths(all_paths)
        for f in file_list_raw:
            ann = annotations.get(f["file_path"], {})
            f["tags"] = ann.get("tags", [])
            f["rating"] = ann.get("rating")
            f["comments"] = ann.get("comments", [])
            f["markers"] = ann.get("markers", [])
        file_list = file_list_raw
        share_name = folder.name

    else:
        raise HTTPException(400, "Unknown share type")

    return {
        "share_name": share_name,
        "expires_at": share["expires_at"],
        "files": file_list,
    }


@router.get("/{share_id}/probe")
async def share_probe(
    share_id: str,
    path: str = Depends(decoded_path),
    token: dict = Depends(require_share_match),
):
    """Probe file in shared scope."""
    try:
        share = await crud.get_share(share_id)
        await _validate_share_file(share, path)

        # Try cached probe results for project shares
        if share.get("share_type", "project") == "project":
            file_record = await crud.get_project_file_by_path(token["project_id"], path)
            if file_record and file_record["scan_status"] == "done" and all(
                file_record.get(k) is not None
                for k in ["duration_seconds", "width", "height", "bitrate", "video_codec"]
            ):
                return {
                    "duration_seconds": file_record["duration_seconds"],
                    "duration_ticks": int(file_record["duration_seconds"] * 10_000_000),
                    "width": file_record["width"],
                    "height": file_record["height"],
                    "bitrate": file_record["bitrate"],
                    "video_codec": file_record["video_codec"],
                    "pix_fmt": None,
                    "bit_depth": None,
                    "audio_codec": None,
                }

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
    path: str = Depends(decoded_path),
    quality: str = Query("720p"),
    segment_length: int = Query(6, ge=1, le=60),
    token: dict = Depends(require_share_match),
):
    """Generate HLS playlist for shared scope file."""
    try:
        share = await crud.get_share(share_id)
        await _validate_share_file(share, path)

        # Import here to avoid circular dependency
        from media.transcoder import get_bitrate_preset
        from media.playlist import compute_equal_length_segments, build_vod_playlist

        # Validate quality
        if quality != "source":
            try:
                get_bitrate_preset(quality)
            except ValueError:
                raise ValueError(f"Unknown quality: {quality}")

        # Try cached probe for project shares
        duration_seconds = None
        if share.get("share_type", "project") == "project":
            file_record = await crud.get_project_file_by_path(token["project_id"], path)
            if file_record and file_record["scan_status"] == "done" and file_record.get("duration_seconds"):
                duration_seconds = file_record["duration_seconds"]

        if duration_seconds is None:
            info = await probe_media(path)
            duration_seconds = info.duration_seconds

        duration_ticks = int(duration_seconds * 10_000_000)

        # Compute segments
        segments = compute_equal_length_segments(duration_ticks, segment_length)

        # Build playlist with share-scoped segment URLs so auth works
        playlist_text = build_vod_playlist(
            stream_id, segments, segment_length, quote(path), quality,
            segment_base_url=f"/api/share/{share_id}/segment",
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
    path: str = Depends(decoded_path),
    quality: str = Query("720p"),
    segment_length: int = Query(6, ge=1, le=60),
    runtimeTicks: int = Query(None),
    actualSegmentLengthTicks: int = Query(None),
    token: dict = Depends(require_share_match),
):
    """
    Stream segment for shared scope file.
    Reuses transcoding infrastructure from main endpoints.
    """
    try:
        share = await crud.get_share(share_id)
        await _validate_share_file(share, path)

        # Delegate to main segment endpoint with same logic
        # Import manager here to avoid circular dependency
        from main import manager
        from media.transcoder import (
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
    path: str = Depends(decoded_path),
    t: float = Query(0),
    w: int = Query(320, ge=1, le=1920),
    token: dict = Depends(require_share_match),
):
    """Get thumbnail for shared scope file."""
    try:
        share = await crud.get_share(share_id)
        await _validate_share_file(share, path)

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
    path: str = Depends(decoded_path),
    token: dict = Depends(require_share_match),
):
    """Download original file from shared scope."""
    try:
        share = await crud.get_share(share_id)
        await _validate_share_file(share, path)

        p = Path(path).resolve()
        if not p.exists() or not p.is_file():
            raise HTTPException(404, "File not found")

        # For project shares, enforce DB-recorded path matches to guard against symlink traversal
        if share.get("share_type", "project") == "project":
            file_record = await crud.get_project_file_by_path(share["project_id"], path)
            if file_record:
                recorded = Path(file_record["file_path"]).resolve()
                if p != recorded:
                    raise HTTPException(403, "Path mismatch")

        filename = p.name
        return FileResponse(
            p,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{quote(filename, safe="")}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/{share_id}/capabilities")
async def share_capabilities(
    share_id: str,
    request: Request,
    token: dict = Depends(require_share_match),
):
    """Return server capabilities for share viewers (same data as /api/capabilities)."""
    luts = await crud.get_all_luts()
    return JSONResponse(
        content={
            "hardware": request.app.state.hardware,
            "bitrate_tiers": BITRATE_TIERS,
            "luts": [{**lut, "folder": _extract_folder(lut["file_path"])} for lut in luts],
        },
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.post("/{share_id}/stop/{stream_id}")
async def share_stop(
    share_id: str,
    stream_id: str,
    request: Request,
    token: dict = Depends(require_share_match),
):
    """Stop a transcoding session started by a share viewer."""
    from routes.deps import validate_session_id
    validate_session_id(stream_id)

    manager = request.app.state.manager
    job = manager.get_job(stream_id)
    if job:
        await manager.kill_ffmpeg(job, reason="stop_request")
        manager._jobs.pop(stream_id, None)
        manager._locks.pop(stream_id, None)
        shutil.rmtree(job.work_dir, ignore_errors=True)
    return {"status": "ok"}
