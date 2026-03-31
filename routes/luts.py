"""
LUT (Look-Up Table) endpoints: browse, serve, and manage color profiles.
"""

from pathlib import Path
from typing import Optional

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


@router.get("/api/luts")
async def list_luts(_auth: dict = Depends(require_role('viewer'))):
    """List all available LUTs."""
    luts = await crud.get_all_luts()
    return {"luts": luts}


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
