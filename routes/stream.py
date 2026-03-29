"""
Stream/Media API endpoints: probe, playlist, segment, thumbnails, capabilities.
Handles on-demand transcoding, seeking, and media metadata.
"""

import json
import shutil
import asyncio
from pathlib import Path
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, Query, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse

from media.transcoder import (
    TranscodeManager,
    TranscodeJob,
    get_current_transcode_index,
    BITRATE_TIERS,
    get_bitrate_preset,
    TICKS_PER_SECOND,
)
from media.playlist import probe_media, compute_equal_length_segments, build_vod_playlist
from media.thumbs import get_or_generate_thumb
from routes.deps import validate_path, validate_session_id, get_manager, MEDIA_ROOT, require_auth
from routes.utils import async_iterdir
from logger import get_logger
from db import crud

router = APIRouter(prefix="/api")
logger = get_logger("routes.stream")


@router.get("/probe")
async def probe(path: str = Query(...), stream_id: str = Query(None), _auth: str = Depends(require_auth)):
    """Probe media file for duration, resolution, and bitrate."""
    try:
        if stream_id:
            validate_session_id(stream_id)
        path = unquote(path)
        validate_path(path)
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
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/browse")
async def browse(path: str = Query("/"), _auth: str = Depends(require_auth)):
    """List directory contents for file browser."""
    try:
        path = unquote(path)
        p = validate_path(path)
        if not p.is_dir():
            raise HTTPException(status_code=400, detail="Not a directory")

        entries = []
        for entry in await async_iterdir(p):
            entries.append(
                {
                    "name": entry.name,
                    "path": str(entry),
                    "is_dir": entry.is_dir(),
                    "is_video": entry.suffix.lower()
                    in {
                        ".mp4",
                        ".mkv",
                        ".avi",
                        ".mov",
                        ".m4v",
                        ".ts",
                        ".wmv",
                        ".flv",
                        ".webm",
                        ".mpeg",
                        ".mpg",
                    },
                }
            )

        return {
            "path": str(p),
            "parent": str(p.parent) if p != p.parent else None,
            "entries": entries,
        }
    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/bitrate-tiers")
async def bitrate_tiers(bitrate: int = Query(None), height: int = Query(None), _auth: str = Depends(require_auth)):
    """Get available bitrate tiers filtered by source constraints."""
    tiers = []
    for tier in BITRATE_TIERS:
        # Check if tier is below source bitrate and height
        bitrate_ok = bitrate is None or tier["bitrate"] < bitrate
        height_ok = (
            height is None or tier["max_height"] is None or tier["max_height"] <= height
        )
        if bitrate_ok and height_ok:
            tiers.append(tier)

    return JSONResponse(
        content={"tiers": tiers},
        headers={"Cache-Control": "public, max-age=300"}
    )


@router.get("/playlist/{stream_id}/main.m3u8")
async def get_playlist(
    stream_id: str,
    path: str = Query(...),
    quality: str = Query("720p"),
    segment_length: int = Query(6),
    lut_id: str = Query(None),
    _auth: str = Depends(require_auth),
):
    """Generate VOD m3u8 playlist (pre-computed, no FFmpeg)."""
    try:
        validate_session_id(stream_id)
        path = unquote(path)
        validate_path(path)

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

        # Build playlist with per-segment runtimeTicks
        playlist_text = build_vod_playlist(
            stream_id, segments, segment_length, quote(path), quality, lut_id
        )

        return StreamingResponse(
            iter([playlist_text]),
            media_type="application/vnd.apple.mpegurl",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/segment/{stream_id}/{segment_id}.ts")
async def get_segment(
    stream_id: str,
    segment_id: int,
    path: str = Query(...),
    quality: str = Query("720p"),
    segment_length: int = Query(6),
    lut_id: str = Query(None),
    runtimeTicks: int = Query(None),
    actualSegmentLengthTicks: int = Query(None),
    background_tasks: BackgroundTasks = None,
    manager: TranscodeManager = Depends(get_manager),
    _auth: str = Depends(require_auth),
):
    """On-demand segment handler (core seeking + transcoding logic)."""
    try:
        validate_session_id(stream_id)
        path = unquote(path)
        validate_path(path)

        # Concurrent stream guard (max 10 active FFmpeg processes)
        active_count = sum(1 for j in manager.get_all_jobs() if not j.has_exited)
        if active_count >= 10:
            raise HTTPException(status_code=503, detail="Too many active streams")

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
                background_tasks.add_task(
                    manager.request_end,
                    job,
                    runtimeTicks,
                    actualSegmentLengthTicks,
                )
            return FileResponse(segment_path, media_type="video/mp2t")

        # Acquire per-stream lock
        lock = manager.get_lock(stream_id)
        async with lock:
            # Double-check inside lock
            if segment_path.exists():
                job = manager.get_job(stream_id)
                if job:
                    await manager.request_begin(job)
                    background_tasks.add_task(
                        manager.request_end,
                        job,
                        runtimeTicks,
                        actualSegmentLengthTicks,
                    )
                return FileResponse(segment_path, media_type="video/mp2t")

            # Get current transcoding index
            current_index = get_current_transcode_index(work_dir, stream_id)

            # Decide whether to restart transcoding
            job = manager.get_job(stream_id)
            start_transcoding = False

            if job is None:
                # No active job
                start_transcoding = True
            else:
                # Compare with current index
                gap_threshold = 24 / segment_length
                if current_index is None:
                    start_transcoding = True
                elif segment_id < current_index:
                    # Backward seek
                    start_transcoding = True
                elif segment_id - current_index > gap_threshold:
                    # Forward seek beyond threshold
                    start_transcoding = True

            if start_transcoding:
                # Create or reuse job
                if job is None:
                    # Resolve LUT file path if lut_id is provided
                    lut_path = None
                    if lut_id:
                        lut_path = await crud.get_lut_file_path(lut_id)
                        if not lut_path:
                            raise ValueError(f"LUT not found: {lut_id}")

                    logger.info(
                        "Starting new stream",
                        extra={
                            "stream_id": stream_id,
                            "quality": quality,
                            "segment_id": segment_id,
                        },
                    )
                    job = TranscodeJob(
                        stream_id=stream_id,
                        source_path=path,
                        quality=quality,
                        segment_length=segment_length,
                        lut_path=lut_path,
                        work_dir=work_dir,
                    )
                    await manager.register_job(job)
                else:
                    # Quality change - log the transition
                    logger.info(
                        "Quality changed",
                        extra={
                            "stream_id": stream_id,
                            "old_quality": job.quality,
                            "new_quality": quality,
                        },
                    )

                # Spawn FFmpeg
                success = await manager.spawn_ffmpeg(job, seek_time_sec, segment_id)
                if not success:
                    raise RuntimeError("Failed to spawn FFmpeg")

                # Emit seek event if applicable
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
                # Continue with existing transcode
                pass

            # Request begin
            await manager.request_begin(job)

        # OUTSIDE LOCK: Poll for segment readiness with proper cleanup
        try:
            if not await manager.wait_for_segment(job, segment_path, next_segment_path):
                raise HTTPException(
                    status_code=504, detail="Segment generation timeout"
                )

            # Emit served event
            await manager.broadcast_event(
                {
                    "type": "served",
                    "stream_id": stream_id,
                    "segment_id": segment_id,
                    "from_cache": False,
                }
            )

            return FileResponse(segment_path, media_type="video/mp2t")
        except FileNotFoundError:
            # Segment file was deleted (e.g., cleanup or stream stopped)
            logger.debug(
                "Segment file not found",
                extra={"stream_id": stream_id, "segment_id": segment_id},
            )
            raise HTTPException(status_code=404, detail="Segment not available")
        finally:
            background_tasks.add_task(
                manager.request_end,
                job,
                runtimeTicks,
                actualSegmentLengthTicks or 0,
            )

    except HTTPException:
        # Re-raise HTTP exceptions as-is (like 504 timeout)
        raise
    except Exception as e:
        err_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(
            f"Error generating segment",
            extra={
                "stream_id": stream_id,
                "segment_id": segment_id,
                "quality": quality,
            },
            exc_info=True,
        )
        await manager.broadcast_event(
            {
                "type": "error",
                "stream_id": stream_id,
                "message": err_msg,
            }
        )
        raise HTTPException(status_code=500, detail=err_msg)


@router.post("/stop/{stream_id}")
async def stop_stream(stream_id: str, manager: TranscodeManager = Depends(get_manager), _auth: str = Depends(require_auth)):
    """Kill FFmpeg for this stream (idempotent - OK even if not running)."""
    validate_session_id(stream_id)
    job = manager.get_job(stream_id)
    if job:
        logger.info(
            "Stopping stream",
            extra={"stream_id": stream_id, "quality": job.quality},
        )
        await manager.kill_ffmpeg(job, reason="stop_request")
        if stream_id in manager._jobs:
            del manager._jobs[stream_id]
        if stream_id in manager._locks:
            del manager._locks[stream_id]
        # Delete work directory so quality changes start clean (no stale segments)
        shutil.rmtree(job.work_dir, ignore_errors=True)
        return {"status": "stopped"}
    else:
        return {"status": "ok"}  # Already stopped or never existed


@router.post("/ping/{session_id}")
async def ping(session_id: str, manager: TranscodeManager = Depends(get_manager), _auth: str = Depends(require_auth)):
    """Keep-alive ping endpoint (Jellyfin pattern)."""
    validate_session_id(session_id)
    job = manager.get_job(session_id)
    if job:
        await manager.request_begin(job)
        await manager.request_end(job, 0, 0)
    return {"ok": True}


@router.get("/capabilities")
async def capabilities(request: Request, _auth: str = Depends(require_auth)):
    """Get server capabilities including hardware support and media root."""
    return JSONResponse(
        content={
            "media_root": str(MEDIA_ROOT),
            "hardware": request.app.state.hardware,
            "bitrate_tiers": BITRATE_TIERS,
        },
        headers={"Cache-Control": "public, max-age=3600"}
    )


@router.get("/thumb")
async def get_thumb(path: str = Query(...), t: float = Query(0), w: int = Query(320), _auth: str = Depends(require_auth)):
    """Get or generate thumbnail at time offset t (seconds), width w."""
    try:
        path = unquote(path)
        validate_path(path)

        thumb_path = await get_or_generate_thumb(path, t, w)
        if not thumb_path:
            raise HTTPException(status_code=500, detail="Failed to extract thumbnail")

        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "max-age=86400"},  # 1 day
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/poster")
async def get_poster(path: str = Query(...), _auth: str = Depends(require_auth)):
    """Get poster frame at 10% into video (or 10s min), width 640."""
    try:
        path = unquote(path)
        validate_path(path)

        # Probe duration
        info = await probe_media(path)
        duration_sec = info.duration_ticks / TICKS_PER_SECOND
        offset_sec = min(max(duration_sec * 0.1, 10), duration_sec - 1)

        thumb_path = await get_or_generate_thumb(path, offset_sec, 640)
        if not thumb_path:
            raise HTTPException(status_code=500, detail="Failed to extract poster")

        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "max-age=86400"},  # 1 day
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
