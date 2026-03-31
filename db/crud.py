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

