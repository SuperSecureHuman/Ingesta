"""
Configuration management using pydantic-settings.
Reads from .env file with sensible defaults.
"""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    # Media paths
    media_root: str = ""

    # Transcoding
    segment_length: int = 1

    # FFmpeg/FFprobe executables (project-local or system)
    ffmpeg_path: str = "/Users/I749659/repo/hls_poc/ffmpeg"
    ffprobe_path: str = "/Users/I749659/repo/hls_poc/ffprobe"

    # Database
    database_url: str = "sqlite+aio:///./data/hls_realtime.db"

    # Server
    max_concurrent_streams: int = 10

    # Security
    secret_key: str = "change-me-in-production"
    admin_api_key: str = "change-me-in-production"
    admin_username: str = "admin"
    admin_password: str = "changeme"

    # Background tasks
    scanner_interval: int = 30  # seconds between background file scans
    cleanup_interval: int = 20  # seconds between cleanup runs
    workdir_cleanup_interval: int = 300  # seconds between work dir cleanup
    workdir_retention_seconds: int = 3600  # keep work dirs for 1 hour
    segment_retention_seconds: int = 120  # keep segments for 2 minutes

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"  # Ignore extra env vars not defined in model


def _resolve_executable(
    env_override: str, executable_name: str, project_root: Path
) -> str:
    """
    Resolve executable path with priority:
    1. Environment variable override (if set and file exists)
    2. System PATH (just the executable_name)
    3. Project-local binary (project_root/executable_name if exists, as fallback)
    """
    if env_override and Path(env_override).exists():
        return env_override

    # Try system PATH first
    return executable_name


# Export singleton instance
settings = Settings()

# Post-process ffmpeg/ffprobe paths to resolve local vs system
PROJECT_ROOT = Path(__file__).parent
if not settings.ffmpeg_path:
    settings.ffmpeg_path = _resolve_executable(
        settings.ffmpeg_path, "ffmpeg", PROJECT_ROOT
    )
if not settings.ffprobe_path:
    settings.ffprobe_path = _resolve_executable(
        settings.ffprobe_path, "ffprobe", PROJECT_ROOT
    )
