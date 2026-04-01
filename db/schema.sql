-- Database Schema
-- Supports both SQLite and PostgreSQL

-- Libraries: named roots pointing to filesystem directories
CREATE TABLE IF NOT EXISTS libraries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    root_path TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Projects: named collections of files
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    library_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (library_id) REFERENCES libraries (id)
);

-- Project files: individual media files in a project
CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mtime REAL NOT NULL,

    -- Cached probe results (populated by background scanner)
    duration_seconds REAL,
    width INTEGER,
    height INTEGER,
    bitrate INTEGER,
    video_codec TEXT,

    -- Scanning status
    scan_status TEXT DEFAULT 'pending',  -- pending | done | error
    scan_error TEXT,

    -- Source tagging (camera/lens shot on)
    camera TEXT,
    lens TEXT,

    added_at TEXT NOT NULL,

    FOREIGN KEY (project_id) REFERENCES projects (id)
);

-- Shares: password-protected access tokens for projects
CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    active BOOLEAN DEFAULT 1,

    FOREIGN KEY (project_id) REFERENCES projects (id)
);

-- Users: admin accounts for login
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    display_name TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    last_login TEXT,
    pwd_changed_at TEXT
);

-- Server-side sessions (each login creates a row; logout revokes it)
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    user_agent  TEXT,
    ip_address  TEXT,
    revoked     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Invite links (single-use, time-limited)
CREATE TABLE IF NOT EXISTS invites (
    id          TEXT PRIMARY KEY,
    created_by  TEXT NOT NULL REFERENCES users(id),
    role        TEXT NOT NULL DEFAULT 'viewer',
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    used_at     TEXT,
    used_by     TEXT REFERENCES users(id)
);

-- Immutable audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT,
    actor_name  TEXT NOT NULL,
    action      TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    target_name TEXT,
    detail      TEXT,
    ip_address  TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Create indexes for common queries
-- LUT library: 3D color lookup tables for live preview
CREATE TABLE IF NOT EXISTS luts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    camera      TEXT NOT NULL,
    log_profile TEXT NOT NULL,
    color_space TEXT,
    gamma       TEXT,
    file_path   TEXT NOT NULL UNIQUE,
    lut_type    TEXT NOT NULL DEFAULT '3d',
    created_at  TEXT NOT NULL
);

-- File color metadata: auto-detected or manually-set color profile for each file
CREATE TABLE IF NOT EXISTS file_color_meta (
    file_id         TEXT PRIMARY KEY REFERENCES project_files(id) ON DELETE CASCADE,
    color_space     TEXT,
    color_transfer  TEXT,
    color_primaries TEXT,
    log_profile     TEXT,
    source          TEXT NOT NULL DEFAULT 'auto',
    updated_at      TEXT NOT NULL
);

-- File path tags: camera/lens/lut stored by absolute path, independent of projects
CREATE TABLE IF NOT EXISTS file_path_tags (
    file_path     TEXT PRIMARY KEY,
    camera        TEXT,
    lens          TEXT,
    lut_id        TEXT,
    lut_intensity REAL DEFAULT 1.0,
    updated_at    TEXT NOT NULL
);

-- File LUT preferences: saved LUT selection and intensity per file
CREATE TABLE IF NOT EXISTS file_lut_prefs (
    file_id    TEXT PRIMARY KEY REFERENCES project_files(id) ON DELETE CASCADE,
    lut_id     TEXT REFERENCES luts(id) ON DELETE SET NULL,
    intensity  REAL NOT NULL DEFAULT 1.0,
    updated_at TEXT NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_library_id ON projects (library_id);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files (project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id_path ON project_files (project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_project_files_scan_status ON project_files (scan_status);
CREATE INDEX IF NOT EXISTS idx_shares_project_id ON shares (project_id);
CREATE INDEX IF NOT EXISTS idx_shares_active ON shares (active);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_luts_camera ON luts (camera);
CREATE INDEX IF NOT EXISTS idx_luts_log_profile ON luts (log_profile);
CREATE INDEX IF NOT EXISTS idx_file_color_meta_source ON file_color_meta (source);

-- Per-library permission overrides (overrides global role for a specific library)
CREATE TABLE IF NOT EXISTS library_permissions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
    created_at TEXT NOT NULL,
    UNIQUE(user_id, library_id)
);

CREATE INDEX IF NOT EXISTS idx_lib_perms_user_id ON library_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_lib_perms_library_id ON library_permissions (library_id);

-- Annotation tables (Feature 5) — keyed by file_path for cross-project/library consistency
CREATE TABLE IF NOT EXISTS file_tags (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(file_path, tag)
);
CREATE INDEX IF NOT EXISTS idx_file_tags_file_path ON file_tags(file_path);

CREATE TABLE IF NOT EXISTS file_ratings (
  file_path TEXT PRIMARY KEY,
  rating INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_comments (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  body TEXT NOT NULL,
  timestamp_seconds REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_comments_file_path ON file_comments(file_path);

CREATE TABLE IF NOT EXISTS file_markers (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  timestamp_seconds REAL NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#f59e0b',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_markers_file_path ON file_markers(file_path);
