"""
Library API endpoints (/api/libraries).
"""

from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query

from config import settings
import db.crud as crud


router = APIRouter(prefix="/api/libraries", tags=["libraries"])


def require_admin_key(x_admin_key: Optional[str] = None) -> str:
    """Dependency to validate ADMIN_API_KEY header."""
    if not x_admin_key or x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing ADMIN_API_KEY")
    return x_admin_key


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
async def list_libraries(admin_key: str = Depends(require_admin_key)):
    """List all libraries."""
    libraries = await crud.get_libraries()
    return {"libraries": libraries}


@router.post("")
async def create_library(
    name: str = Query(...),
    root_path: str = Query(...),
    admin_key: str = Depends(require_admin_key),
):
    """Create a new library."""
    # Validate root_path exists and is a directory
    root = Path(root_path).resolve()
    if not root.exists():
        raise HTTPException(400, "root_path does not exist")
    if not root.is_dir():
        raise HTTPException(400, "root_path must be a directory")

    library_id = await crud.create_library(name, str(root))
    return {"id": library_id, "name": name, "root_path": str(root)}


@router.delete("/{library_id}")
async def delete_library(
    library_id: str,
    admin_key: str = Depends(require_admin_key),
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
    admin_key: str = Depends(require_admin_key),
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
        raise HTTPException(403, "Permission denied")
    except Exception as e:
        raise HTTPException(400, str(e))
