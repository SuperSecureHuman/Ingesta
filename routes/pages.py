"""
Static page routes: serve HTML files for main UI, debug panel, and public shares.
"""

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()


@router.get("/")
async def root():
    """Serve the main UI."""
    return FileResponse("static/index.html", media_type="text/html")


@router.get("/debug")
async def debug():
    """Serve the debug panel."""
    return FileResponse("static/debug.html", media_type="text/html")


@router.get("/share/{share_id}")
async def share_page(share_id: str):
    """Serve the public share page."""
    return FileResponse("static/share.html", media_type="text/html")
