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
    """Create a new library. Returns the library ID. Raises ValueError on duplicate name."""
    db = get_db()
    existing = await db.fetchone(
        "SELECT id FROM libraries WHERE LOWER(name) = LOWER(?)", (name,)
    )
    if existing:
        raise ValueError(f"A library named '{name}' already exists")

    library_id = _new_uuid()
    created_at = _now_iso()
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
    """Delete project and all its files in a single transaction."""
    db = get_db()
    # Execute all deletes as separate statements (SQLite auto-commits, but order matters)
    # Delete in order: files -> shares -> project to respect foreign keys
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
) -> Optional[str]:
    """Add a file to a project. Returns the file ID, or None if already present.
    Inherits camera/lens from any other project_files row with the same path."""
    db = get_db()
    existing = await db.fetchone(
        "SELECT id FROM project_files WHERE project_id = ? AND file_path = ?",
        (project_id, file_path),
    )
    if existing:
        return None

    # Inherit camera/lens from file_path_tags (canonical source) or fallback to existing project_files row
    tag_row = await db.fetchone(
        "SELECT camera, lens FROM file_path_tags WHERE file_path = ?",
        (file_path,),
    )
    if not tag_row:
        tag_row = await db.fetchone(
            "SELECT camera, lens FROM project_files WHERE file_path = ? AND (camera IS NOT NULL OR lens IS NOT NULL) LIMIT 1",
            (file_path,),
        )
    inherited_camera = tag_row[0] if tag_row else None
    inherited_lens = tag_row[1] if tag_row else None

    file_id = _new_uuid()
    added_at = _now_iso()
    await db.execute(
        """
        INSERT INTO project_files
        (id, project_id, file_path, file_size, mtime, scan_status, added_at, camera, lens)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (file_id, project_id, file_path, file_size, mtime, "pending", added_at, inherited_camera, inherited_lens),
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
               width, height, bitrate, video_codec, scan_status, scan_error, added_at,
               camera, lens
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
            "camera": row[13],
            "lens": row[14],
        }
        for row in rows
    ]


async def get_project_file_by_path(
    project_id: str, file_path: str
) -> Optional[Dict[str, Any]]:
    """Get project file by path (used for share segment validation)."""
    db = get_db()
    row = await db.fetchone(
        """
        SELECT id, duration_seconds, width, height, bitrate, video_codec, scan_status
        FROM project_files WHERE project_id = ? AND file_path = ? LIMIT 1
        """,
        (project_id, file_path),
    )
    if not row:
        return None

    return {
        "id": row[0],
        "duration_seconds": row[1],
        "width": row[2],
        "height": row[3],
        "bitrate": row[4],
        "video_codec": row[5],
        "scan_status": row[6],
    }


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


async def delete_project_files_by_ids(file_ids: List[str]) -> int:
    """Delete multiple files from a project in one batch query."""
    if not file_ids:
        return 0
    db = get_db()
    placeholders = ",".join("?" * len(file_ids))
    await db.execute(
        f"DELETE FROM project_files WHERE id IN ({placeholders})",
        tuple(file_ids),
    )
    return len(file_ids)


async def update_file_source_tags(file_id: str, camera: Optional[str], lens: Optional[str]) -> bool:
    """Update camera and lens on ALL project_files rows sharing the same file_path (cross-project sync),
    and upsert into file_path_tags as the canonical source of truth."""
    db = get_db()
    row = await db.fetchone("SELECT file_path FROM project_files WHERE id = ?", (file_id,))
    if not row:
        return False
    file_path = row[0]
    updated_at = _now_iso()
    await db.execute(
        "UPDATE project_files SET camera = ?, lens = ? WHERE file_path = ?",
        (camera, lens, file_path),
    )
    await db.execute(
        """
        INSERT INTO file_path_tags (file_path, camera, lens, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET camera = excluded.camera, lens = excluded.lens, updated_at = excluded.updated_at
        """,
        (file_path, camera, lens, updated_at),
    )
    return True


async def upsert_file_path_tags(
    file_path: str,
    camera: Optional[str],
    lens: Optional[str],
    lut_id: Optional[str] = None,
    lut_intensity: float = 1.0,
) -> bool:
    """Upsert camera/lens/lut into file_path_tags and sync any existing project_files rows."""
    db = get_db()
    updated_at = _now_iso()
    await db.execute(
        """
        INSERT INTO file_path_tags (file_path, camera, lens, lut_id, lut_intensity, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
            camera        = excluded.camera,
            lens          = excluded.lens,
            lut_id        = excluded.lut_id,
            lut_intensity = excluded.lut_intensity,
            updated_at    = excluded.updated_at
        """,
        (file_path, camera, lens, lut_id, lut_intensity, updated_at),
    )
    await db.execute(
        "UPDATE project_files SET camera = ?, lens = ? WHERE file_path = ?",
        (camera, lens, file_path),
    )
    return True


async def get_source_tags_by_paths(paths: List[str]) -> Dict[str, Dict[str, Any]]:
    """Return {file_path: {camera, lens, lut_id, lut_intensity}} for the given paths from file_path_tags."""
    if not paths:
        return {}
    db = get_db()
    placeholders = ",".join("?" * len(paths))
    rows = await db.fetch(
        f"SELECT file_path, camera, lens, lut_id, lut_intensity FROM file_path_tags WHERE file_path IN ({placeholders}) AND (camera IS NOT NULL OR lens IS NOT NULL OR lut_id IS NOT NULL)",
        tuple(paths),
    )
    return {
        row[0]: {"camera": row[1], "lens": row[2], "lut_id": row[3], "lut_intensity": row[4]}
        for row in rows
    }


async def get_distinct_cameras() -> List[str]:
    """Return distinct non-null camera values across all project_files, sorted."""
    db = get_db()
    rows = await db.fetch(
        "SELECT DISTINCT camera FROM project_files WHERE camera IS NOT NULL ORDER BY camera"
    )
    return [row[0] for row in rows]


async def get_distinct_lenses() -> List[str]:
    """Return distinct non-null lens values across all project_files, sorted."""
    db = get_db()
    rows = await db.fetch(
        "SELECT DISTINCT lens FROM project_files WHERE lens IS NOT NULL ORDER BY lens"
    )
    return [row[0] for row in rows]


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


async def create_user(username: str, password_hash: str, role: str = 'viewer') -> str:
    """Create a new user. Returns the user ID."""
    user_id = _new_uuid()
    created_at = _now_iso()

    db = get_db()
    await db.execute(
        "INSERT INTO users (id, username, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)",
        (user_id, username, password_hash, created_at, role),
    )
    return user_id


async def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, username, password_hash, created_at, role FROM users WHERE id = ?",
        (user_id,),
    )
    if not row:
        return None
    return {
        "id": row[0],
        "username": row[1],
        "password_hash": row[2],
        "created_at": row[3],
        "role": row[4],
    }


async def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Get user by username."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, username, password_hash, created_at, role FROM users WHERE username = ?",
        (username,),
    )
    if not row:
        return None
    return {
        "id": row[0],
        "username": row[1],
        "password_hash": row[2],
        "created_at": row[3],
        "role": row[4],
    }


async def user_exists() -> bool:
    """Check if any users exist (for bootstrap logic)."""
    db = get_db()
    row = await db.fetchone("SELECT COUNT(*) FROM users")
    return row[0] > 0 if row else False


async def get_all_users() -> List[Dict[str, Any]]:
    """Get all users (excludes password_hash)."""
    db = get_db()
    rows = await db.fetch(
        "SELECT id, username, created_at, role FROM users ORDER BY created_at"
    )
    return [
        {"id": row[0], "username": row[1], "created_at": row[2], "role": row[3]}
        for row in rows
    ]


async def update_user_role(user_id: str, role: str) -> None:
    """Update a user's global role."""
    db = get_db()
    await db.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))


async def update_user_password(user_id: str, password_hash: str) -> None:
    """Update a user's password hash."""
    db = get_db()
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


async def delete_user(user_id: str) -> None:
    """Delete a user."""
    db = get_db()
    await db.execute("DELETE FROM users WHERE id = ?", (user_id,))


# ============================================================================
# LIBRARY PERMISSIONS
# ============================================================================


async def set_library_permission(user_id: str, library_id: str, role: str) -> None:
    """Upsert a per-library permission override for a user."""
    perm_id = _new_uuid()
    created_at = _now_iso()
    db = get_db()
    await db.execute(
        """
        INSERT INTO library_permissions (id, user_id, library_id, role, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, library_id) DO UPDATE SET role = excluded.role
        """,
        (perm_id, user_id, library_id, role, created_at),
    )


async def delete_library_permission(user_id: str, library_id: str) -> None:
    """Remove a per-library permission override."""
    db = get_db()
    await db.execute(
        "DELETE FROM library_permissions WHERE user_id = ? AND library_id = ?",
        (user_id, library_id),
    )


async def get_library_permissions_for_user(user_id: str) -> List[Dict[str, Any]]:
    """Get all library permission overrides for a user."""
    db = get_db()
    rows = await db.fetch(
        "SELECT id, library_id, role, created_at FROM library_permissions WHERE user_id = ?",
        (user_id,),
    )
    return [
        {"id": row[0], "library_id": row[1], "role": row[2], "created_at": row[3]}
        for row in rows
    ]


async def get_library_permission(user_id: str, library_id: str) -> Optional[Dict[str, Any]]:
    """Get a single per-library permission override."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, user_id, library_id, role, created_at FROM library_permissions WHERE user_id = ? AND library_id = ?",
        (user_id, library_id),
    )
    if not row:
        return None
    return {"id": row[0], "user_id": row[1], "library_id": row[2], "role": row[3], "created_at": row[4]}


async def get_effective_role(user_id: str, library_id: str) -> str:
    """Return the effective role for a user on a specific library.

    Admin global role always wins. Otherwise, a library-specific override
    takes precedence over the user's global role.
    """
    user = await get_user(user_id)
    if not user:
        return 'viewer'
    if user['role'] == 'admin':
        return 'admin'
    perm = await get_library_permission(user_id, library_id)
    if perm:
        return perm['role']
    return user['role']


# ============================================================================
# LUTS
# ============================================================================


async def get_all_luts() -> List[Dict[str, Any]]:
    """Get all LUTs, ordered by camera and name."""
    db = get_db()
    rows = await db.fetch(
        "SELECT id, name, camera, log_profile, color_space, gamma, file_path, lut_type, created_at FROM luts ORDER BY camera, name"
    )
    return [
        {
            "id": row[0],
            "name": row[1],
            "camera": row[2],
            "log_profile": row[3],
            "color_space": row[4],
            "gamma": row[5],
            "file_path": row[6],
            "lut_type": row[7],
            "created_at": row[8],
        }
        for row in rows
    ]


async def get_lut(lut_id: str) -> Optional[Dict[str, Any]]:
    """Get LUT by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, name, camera, log_profile, color_space, gamma, file_path, lut_type, created_at FROM luts WHERE id = ?",
        (lut_id,),
    )
    if not row:
        return None
    return {
        "id": row[0],
        "name": row[1],
        "camera": row[2],
        "log_profile": row[3],
        "color_space": row[4],
        "gamma": row[5],
        "file_path": row[6],
        "lut_type": row[7],
        "created_at": row[8],
    }


async def upsert_lut(
    id: str, name: str, camera: str, log_profile: str, color_space: Optional[str], gamma: Optional[str], file_path: str, lut_type: str = "3d"
) -> str:
    """Upsert a LUT (on conflict on file_path, update name/camera/log_profile). Returns LUT ID."""
    created_at = _now_iso()
    db = get_db()
    await db.execute(
        """
        INSERT INTO luts (id, name, camera, log_profile, color_space, gamma, file_path, lut_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
            name        = excluded.name,
            camera      = excluded.camera,
            log_profile = excluded.log_profile,
            color_space = excluded.color_space,
            gamma       = excluded.gamma
        """,
        (id, name, camera, log_profile, color_space, gamma, file_path, lut_type, created_at),
    )
    return id


async def delete_luts_by_ids(lut_ids: List[str]) -> int:
    """Delete LUTs by a list of IDs. Returns the number of rows deleted."""
    if not lut_ids:
        return 0
    db = get_db()
    placeholders = ",".join("?" * len(lut_ids))
    await db.execute(f"DELETE FROM luts WHERE id IN ({placeholders})", tuple(lut_ids))
    return len(lut_ids)


# ============================================================================
# FILE COLOR METADATA
# ============================================================================


async def get_file_color_meta(file_id: str) -> Optional[Dict[str, Any]]:
    """Get color metadata for a file."""
    db = get_db()
    row = await db.fetchone(
        "SELECT file_id, color_space, color_transfer, color_primaries, log_profile, source, updated_at FROM file_color_meta WHERE file_id = ?",
        (file_id,),
    )
    if not row:
        return None
    return {
        "file_id": row[0],
        "color_space": row[1],
        "color_transfer": row[2],
        "color_primaries": row[3],
        "log_profile": row[4],
        "source": row[5],
        "updated_at": row[6],
    }


async def upsert_file_color_meta(
    file_id: str,
    color_space: Optional[str],
    color_transfer: Optional[str],
    color_primaries: Optional[str],
    log_profile: Optional[str],
    source: str = "auto",
) -> Dict[str, Any]:
    """Upsert color metadata for a file. Only updates if source is not 'manual' or if source param is 'manual'."""
    updated_at = _now_iso()
    db = get_db()

    # First check if a manual override exists
    existing = await db.fetchone(
        "SELECT source FROM file_color_meta WHERE file_id = ?",
        (file_id,),
    )

    # Skip upsert if existing source is 'manual' and we're trying to insert 'auto'
    if existing and existing[0] == "manual" and source == "auto":
        return await get_file_color_meta(file_id)

    await db.execute(
        """
        INSERT INTO file_color_meta (file_id, color_space, color_transfer, color_primaries, log_profile, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_id) DO UPDATE SET
            color_space     = excluded.color_space,
            color_transfer  = excluded.color_transfer,
            color_primaries = excluded.color_primaries,
            log_profile     = excluded.log_profile,
            source          = excluded.source,
            updated_at      = excluded.updated_at
        """,
        (file_id, color_space, color_transfer, color_primaries, log_profile, source, updated_at),
    )
    return await get_file_color_meta(file_id)


# ============================================================================
# FILE LUT PREFERENCES
# ============================================================================


async def get_file_lut_pref(file_id: str) -> Optional[Dict[str, Any]]:
    """Get LUT preference for a file."""
    db = get_db()
    row = await db.fetchone(
        "SELECT file_id, lut_id, intensity, updated_at FROM file_lut_prefs WHERE file_id = ?",
        (file_id,),
    )
    if not row:
        return None
    return {
        "file_id": row[0],
        "lut_id": row[1],
        "intensity": row[2],
        "updated_at": row[3],
    }


async def upsert_file_lut_pref(file_id: str, lut_id: Optional[str], intensity: float = 1.0) -> Dict[str, Any]:
    """Upsert LUT preference for a file."""
    updated_at = _now_iso()
    db = get_db()
    await db.execute(
        """
        INSERT INTO file_lut_prefs (file_id, lut_id, intensity, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(file_id) DO UPDATE SET
            lut_id     = excluded.lut_id,
            intensity  = excluded.intensity,
            updated_at = excluded.updated_at
        """,
        (file_id, lut_id, intensity, updated_at),
    )
    return await get_file_lut_pref(file_id)


async def delete_file_lut_pref(file_id: str) -> None:
    """Delete LUT preference for a file."""
    db = get_db()
    await db.execute("DELETE FROM file_lut_prefs WHERE file_id = ?", (file_id,))


async def get_lut_file_path(lut_id: str) -> Optional[str]:
    """Get absolute file path for a LUT by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT file_path FROM luts WHERE id = ?",
        (lut_id,),
    )
    return row[0] if row else None


# ── Annotation CRUD (Feature 5) — keyed by file_path ─────────────────────────

# Tags

async def get_file_tags(file_path: str) -> List[str]:
    """Get all tags for a file."""
    db = get_db()
    rows = await db.fetch(
        "SELECT tag FROM file_tags WHERE file_path = ? ORDER BY created_at",
        (file_path,),
    )
    return [row[0] for row in rows]


async def add_file_tag(file_path: str, tag: str) -> Dict[str, Any]:
    """Add a tag to a file. Idempotent — returns existing record if tag already exists."""
    db = get_db()
    now = _now_iso()
    existing = await db.fetchone(
        "SELECT id, tag, created_at FROM file_tags WHERE file_path = ? AND tag = ?",
        (file_path, tag),
    )
    if existing:
        return {"id": existing[0], "tag": existing[1], "created_at": existing[2]}
    tag_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO file_tags (id, file_path, tag, created_at) VALUES (?, ?, ?, ?)",
        (tag_id, file_path, tag, now),
    )
    return {"id": tag_id, "tag": tag, "created_at": now}


async def remove_file_tag(file_path: str, tag: str) -> bool:
    """Remove a tag from a file. Returns True if it existed."""
    db = get_db()
    existing = await db.fetchone(
        "SELECT id FROM file_tags WHERE file_path = ? AND tag = ?",
        (file_path, tag),
    )
    if not existing:
        return False
    await db.execute(
        "DELETE FROM file_tags WHERE file_path = ? AND tag = ?",
        (file_path, tag),
    )
    return True


async def get_distinct_tags() -> List[str]:
    """Get all distinct tags across all files (for autocomplete)."""
    db = get_db()
    rows = await db.fetch("SELECT DISTINCT tag FROM file_tags ORDER BY tag")
    return [row[0] for row in rows]


# Rating

async def get_file_rating(file_path: str) -> Optional[int]:
    """Get rating (1-5) for a file, or None if unrated."""
    db = get_db()
    row = await db.fetchone(
        "SELECT rating FROM file_ratings WHERE file_path = ?",
        (file_path,),
    )
    return row[0] if row else None


async def set_file_rating(file_path: str, rating: Optional[int]) -> bool:
    """Set or clear rating (1-5) for a file by path."""
    db = get_db()
    if rating is None:
        await db.execute("DELETE FROM file_ratings WHERE file_path = ?", (file_path,))
    else:
        now = _now_iso()
        await db.execute(
            "INSERT INTO file_ratings (file_path, rating, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(file_path) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at",
            (file_path, rating, now),
        )
    return True


# Comments

async def get_file_comments(file_path: str) -> List[Dict[str, Any]]:
    """Get all comments for a file, ordered by created_at."""
    db = get_db()
    rows = await db.fetch(
        "SELECT id, body, timestamp_seconds, created_at FROM file_comments WHERE file_path = ? ORDER BY created_at",
        (file_path,),
    )
    return [
        {"id": row[0], "body": row[1], "timestamp_seconds": row[2], "created_at": row[3]}
        for row in rows
    ]


async def add_file_comment(file_path: str, body: str, timestamp_seconds: Optional[float]) -> Dict[str, Any]:
    """Add a comment to a file."""
    db = get_db()
    comment_id = str(uuid.uuid4())
    now = _now_iso()
    await db.execute(
        "INSERT INTO file_comments (id, file_path, body, timestamp_seconds, created_at) VALUES (?, ?, ?, ?, ?)",
        (comment_id, file_path, body, timestamp_seconds, now),
    )
    return {"id": comment_id, "body": body, "timestamp_seconds": timestamp_seconds, "created_at": now}


async def delete_file_comment(comment_id: str) -> bool:
    """Delete a comment. Returns True if it existed."""
    db = get_db()
    existing = await db.fetchone("SELECT id FROM file_comments WHERE id = ?", (comment_id,))
    if not existing:
        return False
    await db.execute("DELETE FROM file_comments WHERE id = ?", (comment_id,))
    return True


# Markers

async def get_file_markers(file_path: str) -> List[Dict[str, Any]]:
    """Get all markers for a file, ordered by timestamp."""
    db = get_db()
    rows = await db.fetch(
        "SELECT id, timestamp_seconds, label, color, created_at FROM file_markers WHERE file_path = ? ORDER BY timestamp_seconds",
        (file_path,),
    )
    return [
        {"id": row[0], "timestamp_seconds": row[1], "label": row[2], "color": row[3], "created_at": row[4]}
        for row in rows
    ]


async def add_file_marker(file_path: str, timestamp_seconds: float, label: str, color: str) -> Dict[str, Any]:
    """Add a timeline marker to a file."""
    db = get_db()
    marker_id = str(uuid.uuid4())
    now = _now_iso()
    await db.execute(
        "INSERT INTO file_markers (id, file_path, timestamp_seconds, label, color, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (marker_id, file_path, timestamp_seconds, label, color, now),
    )
    return {"id": marker_id, "timestamp_seconds": timestamp_seconds, "label": label, "color": color, "created_at": now}


async def delete_file_marker(marker_id: str) -> bool:
    """Delete a marker. Returns True if it existed."""
    db = get_db()
    existing = await db.fetchone("SELECT id FROM file_markers WHERE id = ?", (marker_id,))
    if not existing:
        return False
    await db.execute("DELETE FROM file_markers WHERE id = ?", (marker_id,))
    return True


async def update_file_marker(marker_id: str, label: str, color: str) -> Optional[Dict[str, Any]]:
    """Update label and color of a marker. Returns updated record or None if not found."""
    db = get_db()
    existing = await db.fetchone(
        "SELECT id, timestamp_seconds, created_at FROM file_markers WHERE id = ?",
        (marker_id,),
    )
    if not existing:
        return None
    await db.execute(
        "UPDATE file_markers SET label = ?, color = ? WHERE id = ?",
        (label, color, marker_id),
    )
    return {"id": existing[0], "timestamp_seconds": existing[1], "label": label, "color": color, "created_at": existing[2]}


# Batch loaders (avoid N+1 in project endpoint) — JOIN via file_path

async def get_tags_for_files(file_ids: List[str]) -> Dict[str, List[str]]:
    """Batch-load tags for multiple project_file ids. Returns {file_id: [tag, ...]}."""
    if not file_ids:
        return {}
    db = get_db()
    placeholders = ",".join("?" * len(file_ids))
    rows = await db.fetch(
        f"SELECT pf.id, ft.tag FROM project_files pf "
        f"LEFT JOIN file_tags ft ON ft.file_path = pf.file_path "
        f"WHERE pf.id IN ({placeholders}) ORDER BY ft.created_at",
        tuple(file_ids),
    )
    result: Dict[str, List[str]] = {fid: [] for fid in file_ids}
    for row in rows:
        if row[1] is not None:
            result[row[0]].append(row[1])
    return result


async def get_ratings_for_files(file_ids: List[str]) -> Dict[str, Optional[int]]:
    """Batch-load ratings for multiple project_file ids. Returns {file_id: rating|None}."""
    if not file_ids:
        return {}
    db = get_db()
    placeholders = ",".join("?" * len(file_ids))
    rows = await db.fetch(
        f"SELECT pf.id, fr.rating FROM project_files pf "
        f"LEFT JOIN file_ratings fr ON fr.file_path = pf.file_path "
        f"WHERE pf.id IN ({placeholders})",
        tuple(file_ids),
    )
    result: Dict[str, Optional[int]] = {fid: None for fid in file_ids}
    for row in rows:
        result[row[0]] = row[1]
    return result


async def get_comments_for_files(file_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """Batch-load comments for multiple project_file ids. Returns {file_id: [comment, ...]}."""
    if not file_ids:
        return {}
    db = get_db()
    placeholders = ",".join("?" * len(file_ids))
    rows = await db.fetch(
        f"SELECT pf.id, fc.id, fc.body, fc.timestamp_seconds, fc.created_at "
        f"FROM project_files pf "
        f"LEFT JOIN file_comments fc ON fc.file_path = pf.file_path "
        f"WHERE pf.id IN ({placeholders}) ORDER BY fc.created_at",
        tuple(file_ids),
    )
    result: Dict[str, List[Dict[str, Any]]] = {fid: [] for fid in file_ids}
    for row in rows:
        if row[1] is not None:
            result[row[0]].append({"id": row[1], "body": row[2], "timestamp_seconds": row[3], "created_at": row[4]})
    return result


async def get_markers_for_files(file_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """Batch-load markers for multiple project_file ids. Returns {file_id: [marker, ...]}."""
    if not file_ids:
        return {}
    db = get_db()
    placeholders = ",".join("?" * len(file_ids))
    rows = await db.fetch(
        f"SELECT pf.id, fm.id, fm.timestamp_seconds, fm.label, fm.color, fm.created_at "
        f"FROM project_files pf "
        f"LEFT JOIN file_markers fm ON fm.file_path = pf.file_path "
        f"WHERE pf.id IN ({placeholders}) ORDER BY fm.timestamp_seconds",
        tuple(file_ids),
    )
    result: Dict[str, List[Dict[str, Any]]] = {fid: [] for fid in file_ids}
    for row in rows:
        if row[1] is not None:
            result[row[0]].append({"id": row[1], "timestamp_seconds": row[2], "label": row[3], "color": row[4], "created_at": row[5]})
    return result


async def get_annotations_for_paths(file_paths: List[str]) -> Dict[str, Dict[str, Any]]:
    """Batch-load all annotations (tags, rating, comments, markers) for a list of paths.
    Returns {file_path: {tags, rating, comments, markers}}."""
    if not file_paths:
        return {}
    db = get_db()
    placeholders = ",".join("?" * len(file_paths))
    params = tuple(file_paths)

    tag_rows = await db.fetch(
        f"SELECT file_path, tag FROM file_tags WHERE file_path IN ({placeholders}) ORDER BY created_at",
        params,
    )
    rating_rows = await db.fetch(
        f"SELECT file_path, rating FROM file_ratings WHERE file_path IN ({placeholders})",
        params,
    )
    comment_rows = await db.fetch(
        f"SELECT file_path, id, body, timestamp_seconds, created_at FROM file_comments WHERE file_path IN ({placeholders}) ORDER BY created_at",
        params,
    )
    marker_rows = await db.fetch(
        f"SELECT file_path, id, timestamp_seconds, label, color, created_at FROM file_markers WHERE file_path IN ({placeholders}) ORDER BY timestamp_seconds",
        params,
    )

    result: Dict[str, Dict[str, Any]] = {
        p: {"tags": [], "rating": None, "comments": [], "markers": []}
        for p in file_paths
    }
    for row in tag_rows:
        result[row[0]]["tags"].append(row[1])
    for row in rating_rows:
        result[row[0]]["rating"] = row[1]
    for row in comment_rows:
        result[row[0]]["comments"].append({"id": row[1], "body": row[2], "timestamp_seconds": row[3], "created_at": row[4]})
    for row in marker_rows:
        result[row[0]]["markers"].append({"id": row[1], "timestamp_seconds": row[2], "label": row[3], "color": row[4], "created_at": row[5]})
    return result


# ============================================================================
# USERS — extended fields (Feature 8)
# ============================================================================


async def update_user_display_name(user_id: str, display_name: str) -> None:
    """Update a user's display name."""
    db = get_db()
    await db.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name, user_id))


async def set_user_active(user_id: str, active: bool) -> None:
    """Suspend or reactivate a user account."""
    db = get_db()
    await db.execute("UPDATE users SET active = ? WHERE id = ?", (1 if active else 0, user_id))


async def record_login_success(user_id: str, ip: Optional[str], user_agent: Optional[str]) -> None:
    """Record a successful login: set last_login timestamp."""
    db = get_db()
    now = _now_iso()
    await db.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_id))


async def get_all_users_full() -> List[Dict[str, Any]]:
    """Get all users including new fields (no password_hash)."""
    db = get_db()
    rows = await db.fetch(
        """SELECT id, username, created_at, role, display_name, active, last_login, pwd_changed_at
           FROM users ORDER BY created_at"""
    )
    return [
        {
            "id": row[0],
            "username": row[1],
            "created_at": row[2],
            "role": row[3],
            "display_name": row[4],
            "active": bool(row[5]),
            "last_login": row[6],
            "pwd_changed_at": row[7],
        }
        for row in rows
    ]


async def set_pwd_changed_at(user_id: str) -> None:
    """Record that the user's password was just changed."""
    db = get_db()
    await db.execute("UPDATE users SET pwd_changed_at = ? WHERE id = ?", (_now_iso(), user_id))


# ============================================================================
# SESSIONS (Feature 8)
# ============================================================================


async def create_session(
    session_id: str,
    user_id: str,
    expires_at: str,
    ip: Optional[str],
    user_agent: Optional[str],
) -> None:
    """Create a new server-side session record."""
    db = get_db()
    now = _now_iso()
    await db.execute(
        """INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, user_agent, ip_address, revoked)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)""",
        (session_id, user_id, now, now, expires_at, user_agent, ip),
    )


async def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Get a session by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, user_id, created_at, last_seen, expires_at, user_agent, ip_address, revoked FROM sessions WHERE id = ?",
        (session_id,),
    )
    if not row:
        return None
    return {
        "id": row[0],
        "user_id": row[1],
        "created_at": row[2],
        "last_seen": row[3],
        "expires_at": row[4],
        "user_agent": row[5],
        "ip_address": row[6],
        "revoked": bool(row[7]),
    }


async def touch_session(session_id: str) -> None:
    """Update last_seen to now for an active session."""
    db = get_db()
    await db.execute("UPDATE sessions SET last_seen = ? WHERE id = ?", (_now_iso(), session_id))


async def revoke_session(session_id: str) -> None:
    """Mark a session as revoked."""
    db = get_db()
    await db.execute("UPDATE sessions SET revoked = 1 WHERE id = ?", (session_id,))


async def revoke_all_sessions(user_id: str) -> int:
    """Revoke all active sessions for a user. Returns count revoked."""
    db = get_db()
    rows = await db.fetch(
        "SELECT id FROM sessions WHERE user_id = ? AND revoked = 0",
        (user_id,),
    )
    count = len(rows)
    if count:
        await db.execute(
            "UPDATE sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0",
            (user_id,),
        )
    return count


async def get_user_sessions(user_id: str) -> List[Dict[str, Any]]:
    """Get all active (non-revoked, non-expired) sessions for a user."""
    db = get_db()
    now = _now_iso()
    rows = await db.fetch(
        """SELECT id, created_at, last_seen, expires_at, user_agent, ip_address
           FROM sessions
           WHERE user_id = ? AND revoked = 0 AND expires_at > ?
           ORDER BY last_seen DESC""",
        (user_id, now),
    )
    return [
        {
            "id": row[0],
            "created_at": row[1],
            "last_seen": row[2],
            "expires_at": row[3],
            "user_agent": row[4],
            "ip_address": row[5],
        }
        for row in rows
    ]


async def is_session_valid(session_id: str) -> bool:
    """Return True if session exists, is not revoked, and is not expired."""
    db = get_db()
    now = _now_iso()
    row = await db.fetchone(
        "SELECT id FROM sessions WHERE id = ? AND revoked = 0 AND expires_at > ?",
        (session_id, now),
    )
    return row is not None


async def clean_expired_sessions() -> int:
    """Delete expired or revoked sessions. Returns count deleted."""
    db = get_db()
    now = _now_iso()
    rows = await db.fetch(
        "SELECT id FROM sessions WHERE expires_at <= ? OR revoked = 1",
        (now,),
    )
    count = len(rows)
    if count:
        await db.execute(
            "DELETE FROM sessions WHERE expires_at <= ? OR revoked = 1",
            (now,),
        )
    return count


# ============================================================================
# INVITES (Feature 8)
# ============================================================================


async def create_invite(created_by_id: str, role: str, expires_at: str) -> str:
    """Create a single-use invite link. Returns the invite ID (used as URL token)."""
    db = get_db()
    invite_id = _new_uuid()
    now = _now_iso()
    await db.execute(
        "INSERT INTO invites (id, created_by, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (invite_id, created_by_id, role, now, expires_at),
    )
    return invite_id


async def get_invite(invite_id: str) -> Optional[Dict[str, Any]]:
    """Get an invite by ID."""
    db = get_db()
    row = await db.fetchone(
        "SELECT id, created_by, role, created_at, expires_at, used_at, used_by FROM invites WHERE id = ?",
        (invite_id,),
    )
    if not row:
        return None
    return {
        "id": row[0],
        "created_by": row[1],
        "role": row[2],
        "created_at": row[3],
        "expires_at": row[4],
        "used_at": row[5],
        "used_by": row[6],
    }


async def consume_invite(invite_id: str, user_id: str) -> None:
    """Mark an invite as used."""
    db = get_db()
    now = _now_iso()
    await db.execute(
        "UPDATE invites SET used_at = ?, used_by = ? WHERE id = ?",
        (now, user_id, invite_id),
    )


async def list_invites(active_only: bool = True) -> List[Dict[str, Any]]:
    """List invites. If active_only=True, return only unused non-expired invites."""
    db = get_db()
    now = _now_iso()
    if active_only:
        rows = await db.fetch(
            """SELECT i.id, i.created_by, u.username, i.role, i.created_at, i.expires_at, i.used_at, i.used_by
               FROM invites i LEFT JOIN users u ON u.id = i.created_by
               WHERE i.used_at IS NULL AND i.expires_at > ?
               ORDER BY i.created_at DESC""",
            (now,),
        )
    else:
        rows = await db.fetch(
            """SELECT i.id, i.created_by, u.username, i.role, i.created_at, i.expires_at, i.used_at, i.used_by
               FROM invites i LEFT JOIN users u ON u.id = i.created_by
               ORDER BY i.created_at DESC"""
        )
    return [
        {
            "id": row[0],
            "created_by": row[1],
            "created_by_username": row[2],
            "role": row[3],
            "created_at": row[4],
            "expires_at": row[5],
            "used_at": row[6],
            "used_by": row[7],
        }
        for row in rows
    ]


async def delete_invite(invite_id: str) -> None:
    """Delete an invite."""
    db = get_db()
    await db.execute("DELETE FROM invites WHERE id = ?", (invite_id,))


# ============================================================================
# AUDIT LOG (Feature 8)
# ============================================================================


async def write_audit(
    actor_id: Optional[str],
    actor_name: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    target_name: Optional[str] = None,
    detail: Optional[str] = None,
    ip: Optional[str] = None,
) -> None:
    """Write an immutable audit log entry."""
    db = get_db()
    entry_id = _new_uuid()
    now = _now_iso()
    await db.execute(
        """INSERT INTO audit_log
           (id, actor_id, actor_name, action, target_type, target_id, target_name, detail, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (entry_id, actor_id, actor_name, action, target_type, target_id, target_name, detail, ip, now),
    )


async def get_audit_log(
    limit: int = 50,
    offset: int = 0,
    actor_id: Optional[str] = None,
    action: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch audit log entries in reverse chronological order."""
    db = get_db()
    conditions = []
    params: list = []
    if actor_id:
        conditions.append("(actor_id = ? OR target_id = ?)")
        params.extend([actor_id, actor_id])
    if action:
        conditions.append("action = ?")
        params.append(action)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.extend([limit, offset])
    rows = await db.fetch(
        f"""SELECT id, actor_id, actor_name, action, target_type, target_id, target_name, detail, ip_address, created_at
            FROM audit_log {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?""",
        tuple(params),
    )
    return [
        {
            "id": row[0],
            "actor_id": row[1],
            "actor_name": row[2],
            "action": row[3],
            "target_type": row[4],
            "target_id": row[5],
            "target_name": row[6],
            "detail": row[7],
            "ip_address": row[8],
            "created_at": row[9],
        }
        for row in rows
    ]


