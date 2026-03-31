"""
Library API endpoints (/api/libraries).
"""

from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import settings
import db.crud as crud
from routes.deps import require_auth
from routes.utils import async_iterdir


router = APIRouter(prefix="/api/libraries", tags=["libraries"])


class CreateLibraryRequest(BaseModel):
    """Request to create a library."""
    name: str
    root_path: str


def validate_path_in_root(path: str, root_path: str) -> Path:
    """Validate path is within the given root_path and exists."""
    p = Path(path).resolve()
    root = Path(root_path).resolve()

    # Check if path is under root or is root
    root_str = str(root)
    p_str = str(p)
    if p_str != root_str and not p_str.startswith(root_str + "/"):
        raise HTTPException(403, "Path outside library root")

    if not p.exists():
        raise HTTPException(404, "Path not found")

    return p


@router.get("")
async def list_libraries(_auth: str = Depends(require_auth)):
    """List all libraries."""
    libraries = await crud.get_libraries()
    return {"libraries": libraries}


@router.post("", status_code=201)
async def create_library(
    req: CreateLibraryRequest,
    _auth: str = Depends(require_auth),
):
    """Create a new library."""
    # Validate root_path exists and is a directory
    root = Path(req.root_path).resolve()
    if not root.exists():
        raise HTTPException(400, "root_path does not exist")
    if not root.is_dir():
        raise HTTPException(400, "root_path must be a directory")

    try:
        library_id = await crud.create_library(req.name, str(root))
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"id": library_id, "name": req.name, "root_path": str(root)}


@router.get("/{library_id}")
async def get_library(
    library_id: str,
    _auth: str = Depends(require_auth),
):
    """Get a single library's details."""
    library = await crud.get_library(library_id)
    if not library:
        raise HTTPException(404, "Library not found")
    return library


@router.delete("/{library_id}")
async def delete_library(
    library_id: str,
    _auth: str = Depends(require_auth),
):
    """Delete a library."""
    library = await crud.get_library(library_id)
    if not library:
        raise HTTPException(404, "Library not found")

    await crud.delete_library(library_id)
    return {"status": "deleted"}


@router.get("/{library_id}/browse")
async def browse_library(
    library_id: str,
    path: str = Query("/"),
    _auth: str = Depends(require_auth),
):
    """Browse files in a library (scoped to library's root_path)."""
    library = await crud.get_library(library_id)
    if not library:
        raise HTTPException(404, "Library not found")

    try:
        path = unquote(path)
        p = validate_path_in_root(path, library["root_path"])

        if not p.is_dir():
            raise HTTPException(400, "Not a directory")

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
        raise HTTPException(403, "Permission denied")
    except Exception as e:
        raise HTTPException(400, str(e))
