"""
Debug endpoints: SSE event stream and job state JSON.
"""

import json
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from routes.deps import get_manager, require_auth

router = APIRouter(prefix="/api/debug")


@router.get("/events")
async def debug_events(request: Request, manager = Depends(get_manager), _auth: str = Depends(require_auth)):
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


@router.get("/state")
async def debug_state(manager = Depends(get_manager), _auth: str = Depends(require_auth)):
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
