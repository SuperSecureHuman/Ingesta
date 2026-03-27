"""
CRUD operations for libraries, projects, files, and shares.
All queries use parameterized statements (safe from SQL injection).
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from db import get_db


def _now_iso() -> str:
    """Return current UTC timestamp in ISO8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _new_uuid() -> str:
    """Generate a new UUID as string."""
    return str(uuid.uuid4())


# ============================================================================
# LIBRARIES
# ============================================================================


async def create_library(name: str, root_path: str) -> str:
    """Create a new library. Returns the library ID."""
    library_id = _new_uuid()
    created_at = _now_iso()

    db = get_db()
    await db.execute(
        "INSERT INTO libraries (id, name, root_path, created_at) VALUES (?, ?, ?, ?)",
        (library_id, name, root_path, created_at),
    )
    return library_id


async def get_library(library_id: str) -> Optional[Dict[str, Any]]:
    """Get library by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, name, root_path, created_at FROM libraries WHERE id = ?",
        (library_id,),
    )
    if not row:
        return None

    return {
        "id": row[0],
        "name": row[1],
        "root_path": row[2],
        "created_at": row[3],
    }


async def get_libraries() -> List[Dict[str, Any]]:
    """Get all libraries."""
    db = get_db()
    rows = await db.fetch(
        "SELECT id, name, root_path, created_at FROM libraries ORDER BY created_at DESC"
    )
    return [
        {
            "id": row[0],
            "name": row[1],
            "root_path": row[2],
            "created_at": row[3],
        }
        for row in rows
    ]


async def delete_library(library_id: str) -> bool:
    """Delete library. Returns True if library was deleted."""
    db = get_db()
    await db.execute("DELETE FROM libraries WHERE id = ?", (library_id,))
    return True


# ============================================================================
# PROJECTS
# ============================================================================


async def create_project(name: str, library_id: Optional[str] = None) -> str:
    """Create a new project. Returns the project ID."""
    project_id = _new_uuid()
    created_at = _now_iso()

    db = get_db()
    await db.execute(
        "INSERT INTO projects (id, name, library_id, created_at) VALUES (?, ?, ?, ?)",
        (project_id, name, library_id, created_at),
    )
    return project_id


async def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    """Get project by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, name, library_id, created_at FROM projects WHERE id = ?",
        (project_id,),
    )
    if not row:
        return None

    return {
        "id": row[0],
        "name": row[1],
        "library_id": row[2],
        "created_at": row[3],
    }


async def get_projects(library_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get projects, optionally filtered by library."""
    db = get_db()

    if library_id:
        rows = await db.fetch(
            "SELECT id, name, library_id, created_at FROM projects WHERE library_id = ? ORDER BY created_at DESC",
            (library_id,),
        )
    else:
        rows = await db.fetch(
            "SELECT id, name, library_id, created_at FROM projects ORDER BY created_at DESC"
        )

    return [
        {
            "id": row[0],
            "name": row[1],
            "library_id": row[2],
            "created_at": row[3],
        }
        for row in rows
    ]


async def update_project(project_id: str, name: str) -> bool:
    """Update project name."""
    db = get_db()
    await db.execute("UPDATE projects SET name = ? WHERE id = ?", (name, project_id))
    return True


async def delete_project(project_id: str) -> bool:
    """Delete project and all its files."""
    db = get_db()
    await db.execute("DELETE FROM project_files WHERE project_id = ?", (project_id,))
    await db.execute("DELETE FROM shares WHERE project_id = ?", (project_id,))
    await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return True


# ============================================================================
# PROJECT FILES
# ============================================================================


async def add_project_file(
    project_id: str,
    file_path: str,
    file_size: int,
    mtime: float,
) -> str:
    """Add a file to a project. Returns the file ID."""
    file_id = _new_uuid()
    added_at = _now_iso()

    db = get_db()
    await db.execute(
        """
        INSERT INTO project_files
        (id, project_id, file_path, file_size, mtime, scan_status, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (file_id, project_id, file_path, file_size, mtime, "pending", added_at),
    )
    return file_id


async def get_project_file(file_id: str) -> Optional[Dict[str, Any]]:
    """Get project file by ID."""
    db = get_db()
    row = await db.fetchone(
        """
        SELECT id, project_id, file_path, file_size, mtime, duration_seconds,
               width, height, bitrate, video_codec, scan_status, scan_error, added_at
        FROM project_files WHERE id = ?
        """,
        (file_id,),
    )
    if not row:
        return None

    return {
        "id": row[0],
        "project_id": row[1],
        "file_path": row[2],
        "file_size": row[3],
        "mtime": row[4],
        "duration_seconds": row[5],
        "width": row[6],
        "height": row[7],
        "bitrate": row[8],
        "video_codec": row[9],
        "scan_status": row[10],
        "scan_error": row[11],
        "added_at": row[12],
    }


async def get_project_files(project_id: str) -> List[Dict[str, Any]]:
    """Get all files in a project."""
    db = get_db()
    rows = await db.fetch(
        """
        SELECT id, project_id, file_path, file_size, mtime, duration_seconds,
               width, height, bitrate, video_codec, scan_status, scan_error, added_at
        FROM project_files WHERE project_id = ? ORDER BY added_at
        """,
        (project_id,),
    )

    return [
        {
            "id": row[0],
            "project_id": row[1],
            "file_path": row[2],
            "file_size": row[3],
            "mtime": row[4],
            "duration_seconds": row[5],
            "width": row[6],
            "height": row[7],
            "bitrate": row[8],
            "video_codec": row[9],
            "scan_status": row[10],
            "scan_error": row[11],
            "added_at": row[12],
        }
        for row in rows
    ]


async def get_pending_files(limit: int = 100) -> List[Dict[str, Any]]:
    """Get files pending scan (for background scanner)."""
    db = get_db()
    rows = await db.fetch(
        """
        SELECT id, project_id, file_path, file_size, mtime, scan_status, added_at
        FROM project_files WHERE scan_status = 'pending' ORDER BY added_at LIMIT ?
        """,
        (limit,),
    )

    return [
        {
            "id": row[0],
            "project_id": row[1],
            "file_path": row[2],
            "file_size": row[3],
            "mtime": row[4],
            "scan_status": row[5],
            "added_at": row[6],
        }
        for row in rows
    ]


async def update_file_probe_results(
    file_id: str,
    duration_seconds: float,
    width: int,
    height: int,
    bitrate: int,
    video_codec: str,
) -> bool:
    """Update file with probe results and mark scan as done."""
    db = get_db()
    await db.execute(
        """
        UPDATE project_files SET
            duration_seconds = ?,
            width = ?,
            height = ?,
            bitrate = ?,
            video_codec = ?,
            scan_status = 'done',
            scan_error = NULL
        WHERE id = ?
        """,
        (duration_seconds, width, height, bitrate, video_codec, file_id),
    )
    return True


async def mark_file_scan_error(file_id: str, error_msg: str) -> bool:
    """Mark file scan as failed with error message."""
    db = get_db()
    await db.execute(
        """
        UPDATE project_files SET
            scan_status = 'error',
            scan_error = ?
        WHERE id = ?
        """,
        (error_msg, file_id),
    )
    return True


async def delete_project_file(file_id: str) -> bool:
    """Delete a file from a project."""
    db = get_db()
    await db.execute("DELETE FROM project_files WHERE id = ?", (file_id,))
    return True


# ============================================================================
# SHARES
# ============================================================================


async def create_share(
    project_id: str,
    password_hash: str,
    expires_at: Optional[str] = None,
) -> str:
    """Create a share link for a project. Returns the share ID."""
    share_id = _new_uuid()
    created_at = _now_iso()

    db = get_db()
    await db.execute(
        """
        INSERT INTO shares (id, project_id, password_hash, created_at, expires_at, active)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (share_id, project_id, password_hash, created_at, expires_at, True),
    )
    return share_id


async def get_share(share_id: str) -> Optional[Dict[str, Any]]:
    """Get share by ID."""
    db = get_db()
    row = await db.fetchone(
        """
        SELECT id, project_id, password_hash, created_at, expires_at, active
        FROM shares WHERE id = ?
        """,
        (share_id,),
    )
    if not row:
        return None

    return {
        "id": row[0],
        "project_id": row[1],
        "password_hash": row[2],
        "created_at": row[3],
        "expires_at": row[4],
        "active": bool(row[5]),
    }


async def get_project_shares(project_id: str) -> List[Dict[str, Any]]:
    """Get all active shares for a project."""
    db = get_db()
    rows = await db.fetch(
        """
        SELECT id, project_id, password_hash, created_at, expires_at, active
        FROM shares WHERE project_id = ? AND active = 1 ORDER BY created_at DESC
        """,
        (project_id,),
    )

    return [
        {
            "id": row[0],
            "project_id": row[1],
            "password_hash": row[2],
            "created_at": row[3],
            "expires_at": row[4],
            "active": bool(row[5]),
        }
        for row in rows
    ]


async def revoke_share(share_id: str) -> bool:
    """Revoke a share (mark inactive)."""
    db = get_db()
    await db.execute("UPDATE shares SET active = 0 WHERE id = ?", (share_id,))
    return True


async def delete_share(share_id: str) -> bool:
    """Delete a share."""
    db = get_db()
    await db.execute("DELETE FROM shares WHERE id = ?", (share_id,))
    return True


# ============================================================================
# USERS
# ============================================================================


async def create_user(username: str, password_hash: str) -> str:
    """Create a new user. Returns the user ID."""
    user_id = _new_uuid()
    created_at = _now_iso()

    db = get_db()
    await db.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
        (user_id, username, password_hash, created_at),
    )
    return user_id


async def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
        (user_id,),
    )
    if not row:
        return None
    return {
        "id": row[0],
        "username": row[1],
        "password_hash": row[2],
        "created_at": row[3],
    }


async def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Get user by username."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
        (username,),
    )
    if not row:
        return None
    return {
        "id": row[0],
        "username": row[1],
        "password_hash": row[2],
        "created_at": row[3],
    }


async def user_exists() -> bool:
    """Check if any users exist (for bootstrap logic)."""
    db = get_db()
    row = await db.fetchone("SELECT COUNT(*) FROM users")
    return row[0] > 0 if row else False
