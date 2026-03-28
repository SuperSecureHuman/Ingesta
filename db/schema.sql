-- HLS POC Database Schema
-- Supports both SQLite and PostgreSQL

-- Libraries: named roots pointing to filesystem directories
CREATE TABLE IF NOT EXISTS libraries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_projects_library_id ON projects (library_id);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files (project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_project_id_path ON project_files (project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_project_files_scan_status ON project_files (scan_status);
CREATE INDEX IF NOT EXISTS idx_shares_project_id ON shares (project_id);
CREATE INDEX IF NOT EXISTS idx_shares_active ON shares (active);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
