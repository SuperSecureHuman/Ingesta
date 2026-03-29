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
    segment_length: int = 6

    # Database
    database_url: str = "sqlite+aio:///./data/hls_poc.db"

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


# Export singleton instance
settings = Settings()
