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
    created_at TEXT NOT NULL
);

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
