"""
Playlist generation: VOD m3u8 generation and ffprobe wrapper
"""
import asyncio
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

TICKS_PER_SECOND = 10_000_000  # C# TimeSpan.TicksPerSecond

@dataclass
class MediaInfo:
    duration_seconds: float
    duration_ticks: int
    width: int
    height: int
    bitrate: int = 0  # bps, extracted from format.bit_rate

@dataclass
class PlaylistSegment:
    index: int
    duration_seconds: float
    runtime_ticks: int
    actual_length_ticks: int


async def probe_media(path: str) -> MediaInfo:
    """Run ffprobe and extract duration, resolution, and bitrate."""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )

    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {path}")

    data = json.loads(stdout)
    duration = float(data["format"]["duration"])
    bitrate = int(data["format"].get("bit_rate", 0))

    # Find video stream for resolution
    width, height = 1920, 1080
    for stream in data.get("streams", []):
        if stream["codec_type"] == "video":
            width = stream.get("width", 1920)
            height = stream.get("height", 1080)
            break

    return MediaInfo(
        duration_seconds=duration,
        duration_ticks=int(duration * TICKS_PER_SECOND),
        width=width,
        height=height,
        bitrate=bitrate,
    )


def compute_equal_length_segments(
    duration_ticks: int, segment_length_seconds: int
) -> list[PlaylistSegment]:
    """Compute equal-length segments for transcoded content."""
    segments = []
    duration_seconds = duration_ticks / TICKS_PER_SECOND
    current_time = 0.0
    index = 0

    while current_time < duration_seconds:
        length = min(segment_length_seconds, duration_seconds - current_time)
        segments.append(
            PlaylistSegment(
                index=index,
                duration_seconds=length,
                runtime_ticks=int(current_time * TICKS_PER_SECOND),
                actual_length_ticks=int(length * TICKS_PER_SECOND),
            )
        )
        current_time += segment_length_seconds
        index += 1

    return segments


def build_vod_playlist(
    stream_id: str,
    segments: list[PlaylistSegment],
    segment_length_seconds: int,
    path: str,
    quality: str,
) -> str:
    """Build VOD m3u8 with per-segment runtimeTicks."""
    lines = [
        "#EXTM3U",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-VERSION:3",
        f"#EXT-X-TARGETDURATION:{segment_length_seconds}",
        "#EXT-X-MEDIA-SEQUENCE:0",
    ]

    for seg in segments:
        lines.append(f"#EXTINF:{seg.duration_seconds:.6f}, nodesc")
        segment_url = (
            f"/api/segment/{stream_id}/{seg.index}.ts?"
            f"runtimeTicks={seg.runtime_ticks}&"
            f"actualSegmentLengthTicks={seg.actual_length_ticks}&"
            f"path={path}&quality={quality}&segment_length={segment_length_seconds}"
        )
        lines.append(segment_url)

    lines.append("#EXT-X-ENDLIST")
    return "\n".join(lines)
