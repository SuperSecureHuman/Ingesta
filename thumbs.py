"""
Thumbnail extraction: frame grabbing from video files via FFmpeg.
Mirrors Jellyfin's MediaEncoder thumbnail logic.
"""
import asyncio
import hashlib
import os
from pathlib import Path

THUMB_DIR = Path(os.getenv("THUMB_DIR", "/tmp/hls_thumbs"))


async def extract_frame(
    source_path: str,
    offset_sec: float,
    output_path: Path,
    width: int = 320,
    fast: bool = True,
) -> bool:
    """
    Extract single JPEG frame from video at offset_sec.

    Args:
        source_path: path to video file
        offset_sec: seek position in seconds
        output_path: output JPEG file path
        width: output width (height auto-scaled to maintain aspect ratio)
        fast: if True, use -skip_frame nokey to only decode keyframes (faster)

    Returns:
        True if extraction succeeded (output file exists), False otherwise.
    """
    cmd = ["ffmpeg"]

    if fast:
        cmd.extend(["-skip_frame", "nokey"])

    cmd.extend([
        "-ss", f"{offset_sec:.3f}",
        "-i", source_path,
        "-vframes", "1",
        "-vf", f"scale={width}:-2",
        "-vsync", "-1",
        "-f", "image2",
        "-y", str(output_path),
    ])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=10.0)
        return output_path.exists()
    except (asyncio.TimeoutError, OSError):
        return False


def thumb_path(source_path: str, offset_sec: float, width: int) -> Path:
    """Compute stable cache path for thumbnail based on source+offset+width."""
    key = hashlib.md5(f"{source_path}:{offset_sec}:{width}".encode()).hexdigest()
    return THUMB_DIR / key[:2] / f"{key}.jpg"


async def get_or_generate_thumb(source_path: str, offset_sec: float, width: int = 320) -> Path | None:
    """
    Get cached thumbnail or generate if missing.

    Returns:
        Path to JPEG file if found or successfully generated, None on failure.
    """
    path = thumb_path(source_path, offset_sec, width)

    # Return cached if exists
    if path.exists():
        return path

    # Generate and cache
    path.parent.mkdir(parents=True, exist_ok=True)
    ok = await extract_frame(source_path, offset_sec, path, width, fast=True)
    return path if ok else None
