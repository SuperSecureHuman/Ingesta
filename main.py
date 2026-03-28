"""
FastAPI HLS POC server with on-demand transcoding and dynamic seeking.
"""

import asyncio
import os
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from config import settings
import db
import db.crud as crud
from media.playlist import probe_media
from media.transcoder import (
    TranscodeManager,
    probe_hardware,
    select_encoder,
)

from routes import libraries, projects, shares, auth, stream, debug, pages


manager = TranscodeManager()


async def cleanup_loop():
    """Periodically clean up old segments."""
    while True:
        await asyncio.sleep(settings.cleanup_interval)
        for job in list(manager.get_all_jobs()):
            await manager.cleanup_segments(
                job, keep_seconds=settings.segment_retention_seconds
            )


async def cleanup_old_workdirs():
    """Clean up work directories older than configured retention time."""
    while True:
        await asyncio.sleep(settings.workdir_cleanup_interval)
        cutoff = time.time() - settings.workdir_retention_seconds
        try:
            for d in Path("/tmp/hls_srv").iterdir():
                if d.is_dir() and d.stat().st_mtime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
        except FileNotFoundError:
            pass


async def background_scanner_loop():
    """Periodically scan pending files and probe them for metadata."""
    # Semaphore to limit concurrent ffprobe processes
    sem = asyncio.Semaphore(5)

    async def probe_one(file_record):
        """Probe a single file with semaphore limiting."""
        async with sem:
            try:
                file_path = file_record["file_path"]
                file_id = file_record["id"]

                # Probe the file
                info = await probe_media(file_path)

                # Update DB with results
                await crud.update_file_probe_results(
                    file_id=file_id,
                    duration_seconds=info.duration_seconds,
                    width=info.width,
                    height=info.height,
                    bitrate=info.bitrate,
                    video_codec=info.video_codec,
                )
                print(
                    f"[scanner] Probed {file_path}: {info.width}x{info.height} {info.bitrate}bps"
                )
            except Exception as e:
                # Mark file as error
                error_msg = str(e)[:255]
                try:
                    await crud.mark_file_scan_error(file_record["id"], error_msg)
                except Exception as db_err:
                    print(f"[scanner] Failed to mark error for {file_record['id']}: {db_err}")
                print(f"[scanner] Error probing {file_record['file_path']}: {error_msg}")

    while True:
        try:
            await asyncio.sleep(settings.scanner_interval)

            # Get pending files (limit 10 per scan)
            pending = await crud.get_pending_files(limit=10)

            # Probe all files concurrently (with semaphore limiting to 5 parallel)
            if pending:
                await asyncio.gather(*[probe_one(f) for f in pending])
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[scanner] Unexpected error in scanner loop: {e}")
            # Continue running, don't crash the loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    # Startup
    print("[startup] Initializing database...")
    await db.init_db(settings.database_url)

    # Bootstrap default user if none exists
    print("[startup] Checking for default user...")
    if not await crud.user_exists():
        print(f"[startup] Creating default user '{settings.admin_username}'...")
        import hashlib

        password_hash = hashlib.sha256(settings.admin_password.encode()).hexdigest()
        await crud.create_user(settings.admin_username, password_hash)
        if settings.admin_password == "changeme":
            print(
                "[WARNING] Default user created with default password 'changeme'. Please change this in production."
            )

    print("[startup] Probing hardware...")
    shutil.rmtree("/tmp/hls_srv", ignore_errors=True)
    hw = await probe_hardware()
    app.state.hardware = hw

    # Select best available encoder
    manager.encoder = select_encoder(hw)
    print(f"[startup] Selected encoder: {manager.encoder}")

    # Store manager in app state for route access
    app.state.manager = manager

    # Start background tasks
    cleanup_task = asyncio.create_task(cleanup_loop())
    workdir_cleanup_task = asyncio.create_task(cleanup_old_workdirs())
    scanner_task = asyncio.create_task(background_scanner_loop())

    yield

    # Shutdown
    print("[shutdown] Cancelling background tasks...")
    cleanup_task.cancel()
    workdir_cleanup_task.cancel()
    scanner_task.cancel()
    for job in list(manager.get_all_jobs()):
        await manager.kill_ffmpeg(job, reason="server_shutdown")

    print("[shutdown] Closing database...")
    await db.close_db()


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount route modules
app.include_router(pages.router)
app.include_router(auth.router)
app.include_router(libraries.router)
app.include_router(projects.router)
app.include_router(shares.router)
app.include_router(stream.router)
app.include_router(debug.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
