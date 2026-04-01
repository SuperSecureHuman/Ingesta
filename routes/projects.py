"""
Project API endpoints (/api/projects).
Manages named collections of files with cached metadata.
"""

import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import settings
import db.crud as crud
from routes.deps import require_auth, require_role, MEDIA_ROOT
from routes.utils import async_rglob


router = APIRouter(prefix="/api/projects", tags=["projects"])


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
    _auth: dict = Depends(require_role('viewer')),
):
    """List all projects, optionally filtered by library."""
    projects = await crud.get_projects(library_id=library_id)
    return {"projects": projects}


@router.post("")
async def create_project(
    req: CreateProjectRequest,
    _auth: dict = Depends(require_role('editor')),
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
    _auth: dict = Depends(require_role('viewer')),
):
    """Get project details and file list with metadata."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    files = await crud.get_project_files(project_id)
    if files:
        file_ids = [f["id"] for f in files]
        tags_map = await crud.get_tags_for_files(file_ids)
        ratings_map = await crud.get_ratings_for_files(file_ids)
        comments_map = await crud.get_comments_for_files(file_ids)
        markers_map = await crud.get_markers_for_files(file_ids)
        for f in files:
            fid = f["id"]
            f["tags"] = tags_map.get(fid, [])
            f["rating"] = ratings_map.get(fid)
            f["comments"] = comments_map.get(fid, [])
            f["markers"] = markers_map.get(fid, [])
    return {
        "project": project,
        "files": files,
    }


@router.post("/{project_id}/files")
async def add_files_to_project(
    project_id: str,
    req: AddFilesRequest,
    _auth: dict = Depends(require_role('editor')),
):
    """Add files to a project (paths are marked as pending scan)."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    added = 0
    errors = []
    seen = set()  # Track resolved paths in this request to avoid duplicates

    for file_path in req.paths:
        try:
            p = Path(file_path).resolve()
            resolved_path = str(p)

            # Validate path is within MEDIA_ROOT
            media_root_str = str(MEDIA_ROOT)
            if resolved_path != media_root_str and not resolved_path.startswith(media_root_str + "/"):
                errors.append({"path": file_path, "error": "Path outside MEDIA_ROOT"})
                continue

            # Skip if we've already seen this path in this request
            if resolved_path in seen:
                errors.append({"path": file_path, "error": "Duplicate in request"})
                continue
            seen.add(resolved_path)

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
            result = await crud.add_project_file(
                project_id=project_id,
                file_path=resolved_path,
                file_size=file_size,
                mtime=mtime,
            )
            if result is not None:
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
    _auth: dict = Depends(require_role('editor')),
):
    """Remove files from a project."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    removed = 0
    # Fetch all files once before the loop
    project_files = await crud.get_project_files(project_id)
    files_by_path = {f["file_path"]: f for f in project_files}

    errors = []
    file_ids_to_delete = []

    for file_path in req.paths:
        try:
            file_record = files_by_path.get(file_path)

            if not file_record:
                errors.append({"path": file_path, "error": "File not in project"})
                continue

            file_ids_to_delete.append(file_record["id"])
            removed += 1
        except Exception as e:
            errors.append({"path": file_path, "error": str(e)})

    # Batch delete all valid files
    if file_ids_to_delete:
        await crud.delete_project_files_by_ids(file_ids_to_delete)

    return {
        "removed": removed,
        "errors": errors,
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    _auth: dict = Depends(require_role('editor')),
):
    """Delete a project and all its files."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    await crud.delete_project(project_id)
    return {"status": "deleted"}


# Video file extensions for bulk operations
VIDEO_EXTENSIONS = {
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
}


class BulkAddFolderRequest(BaseModel):
    """Request to add all videos from a folder to a project."""
    folder_path: str


class BulkAddLibraryRequest(BaseModel):
    """Request to add all videos from a library to a project."""
    library_id: str


@router.post("/{project_id}/files/folder")
async def add_folder_to_project(
    project_id: str,
    req: BulkAddFolderRequest,
    _auth: dict = Depends(require_role('editor')),
):
    """Add all video files from a folder (recursively) to a project."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    folder = Path(req.folder_path).resolve()

    # Validate path is within MEDIA_ROOT
    media_root_str = str(MEDIA_ROOT)
    folder_str = str(folder)
    if folder_str != media_root_str and not folder_str.startswith(media_root_str + "/"):
        raise HTTPException(403, "Folder path outside MEDIA_ROOT")

    if not folder.exists():
        raise HTTPException(400, "Folder does not exist")
    if not folder.is_dir():
        raise HTTPException(400, "Path is not a directory")

    added = 0
    errors = []
    seen = set()  # Track resolved paths in this request to avoid duplicates

    # Walk the folder recursively (async)
    file_paths = await async_rglob(folder, "*")
    for file_path in file_paths:
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue

        resolved_path = str(file_path.resolve())

        # Skip if we've already seen this path in this request
        if resolved_path in seen:
            continue
        seen.add(resolved_path)

        try:
            stat = file_path.stat()
            file_size = stat.st_size
            mtime = stat.st_mtime

            result = await crud.add_project_file(
                project_id=project_id,
                file_path=resolved_path,
                file_size=file_size,
                mtime=mtime,
            )
            if result is not None:
                added += 1
        except Exception as e:
            errors.append({"path": resolved_path, "error": str(e)})

    return {
        "added": added,
        "errors": errors,
    }


@router.post("/{project_id}/files/library")
async def add_library_to_project(
    project_id: str,
    req: BulkAddLibraryRequest,
    _auth: dict = Depends(require_role('editor')),
):
    """Add all video files from a library (recursively) to a project."""
    project = await crud.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    library = await crud.get_library(req.library_id)
    if not library:
        raise HTTPException(404, "Library not found")

    root = Path(library["root_path"]).resolve()
    if not root.exists():
        raise HTTPException(400, "Library root path does not exist")

    added = 0
    errors = []
    seen = set()  # Track resolved paths in this request to avoid duplicates

    # Walk the library root recursively (async)
    file_paths = await async_rglob(root, "*")
    for file_path in file_paths:
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue

        resolved_path = str(file_path.resolve())

        # Skip if we've already seen this path in this request
        if resolved_path in seen:
            continue
        seen.add(resolved_path)

        try:
            stat = file_path.stat()
            file_size = stat.st_size
            mtime = stat.st_mtime

            result = await crud.add_project_file(
                project_id=project_id,
                file_path=resolved_path,
                file_size=file_size,
                mtime=mtime,
            )
            if result is not None:
                added += 1
        except Exception as e:
            errors.append({"path": resolved_path, "error": str(e)})

    return {
        "added": added,
        "errors": errors,
    }
