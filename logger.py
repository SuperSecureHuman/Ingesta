"""
Structured logging configuration with dual formatters: JSON for production, colored text for CLI.
"""

import json
import logging
import logging.config
import sys
import os
from typing import Optional
from contextvars import ContextVar

from config import settings

# Context variable for request ID tracking
_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

# Color codes for CLI output
class _Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"


class CliFormatter(logging.Formatter):
    """Human-readable formatter with colors for CLI output."""

    LEVEL_COLORS = {
        "DEBUG": _Colors.CYAN,
        "INFO": _Colors.GREEN,
        "WARNING": _Colors.YELLOW,
        "ERROR": _Colors.RED,
        "CRITICAL": _Colors.RED + _Colors.BOLD,
    }

    def format(self, record: logging.LogRecord) -> str:
        """Format log record for CLI with colors and extra fields."""
        level_color = self.LEVEL_COLORS.get(record.levelname, "")
        timestamp = self.formatTime(record, datefmt="%H:%M:%S")

        # Check if this is a special FFmpeg command log
        if hasattr(record, "ffmpeg_command") and record.ffmpeg_command:
            # Special formatted FFmpeg command log - break into arguments
            cmd = record.ffmpeg_command
            args = cmd.split()

            # Format the command nicely with one argument per line
            formatted_cmd = f"{_Colors.BOLD}{_Colors.MAGENTA}🎬 FFMPEG COMMAND:{_Colors.RESET}\n"
            formatted_cmd += f"{_Colors.BOLD}{_Colors.CYAN}ffmpeg"
            for i, arg in enumerate(args):
                # Add newline every 3 args for readability
                if (i + 1) % 3 == 0:
                    formatted_cmd += f" \\\n  {_Colors.CYAN}{arg}{_Colors.RESET}"
                else:
                    formatted_cmd += f" {_Colors.CYAN}{arg}{_Colors.RESET}"
            formatted_cmd += f"{_Colors.RESET}"

            return (
                f"{_Colors.DIM}{timestamp}{_Colors.RESET}\n"
                f"{formatted_cmd}"
            )

        # Build base log line
        log_line = f"{_Colors.DIM}{timestamp}{_Colors.RESET} {level_color}{record.levelname:8}{_Colors.RESET} {record.name:20} {record.getMessage()}"

        # Add extra fields inline
        extras = []
        if hasattr(record, "stream_id"):
            extras.append(f"stream={record.stream_id}")
        if hasattr(record, "pid"):
            extras.append(f"pid={record.pid}")
        if hasattr(record, "file_path"):
            extras.append(f"file={record.file_path}")
        if hasattr(record, "quality"):
            extras.append(f"quality={record.quality}")
        if hasattr(record, "width") and hasattr(record, "height"):
            extras.append(f"{record.width}x{record.height}")
        if hasattr(record, "bitrate"):
            extras.append(f"{record.bitrate}bps")

        if extras:
            log_line += f" {_Colors.MAGENTA}[{', '.join(extras)}]{_Colors.RESET}"

        # Add request ID if available
        request_id = _request_id_ctx.get()
        if request_id:
            log_line += f" {_Colors.BLUE}req={request_id[:8]}...{_Colors.RESET}"

        # Add exception info if present
        if record.exc_info:
            log_line += "\n" + self.formatException(record.exc_info)

        return log_line


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
    """Initialize logging configuration from config.log_level.

    Detects environment and uses:
    - CLI formatter (colored text) when stdout is a TTY or LOG_FORMAT=text
    - JSON formatter for production/structured logging (LOG_FORMAT=json)
    """
    # Detect format preference
    log_format = os.getenv("LOG_FORMAT", "").lower()
    is_tty = sys.stdout.isatty()
    use_json = log_format == "json" or (not is_tty and log_format != "text")

    formatter_name = "json" if use_json else "cli"

    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "cli": {
                "()": CliFormatter,
            },
            "json": {
                "()": JSONFormatter,
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": formatter_name,
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
