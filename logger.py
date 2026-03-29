"""
Structured logging configuration with JSON output and request tracing.
"""

import json
import logging
import logging.config
import sys
from typing import Optional
from contextvars import ContextVar

from config import settings

# Context variable for request ID tracking
_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging output."""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_data = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add request ID if available
        request_id = _request_id_ctx.get()
        if request_id:
            log_data["request_id"] = request_id

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields
        if hasattr(record, "stream_id"):
            log_data["stream_id"] = record.stream_id
        if hasattr(record, "file_path"):
            log_data["file_path"] = record.file_path
        if hasattr(record, "pid"):
            log_data["pid"] = record.pid
        if hasattr(record, "quality"):
            log_data["quality"] = record.quality
        if hasattr(record, "duration"):
            log_data["duration"] = record.duration

        return json.dumps(log_data)


def setup_logging() -> None:
    """Initialize logging configuration from config.log_level."""
    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": JSONFormatter,
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "json",
                "stream": "ext://sys.stdout",
            },
        },
        "root": {
            "level": settings.log_level.upper(),
            "handlers": ["console"],
        },
        "loggers": {
            "main": {"level": settings.log_level.upper()},
            "routes": {"level": settings.log_level.upper()},
            "media": {"level": settings.log_level.upper()},
            "db": {"level": settings.log_level.upper()},
        },
    }

    logging.config.dictConfig(config)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance."""
    return logging.getLogger(name)


def set_request_id(request_id: Optional[str]) -> None:
    """Set the request ID for the current context."""
    _request_id_ctx.set(request_id)


def get_request_id() -> Optional[str]:
    """Get the current request ID."""
    return _request_id_ctx.get()
