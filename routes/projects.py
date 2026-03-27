"""
Project API endpoints (/api/projects).
Manages named collections of files with cached metadata.
"""

import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel

from config import settings
import db.crud as crud


router = APIRouter(prefix="/api/projects", tags=["projects"])


def require_admin_key(x_admin_key: Optional[str] = Header(None)) -> str:
    """Dependency to validate ADMIN_API_KEY header."""
    if not x_admin_key or x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing ADMIN_API_KEY")
    return x_admin_key


class CreateProjectRequest(BaseModel):
    """Request to create a project."""

    name: str
    library_id: Optional[str] = None


class AddFilesRequest(BaseModel):
    """Request to add files to a project."""

    paths: List[str]


@router.get("")
async def list_projects(
    library_id: Optional[str] = None,
    admin_key: str = Depends(require_admin_key),
):
    """List all projects, optionally filtered by library."""
    projects = await crud.get_projects(library_id=library_id)
    return {"projects": projects}


@router.post("")
async def create_project(
    req: CreateProjectRequest,
    admin_key: str = Depends(require_admin_key),
):
    """Create a new project."""
    # If library_id is provided, verify it exists
    if req.library_id:
        library = await crud.get_library(req.library_id)
        if not library:
            raise HTTPException(404, "Library not found")

    project_id = await crud.create_project(name=req.name, library_id=req.library_id)
    return {"id": project_id, "name": req.name, "library_id": req.library_id}


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    admin_key: str = Depends(require_admin_key),
):
    """Get project details and file list with metadata."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    files = await crud.get_project_files(project_id)
    return {
        "project": project,
        "files": files,
    }


@router.post("/{project_id}/files")
async def add_files_to_project(
    project_id: str,
    req: AddFilesRequest,
    admin_key: str = Depends(require_admin_key),
):
    """Add files to a project (paths are marked as pending scan)."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    added = 0
    errors = []

    for file_path in req.paths:
        try:
            p = Path(file_path).resolve()

            # Validate file exists
            if not p.exists():
                errors.append({"path": file_path, "error": "File not found"})
                continue

            # Validate it's a file (not directory)
            if not p.is_file():
                errors.append({"path": file_path, "error": "Not a file"})
                continue

            # Get file stats
            stat = p.stat()
            file_size = stat.st_size
            mtime = stat.st_mtime

            # Add to project with pending status
            await crud.add_project_file(
                project_id=project_id,
                file_path=str(p),
                file_size=file_size,
                mtime=mtime,
            )
            added += 1
        except HTTPException:
            raise
        except Exception as e:
            errors.append({"path": file_path, "error": str(e)})

    return {
        "added": added,
        "errors": errors,
    }


@router.delete("/{project_id}/files")
async def remove_files_from_project(
    project_id: str,
    req: AddFilesRequest,
    admin_key: str = Depends(require_admin_key),
):
    """Remove files from a project."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    removed = 0
    errors = []

    for file_path in req.paths:
        try:
            # Find file in project by path
            files = await crud.get_project_files(project_id)
            file_record = None
            for f in files:
                if f["file_path"] == file_path:
                    file_record = f
                    break

            if not file_record:
                errors.append({"path": file_path, "error": "File not in project"})
                continue

            await crud.delete_project_file(file_record["id"])
            removed += 1
        except Exception as e:
            errors.append({"path": file_path, "error": str(e)})

    return {
        "removed": removed,
        "errors": errors,
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    admin_key: str = Depends(require_admin_key),
):
    """Delete a project and all its files."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    await crud.delete_project(project_id)
    return {"status": "deleted"}
