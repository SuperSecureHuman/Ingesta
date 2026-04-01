"""
Database abstraction layer supporting both SQLite (aiosqlite) and PostgreSQL (asyncpg).
Auto-detects driver based on DATABASE_URL.
"""

import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, List, Optional, Tuple

import aiosqlite
import asyncpg

from config import settings


class Database:
    """
    Thin database abstraction layer.
    Supports SQLite (sqlite+aio:///path) and PostgreSQL (postgresql+asyncpg://...).
    """

    def __init__(self, database_url: str):
        """
        Initialize database with connection string.

        Args:
            database_url: Connection string
                - SQLite: sqlite+aio:///./data/hls_realtime.db
                - PostgreSQL: postgresql+asyncpg://user:password@localhost/dbname
        """
        self.database_url = database_url
        self.driver = self._detect_driver(database_url)
        self.connection = None
        self.pool = None

    def _detect_driver(self, database_url: str) -> str:
        """Detect database driver from URL scheme."""
        if database_url.startswith("sqlite+aio://"):
            return "sqlite"
        elif database_url.startswith("postgresql+asyncpg://"):
            return "postgres"
        else:
            raise ValueError(f"Unsupported DATABASE_URL scheme: {database_url}")

    def _get_sqlite_path(self) -> str:
        """Extract file path from SQLite URL."""
        # sqlite+aio:///./data/hls_realtime.db -> ./data/hls_realtime.db
        match = re.match(r"sqlite\+aio:///?(.+)$", self.database_url)
        if not match:
            raise ValueError(f"Invalid SQLite URL: {self.database_url}")
        path = match.group(1)
        if path.startswith("./"):
            path = path
        return path

    async def connect(self) -> None:
        """Connect to database."""
        if self.driver == "sqlite":
            db_path = self._get_sqlite_path()
            # Create parent directories if needed
            db_file = Path(db_path)
            db_file.parent.mkdir(parents=True, exist_ok=True)
            self.connection = await aiosqlite.connect(db_path)
            # Enable foreign keys for SQLite
            await self.connection.execute("PRAGMA foreign_keys = ON")
        elif self.driver == "postgres":
            # Extract connection params from URL
            # postgresql+asyncpg://user:password@host:port/dbname
            match = re.match(
                r"postgresql\+asyncpg://(?:([^:]+)(?::([^@]+))?@)?([^:/?]+)(?::(\d+))?/(.+)$",
                self.database_url,
            )
            if not match:
                raise ValueError(f"Invalid PostgreSQL URL: {self.database_url}")

            user, password, host, port, dbname = match.groups()
            port = int(port) if port else 5432

            self.connection = await asyncpg.connect(
                user=user or "postgres",
                password=password or "",
                host=host or "localhost",
                port=port,
                database=dbname,
            )

    async def disconnect(self) -> None:
        """Disconnect from database."""
        if self.connection:
            if self.driver == "sqlite":
                await self.connection.close()
            elif self.driver == "postgres":
                await self.connection.close()
            self.connection = None

    async def execute(
        self, query: str, params: Optional[Tuple[Any, ...]] = None
    ) -> None:
        """Execute query without returning results (INSERT, UPDATE, DELETE)."""
        if not self.connection:
            raise RuntimeError("Database not connected")

        if self.driver == "sqlite":
            await self.connection.execute(query, params or ())
            await self.connection.commit()
        elif self.driver == "postgres":
            await self.connection.execute(query, *(params or ()))

    async def fetch(
        self, query: str, params: Optional[Tuple[Any, ...]] = None
    ) -> List[Any]:
        """Execute query and return all rows."""
        if not self.connection:
            raise RuntimeError("Database not connected")

        if self.driver == "sqlite":
            cursor = await self.connection.execute(query, params or ())
            rows = await cursor.fetchall()
            return rows
        elif self.driver == "postgres":
            rows = await self.connection.fetch(query, *(params or ()))
            return rows

    async def fetchone(
        self, query: str, params: Optional[Tuple[Any, ...]] = None
    ) -> Optional[Any]:
        """Execute query and return first row."""
        if not self.connection:
            raise RuntimeError("Database not connected")

        if self.driver == "sqlite":
            cursor = await self.connection.execute(query, params or ())
            row = await cursor.fetchone()
            return row
        elif self.driver == "postgres":
            row = await self.connection.fetchrow(query, *(params or ()))
            return row

    async def executescript(self, script: str) -> None:
        """Execute SQL script (multiple statements)."""
        if not self.connection:
            raise RuntimeError("Database not connected")

        if self.driver == "sqlite":
            await self.connection.executescript(script)
        elif self.driver == "postgres":
            # For PostgreSQL, split and execute each statement
            statements = [s.strip() for s in script.split(";") if s.strip()]
            for statement in statements:
                await self.connection.execute(statement)


# Global database instance
_db: Optional[Database] = None


async def init_db(database_url: str) -> Database:
    """Initialize global database instance."""
    global _db
    _db = Database(database_url)
    await _db.connect()

    # Pre-migration: drop old annotation tables (file_id keyed) before schema runs.
    # schema.sql has CREATE TABLE IF NOT EXISTS with file_path column; if the old
    # table already exists with file_id, the index CREATE would fail.
    try:
        cols = await _db.fetch("PRAGMA table_info(file_tags)")
        col_names = [c[1] for c in cols]
        if col_names and 'file_id' in col_names:
            for tbl in ('file_tags', 'file_comments', 'file_markers'):
                await _db.execute(f"DROP TABLE IF EXISTS {tbl}")
    except Exception:
        pass

    # Load and execute schema
    schema_path = Path(__file__).parent / "schema.sql"
    with open(schema_path, "r") as f:
        schema = f.read()
    await _db.executescript(schema)
    await run_migrations(_db)

    return _db


async def run_migrations(db: Database) -> None:
    """Apply incremental migrations that cannot be in schema.sql safely."""
    # Migration 001: add role column to users
    try:
        await db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'")
    except Exception as e:
        if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
            raise

    # Migration 002: ensure configured admin username has admin role (fixes existing DBs after migration)
    await db.execute(
        "UPDATE users SET role = 'admin' WHERE username = ? AND role = 'viewer'",
        (settings.admin_username,),
    )

    # Migration 003: add rating column to project_files
    try:
        await db.execute("ALTER TABLE project_files ADD COLUMN rating INTEGER")
    except Exception as e:
        if "duplicate column" not in str(e).lower() and "already exists" not in str(e).lower():
            raise

    # Migration 004: convert annotation tables from file_id FK to file_path keying.
    # Also introduces file_ratings table. Safe to run on empty tables (new feature).
    try:
        cols = await db.fetch("PRAGMA table_info(file_tags)")
        col_names = [c[1] for c in cols]
        if col_names and 'file_id' in col_names:
            await db.execute("DROP TABLE IF EXISTS file_tags")
            await db.execute("DROP TABLE IF EXISTS file_comments")
            await db.execute("DROP TABLE IF EXISTS file_markers")
            await db.executescript("""
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
                CREATE INDEX IF NOT EXISTS idx_file_markers_file_path ON file_markers(file_path)
            """)
    except Exception as e:
        if "already exists" not in str(e).lower():
            raise


async def close_db() -> None:
    """Close global database instance."""
    global _db
    if _db:
        await _db.disconnect()
        _db = None


def get_db() -> Database:
    """Get global database instance."""
    global _db
    if not _db:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db


@asynccontextmanager
async def get_db_context(database_url: str):
    """Async context manager for database."""
    db = Database(database_url)
    await db.connect()
    try:
        yield db
    finally:
        await db.disconnect()
