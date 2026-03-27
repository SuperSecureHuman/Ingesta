"""
FastAPI HLS POC server with on-demand transcoding and dynamic seeking.
"""

import asyncio
import json
import os
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote, unquote

from fastapi import FastAPI, Query, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from playlist import probe_media, compute_equal_length_segments, build_vod_playlist
from transcoder import (
    TranscodeManager,
    TranscodeJob,
    make_stream_id,
    get_current_transcode_index,
    BITRATE_TIERS,
    get_bitrate_preset,
    TICKS_PER_SECOND,
    probe_hardware,
    select_encoder,
)
from thumbs import get_or_generate_thumb

MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", "/")).resolve()
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT_STREAMS", "10"))
SESSION_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


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


manager = TranscodeManager()


async def cleanup_loop():
    """Periodically clean up old segments."""
    while True:
        await asyncio.sleep(20)
        for job in list(manager.get_all_jobs()):
            await manager.cleanup_segments(job, keep_seconds=120)


async def cleanup_old_workdirs():
    """Clean up work directories older than 1 hour."""
    while True:
        await asyncio.sleep(300)  # every 5 minutes
        cutoff = time.time() - 3600  # 1 hour old
        try:
            for d in Path("/tmp/hls_srv").iterdir():
                if d.is_dir() and d.stat().st_mtime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
        except FileNotFoundError:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # Startup
    shutil.rmtree("/tmp/hls_srv", ignore_errors=True)
    hw = await probe_hardware()
    app.state.hardware = hw

    # Select best available encoder
    manager.encoder = select_encoder(hw)
    print(f"[startup] Selected encoder: {manager.encoder}")

    cleanup_task = asyncio.create_task(cleanup_loop())
    workdir_cleanup_task = asyncio.create_task(cleanup_old_workdirs())

    yield

    # Shutdown
    cleanup_task.cancel()
    workdir_cleanup_task.cancel()
    for job in list(manager.get_all_jobs()):
        await manager.kill_ffmpeg(job, reason="server_shutdown")


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    """Serve the main UI."""
    return FileResponse("static/index.html", media_type="text/html")


@app.get("/debug")
async def debug():
    """Serve the debug panel."""
    return FileResponse("static/debug.html", media_type="text/html")


@app.get("/api/probe")
async def probe(path: str = Query(...), stream_id: str = Query(None)):
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


@app.get("/api/browse")
async def browse(path: str = Query("/")):
    """List directory contents for file browser."""
    try:
        path = unquote(path)
        p = validate_path(path)
        if not p.is_dir():
            raise HTTPException(status_code=400, detail="Not a directory")

        entries = []
        for entry in sorted(p.iterdir()):
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


@app.get("/api/bitrate-tiers")
async def bitrate_tiers(bitrate: int = Query(None), height: int = Query(None)):
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
    return {"tiers": tiers}


@app.get("/api/playlist/{stream_id}/main.m3u8")
async def get_playlist(
    stream_id: str,
    path: str = Query(...),
    quality: str = Query("720p"),
    segment_length: int = Query(6),
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
            stream_id, segments, segment_length, quote(path), quality
        )

        return StreamingResponse(
            iter([playlist_text]),
            media_type="application/vnd.apple.mpegurl",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/segment/{stream_id}/{segment_id}.ts")
async def get_segment(
    stream_id: str,
    segment_id: int,
    path: str = Query(...),
    quality: str = Query("720p"),
    segment_length: int = Query(6),
    runtimeTicks: int = Query(None),
    actualSegmentLengthTicks: int = Query(None),
    background_tasks: BackgroundTasks = None,
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
                    job = TranscodeJob(
                        stream_id=stream_id,
                        source_path=path,
                        quality=quality,
                        segment_length=segment_length,
                        work_dir=work_dir,
                    )
                    await manager.register_job(job)

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
        import traceback

        err_msg = f"{type(e).__name__}: {str(e)}"
        print(f"ERROR in get_segment: {err_msg}")
        traceback.print_exc()
        await manager.broadcast_event(
            {
                "type": "error",
                "stream_id": stream_id,
                "message": err_msg,
            }
        )
        raise HTTPException(status_code=500, detail=err_msg)


@app.post("/api/stop/{stream_id}")
async def stop_stream(stream_id: str):
    """Kill FFmpeg for this stream (idempotent - OK even if not running)."""
    validate_session_id(stream_id)
    job = manager.get_job(stream_id)
    if job:
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


@app.post("/api/ping/{session_id}")
async def ping(session_id: str):
    """Keep-alive ping endpoint (Jellyfin pattern)."""
    validate_session_id(session_id)
    job = manager.get_job(session_id)
    if job:
        await manager.request_begin(job)
        await manager.request_end(job, 0, 0)
    return {"ok": True}


@app.get("/api/capabilities")
async def capabilities():
    """Get server capabilities including hardware support and media root."""
    return {
        "media_root": str(MEDIA_ROOT),
        "hardware": app.state.hardware,
        "bitrate_tiers": BITRATE_TIERS,
    }


@app.get("/api/thumb")
async def get_thumb(path: str = Query(...), t: float = Query(0), w: int = Query(320)):
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


@app.get("/api/poster")
async def get_poster(path: str = Query(...)):
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


@app.get("/api/debug/events")
async def debug_events(request: Request):
    """SSE stream for debug panel with heartbeat and event replay."""
    last_id = request.headers.get("last-event-id")

    async def event_generator():
        # Replay buffered events if reconnecting
        buffered = list(manager._event_buffer)
        start_idx = 0
        if last_id and last_id.isdigit():
            for i, ev in enumerate(buffered):
                if str(ev.get("_id", "")) == last_id:
                    start_idx = i + 1
                    break
        for ev in buffered[start_idx:]:
            yield f"id: {ev.get('_id', '')}\ndata: {json.dumps(ev)}\n\n"

        q = manager.subscribe()
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"id: {event.get('_id', '')}\ndata: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            manager.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/debug/state")
async def debug_state():
    """JSON snapshot of all active jobs (polling fallback)."""
    return {
        "jobs": [
            {
                "stream_id": j.stream_id,
                "quality": j.quality,
                "pid": j.pid,
                "start_segment": j.start_segment,
                "start_time_sec": j.start_time_sec,
                "download_position_ticks": j.download_position_ticks,
                "has_exited": j.has_exited,
                "active_requests": j.active_requests,
                "transcode_fps": j.transcode_fps,
                "transcode_speed": j.transcode_speed,
                "transcode_position_sec": j.transcode_position_sec,
            }
            for j in manager.get_all_jobs()
        ]
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
