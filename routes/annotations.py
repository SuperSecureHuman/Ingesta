"""
Annotation endpoints: tags, rating, comments, markers.
All keyed by file_path — works for both project files and library browse files.

Two router prefixes:
  /api/path-annotations  — path-based (used by library view + player)
  /api/files             — legacy file_id-based routes (kept for backward compat,
                           resolve file_id → file_path then call path CRUD)

IMPORTANT: GET /api/files/tags must remain the FIRST route on the /api/files router
to prevent FastAPI matching the literal "tags" as a {file_id} path parameter.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import db.crud as crud
from db import get_db
from routes.deps import require_role

# ── Routers ───────────────────────────────────────────────────────────────────

path_router = APIRouter(prefix="/api/path-annotations", tags=["annotations"])
file_router = APIRouter(prefix="/api/files", tags=["annotations"])

# Expose both so main.py can register them
router = path_router   # kept for main.py backwards compat — main.py registers annotations.router
                       # We'll also register annotations.file_router separately.


# ── Request models ────────────────────────────────────────────────────────────

class AddTagRequest(BaseModel):
    tag: str

class SetRatingRequest(BaseModel):
    rating: Optional[int] = None

class AddCommentRequest(BaseModel):
    body: str
    timestamp_seconds: Optional[float] = None

class AddMarkerRequest(BaseModel):
    timestamp_seconds: float
    label: str
    color: str = "#f59e0b"

class UpdateMarkerRequest(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None

class BatchAnnotationsRequest(BaseModel):
    paths: list[str]


# ── Helper: resolve file_id → file_path ──────────────────────────────────────

async def _path_for_file_id(file_id: str) -> str:
    """Resolve project_file id to its absolute file_path. Raises 404 if not found."""
    db = get_db()
    row = await db.fetchone(
        "SELECT file_path FROM project_files WHERE id = ?", (file_id,)
    )
    if not row:
        raise HTTPException(404, "File not found")
    return row[0]


# ── /api/path-annotations — path-based endpoints ─────────────────────────────

# Batch (must come before /{tag} or similar wildcard routes)
@path_router.post("/batch")
async def batch_annotations(
    req: BatchAnnotationsRequest,
    _auth: dict = Depends(require_role('viewer')),
):
    """Batch-fetch all annotations for a list of file paths."""
    return await crud.get_annotations_for_paths(req.paths)


# Tags
@path_router.get("/tags")
async def path_list_distinct_tags(_auth: dict = Depends(require_role('viewer'))):
    return await crud.get_distinct_tags()


@path_router.get("/file/tags")
async def path_list_file_tags(
    path: str = Query(...),
    _auth: dict = Depends(require_role('viewer')),
):
    return await crud.get_file_tags(path)


@path_router.post("/file/tags")
async def path_add_file_tag(
    req: AddTagRequest,
    path: str = Query(...),
    _auth: dict = Depends(require_role('editor')),
):
    tag = req.tag.strip()
    if not tag:
        raise HTTPException(400, "Tag cannot be empty")
    return await crud.add_file_tag(path, tag)


@path_router.delete("/file/tags/{tag}")
async def path_remove_file_tag(
    tag: str,
    path: str = Query(...),
    _auth: dict = Depends(require_role('editor')),
):
    removed = await crud.remove_file_tag(path, tag)
    if not removed:
        raise HTTPException(404, "Tag not found on this file")
    return {"ok": True}


# Rating
@path_router.get("/file/rating")
async def path_get_file_rating(
    path: str = Query(...),
    _auth: dict = Depends(require_role('viewer')),
):
    return {"rating": await crud.get_file_rating(path)}


@path_router.put("/file/rating")
async def path_set_file_rating(
    req: SetRatingRequest,
    path: str = Query(...),
    _auth: dict = Depends(require_role('editor')),
):
    if req.rating is not None and req.rating not in (1, 2, 3, 4, 5):
        raise HTTPException(400, "Rating must be 1-5 or null")
    await crud.set_file_rating(path, req.rating)
    return {"rating": req.rating}


# Comments
@path_router.get("/file/comments")
async def path_list_file_comments(
    path: str = Query(...),
    _auth: dict = Depends(require_role('viewer')),
):
    return await crud.get_file_comments(path)


@path_router.post("/file/comments")
async def path_add_file_comment(
    req: AddCommentRequest,
    path: str = Query(...),
    _auth: dict = Depends(require_role('editor')),
):
    body = req.body.strip()
    if not body:
        raise HTTPException(400, "Comment body cannot be empty")
    return await crud.add_file_comment(path, body, req.timestamp_seconds)


@path_router.delete("/file/comments/{comment_id}")
async def path_delete_file_comment(
    comment_id: str,
    _auth: dict = Depends(require_role('editor')),
):
    removed = await crud.delete_file_comment(comment_id)
    if not removed:
        raise HTTPException(404, "Comment not found")
    return {"ok": True}


# Markers
@path_router.get("/file/markers")
async def path_list_file_markers(
    path: str = Query(...),
    _auth: dict = Depends(require_role('viewer')),
):
    return await crud.get_file_markers(path)


@path_router.post("/file/markers")
async def path_add_file_marker(
    req: AddMarkerRequest,
    path: str = Query(...),
    _auth: dict = Depends(require_role('editor')),
):
    label = req.label.strip()
    if not label:
        raise HTTPException(400, "Marker label cannot be empty")
    return await crud.add_file_marker(path, req.timestamp_seconds, label, req.color)


@path_router.patch("/file/markers/{marker_id}")
async def path_update_file_marker(
    marker_id: str,
    req: UpdateMarkerRequest,
    path: str = Query(...),
    _auth: dict = Depends(require_role('editor')),
):
    existing_markers = await crud.get_file_markers(path)
    marker = next((m for m in existing_markers if m["id"] == marker_id), None)
    if not marker:
        raise HTTPException(404, "Marker not found")
    label = req.label.strip() if req.label is not None else marker["label"]
    color = req.color if req.color is not None else marker["color"]
    updated = await crud.update_file_marker(marker_id, label, color)
    if not updated:
        raise HTTPException(404, "Marker not found")
    return updated


@path_router.delete("/file/markers/{marker_id}")
async def path_delete_file_marker(
    marker_id: str,
    _auth: dict = Depends(require_role('editor')),
):
    removed = await crud.delete_file_marker(marker_id)
    if not removed:
        raise HTTPException(404, "Marker not found")
    return {"ok": True}


# ── /api/files/{file_id}/... — legacy file_id-based endpoints ────────────────
# These resolve file_id → file_path then delegate to path CRUD.

# NOTE: GET /api/files/tags must be FIRST to avoid "tags" matching as {file_id}.
@file_router.get("/tags")
async def list_distinct_tags(_auth: dict = Depends(require_role('viewer'))):
    return await crud.get_distinct_tags()


@file_router.get("/{file_id}/tags")
async def list_file_tags(file_id: str, _auth: dict = Depends(require_role('viewer'))):
    path = await _path_for_file_id(file_id)
    return await crud.get_file_tags(path)


@file_router.post("/{file_id}/tags")
async def add_file_tag(
    file_id: str,
    req: AddTagRequest,
    _auth: dict = Depends(require_role('editor')),
):
    tag = req.tag.strip()
    if not tag:
        raise HTTPException(400, "Tag cannot be empty")
    path = await _path_for_file_id(file_id)
    return await crud.add_file_tag(path, tag)


@file_router.delete("/{file_id}/tags/{tag}")
async def remove_file_tag(
    file_id: str, tag: str,
    _auth: dict = Depends(require_role('editor')),
):
    path = await _path_for_file_id(file_id)
    removed = await crud.remove_file_tag(path, tag)
    if not removed:
        raise HTTPException(404, "Tag not found on this file")
    return {"ok": True}


@file_router.put("/{file_id}/rating")
async def set_file_rating(
    file_id: str,
    req: SetRatingRequest,
    _auth: dict = Depends(require_role('editor')),
):
    if req.rating is not None and req.rating not in (1, 2, 3, 4, 5):
        raise HTTPException(400, "Rating must be 1-5 or null")
    path = await _path_for_file_id(file_id)
    await crud.set_file_rating(path, req.rating)
    return {"rating": req.rating}


@file_router.get("/{file_id}/comments")
async def list_file_comments(file_id: str, _auth: dict = Depends(require_role('viewer'))):
    path = await _path_for_file_id(file_id)
    return await crud.get_file_comments(path)


@file_router.post("/{file_id}/comments")
async def add_file_comment(
    file_id: str,
    req: AddCommentRequest,
    _auth: dict = Depends(require_role('editor')),
):
    body = req.body.strip()
    if not body:
        raise HTTPException(400, "Comment body cannot be empty")
    path = await _path_for_file_id(file_id)
    return await crud.add_file_comment(path, body, req.timestamp_seconds)


@file_router.delete("/{file_id}/comments/{comment_id}")
async def delete_file_comment(
    file_id: str, comment_id: str,
    _auth: dict = Depends(require_role('editor')),
):
    removed = await crud.delete_file_comment(comment_id)
    if not removed:
        raise HTTPException(404, "Comment not found")
    return {"ok": True}


@file_router.get("/{file_id}/markers")
async def list_file_markers(file_id: str, _auth: dict = Depends(require_role('viewer'))):
    path = await _path_for_file_id(file_id)
    return await crud.get_file_markers(path)


@file_router.post("/{file_id}/markers")
async def add_file_marker(
    file_id: str,
    req: AddMarkerRequest,
    _auth: dict = Depends(require_role('editor')),
):
    label = req.label.strip()
    if not label:
        raise HTTPException(400, "Marker label cannot be empty")
    path = await _path_for_file_id(file_id)
    return await crud.add_file_marker(path, req.timestamp_seconds, label, req.color)


@file_router.patch("/{file_id}/markers/{marker_id}")
async def update_file_marker(
    file_id: str, marker_id: str,
    req: UpdateMarkerRequest,
    _auth: dict = Depends(require_role('editor')),
):
    path = await _path_for_file_id(file_id)
    existing_markers = await crud.get_file_markers(path)
    marker = next((m for m in existing_markers if m["id"] == marker_id), None)
    if not marker:
        raise HTTPException(404, "Marker not found")
    label = req.label.strip() if req.label is not None else marker["label"]
    color = req.color if req.color is not None else marker["color"]
    updated = await crud.update_file_marker(marker_id, label, color)
    if not updated:
        raise HTTPException(404, "Marker not found")
    return updated


@file_router.delete("/{file_id}/markers/{marker_id}")
async def delete_file_marker(
    file_id: str, marker_id: str,
    _auth: dict = Depends(require_role('editor')),
):
    removed = await crud.delete_file_marker(marker_id)
    if not removed:
        raise HTTPException(404, "Marker not found")
    return {"ok": True}
