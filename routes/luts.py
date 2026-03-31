"""
LUT (Look-Up Table) endpoints: browse, serve, and manage color profiles.
"""

from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

import db.crud as crud
from routes.deps import require_role

router = APIRouter(tags=["luts"])


class ColorMetaUpdate(BaseModel):
    """Request body for updating file color metadata."""
    color_space: Optional[str] = None
    color_transfer: Optional[str] = None
    color_primaries: Optional[str] = None
    log_profile: Optional[str] = None


class LutPrefUpdate(BaseModel):
    """Request body for updating file LUT preference."""
    lut_id: Optional[str] = None
    intensity: float = 1.0


def _extract_folder(file_path: str) -> str:
    parts = Path(file_path).parts
    try:
        idx = parts.index("luts")
        # Everything between "luts/" and the filename (exclude the filename itself)
        sub = parts[idx + 1:-1]
        return "/".join(sub) if sub else "other"
    except ValueError:
        return "other"


@router.get("/api/luts")
async def list_luts(_auth: dict = Depends(require_role('viewer'))):
    """List all available LUTs."""
    luts = await crud.get_all_luts()
    return {"luts": [{**lut, "folder": _extract_folder(lut["file_path"])} for lut in luts]}


@router.get("/api/luts/{lut_id}/file")
async def get_lut_file(lut_id: str, _auth: dict = Depends(require_role('viewer'))):
    """Stream a .cube LUT file."""
    lut = await crud.get_lut(lut_id)
    if not lut:
        raise HTTPException(status_code=404, detail="LUT not found")

    file_path = Path(lut["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="LUT file missing from disk")

    return FileResponse(file_path, media_type="text/plain", filename=file_path.name)


class SourceTagUpdate(BaseModel):
    """Request body for updating file source tags."""
    camera: Optional[str] = None
    lens: Optional[str] = None


class SourceTagsByPathsRequest(BaseModel):
    """Request body for batch source-tag lookup by file paths."""
    paths: List[str]


class PathTagUpdate(BaseModel):
    """Request body for setting camera/lens/lut by file path (library view)."""
    path: str
    camera: Optional[str] = None
    lens: Optional[str] = None
    lut_id: Optional[str] = None
    lut_intensity: float = 1.0


@router.get("/api/files/cameras")
async def list_cameras(_auth: dict = Depends(require_role('viewer'))):
    """Return distinct camera values recorded across all project files."""
    cameras = await crud.get_distinct_cameras()
    return {"cameras": cameras}


@router.get("/api/files/lenses")
async def list_lenses(_auth: dict = Depends(require_role('viewer'))):
    """Return distinct lens values recorded across all project files."""
    lenses = await crud.get_distinct_lenses()
    return {"lenses": lenses}


@router.post("/api/files/source-tags-by-paths")
async def source_tags_by_paths(body: SourceTagsByPathsRequest, _auth: dict = Depends(require_role('viewer'))):
    """Batch lookup of camera/lens tags by file path. Returns {path: {camera, lens}}."""
    tags = await crud.get_source_tags_by_paths(body.paths)
    return {"tags": tags}


@router.put("/api/path-tags")
async def put_path_tags(body: PathTagUpdate, _auth: dict = Depends(require_role('editor'))):
    """Set camera/lens/lut for a file by path. Updates file_path_tags and syncs all project_files rows."""
    await crud.upsert_file_path_tags(body.path, body.camera, body.lens, body.lut_id, body.lut_intensity)
    return {"path": body.path, "camera": body.camera, "lens": body.lens, "lut_id": body.lut_id, "lut_intensity": body.lut_intensity}


@router.get("/api/files/{file_id}/color-meta")
async def get_color_meta(file_id: str, _auth: dict = Depends(require_role('viewer'))):
    """Get detected and/or manual color metadata for a file."""
    meta = await crud.get_file_color_meta(file_id)
    if not meta:
        raise HTTPException(status_code=404, detail="No color metadata for this file")
    return meta


@router.put("/api/files/{file_id}/color-meta")
async def put_color_meta(file_id: str, body: ColorMetaUpdate, _auth: dict = Depends(require_role('editor'))):
    """Update (manual override) color metadata for a file."""
    update_dict = body.model_dump(exclude_none=True)
    if not update_dict:
        # If no fields provided, fetch existing or return empty
        existing = await crud.get_file_color_meta(file_id)
        if existing:
            return existing
        raise HTTPException(status_code=404, detail="No color metadata to update")

    # Always set source='manual' for explicit updates
    result = await crud.upsert_file_color_meta(
        file_id=file_id,
        color_space=update_dict.get("color_space"),
        color_transfer=update_dict.get("color_transfer"),
        color_primaries=update_dict.get("color_primaries"),
        log_profile=update_dict.get("log_profile"),
        source="manual",
    )
    return result


@router.get("/api/files/{file_id}/lut-pref")
async def get_lut_pref(file_id: str, _auth: dict = Depends(require_role('viewer'))):
    """Get saved LUT preference for a file."""
    pref = await crud.get_file_lut_pref(file_id)
    if not pref:
        raise HTTPException(status_code=404, detail="No LUT preference for this file")
    return pref


@router.put("/api/files/{file_id}/lut-pref")
async def put_lut_pref(file_id: str, body: LutPrefUpdate, _auth: dict = Depends(require_role('editor'))):
    """Update LUT preference (selection + intensity) for a file. Pass lut_id=null to delete."""
    if body.lut_id is None:
        # Delete the preference
        await crud.delete_file_lut_pref(file_id)
        return {"deleted": True}

    # Validate that the LUT exists
    lut = await crud.get_lut(body.lut_id)
    if not lut:
        raise HTTPException(status_code=404, detail="LUT not found")

    # Upsert preference
    result = await crud.upsert_file_lut_pref(file_id, body.lut_id, body.intensity)
    return result


@router.put("/api/files/{file_id}/source-tags")
async def put_source_tags(file_id: str, body: SourceTagUpdate, _auth: dict = Depends(require_role('editor'))):
    """Update camera and lens source tags for a file. Pass null to clear."""
    await crud.update_file_source_tags(file_id, body.camera, body.lens)
    return {"file_id": file_id, "camera": body.camera, "lens": body.lens}
