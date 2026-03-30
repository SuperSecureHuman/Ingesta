"""
Transcoder: FFmpeg process management, on-demand spawning, seeking
"""

import asyncio
import hashlib
import re
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from config import settings
from logger import get_logger

logger = get_logger("media.transcoder")

TICKS_PER_SECOND = 10_000_000

BITRATE_TIERS = [
    {"label": "120 Mbps", "key": "120M", "bitrate": 120_000_000, "max_height": None},
    {"label": "60 Mbps", "key": "60M", "bitrate": 60_000_000, "max_height": 2160},
    {"label": "40 Mbps", "key": "40M", "bitrate": 40_000_000, "max_height": 1440},
    {"label": "20 Mbps", "key": "20M", "bitrate": 20_000_000, "max_height": 1080},
    {"label": "10 Mbps", "key": "10M", "bitrate": 10_000_000, "max_height": 1080},
    {"label": "6 Mbps", "key": "6M", "bitrate": 6_000_000, "max_height": 720},
    {"label": "4 Mbps", "key": "4M", "bitrate": 4_000_000, "max_height": 720},
    {"label": "2 Mbps", "key": "2M", "bitrate": 2_000_000, "max_height": 480},
    {"label": "1 Mbps", "key": "1M", "bitrate": 1_000_000, "max_height": 360},
]


def get_bitrate_preset(quality: str) -> dict:
    """Get bitrate tier by key, or source."""
    if quality == "source":
        return {"vcodec": "copy", "acodec": "copy", "bitrate": None, "max_height": None}
    for tier in BITRATE_TIERS:
        if tier["key"] == quality:
            return {
                "vcodec": "libx264",
                "acodec": "aac",
                "bitrate": tier["bitrate"],
                "max_height": tier["max_height"],
            }
    raise ValueError(f"Unknown quality: {quality}")


@dataclass
class TranscodeJob:
    stream_id: str
    source_path: str
    quality: str
    segment_length: int = field(default_factory=lambda: settings.segment_length)
    lut_path: Optional[str] = None
    process: Optional[asyncio.subprocess.Process] = None
    start_segment: int = 0
    start_time_sec: float = 0.0
    last_request_time: float = field(default_factory=time.monotonic)
    active_requests: int = 0
    has_exited: bool = False
    exit_code: Optional[int] = None
    download_position_ticks: int = 0
    work_dir: Path = None
    kill_task: Optional[asyncio.Task] = None
    pid: Optional[int] = None
    transcode_position_sec: float = 0.0
    drain_task: Optional[asyncio.Task] = None
    transcode_fps: float = 0.0
    transcode_speed: float = 0.0

    def __post_init__(self):
        if self.work_dir is None:
            self.work_dir = Path(f"/tmp/hls/{self.stream_id}")


def make_stream_id(path: str, quality: str, segment_length: int) -> str:
    """Deterministic stream_id from path + quality + segment_length."""
    key = f"{path}:{quality}:{segment_length}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def get_current_transcode_index(work_dir: Path, stream_id: str) -> Optional[int]:
    """Find highest segment index on disk."""
    if not work_dir.exists():
        return None

    pattern = f"{stream_id}*.ts"
    files = list(work_dir.glob(pattern))

    if not files:
        return None

    # Extract index from filename and get max
    indices = []
    for f in files:
        suffix = f.stem[len(stream_id) :]
        try:
            indices.append(int(suffix))
        except ValueError:
            pass

    return max(indices) if indices else None


async def probe_hardware() -> dict:
    """Probe available hardware acceleration and specific encoders."""
    result = {
        "videotoolbox": False,
        "nvenc": False,
        "qsv": False,
        "vaapi": False,
        "h264_videotoolbox": False,
        "h264_nvenc": False,
        "h264_qsv": False,
        "h264_vaapi": False,
    }

    try:
        # Probe hwaccels
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-hwaccels",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        output = stdout.decode("utf-8", errors="ignore")

        if "videotoolbox" in output:
            result["videotoolbox"] = True
        if "cuda" in output:
            result["nvenc"] = True
        if "qsv" in output:
            result["qsv"] = True
        if "vaapi" in output:
            result["vaapi"] = True

        # Probe encoders for specific H.264 support
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-encoders",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        output = stdout.decode("utf-8", errors="ignore")

        if "h264_videotoolbox" in output:
            result["h264_videotoolbox"] = True
        if "h264_nvenc" in output or "hevc_nvenc" in output:
            result["h264_nvenc"] = True
        if "h264_qsv" in output:
            result["h264_qsv"] = True
        if "h264_vaapi" in output:
            result["h264_vaapi"] = True

    except Exception as e:
        logger.warning(f"Hardware probing warning", exc_info=True)

    return result


def select_encoder(hardware: dict, hw_accel_method: str = None) -> str:
    """
    Pick best available H.264 encoder based on hardware acceleration method.

    Args:
        hardware: dict with available hardware encoders
        hw_accel_method: Preferred acceleration method (qsv, vaapi, nvenc, videotoolbox, qsv_copy, etc.)
                        If None, auto-selects best available.

    Returns:
        Encoder name (e.g., 'h264_qsv', 'h264_vaapi', 'libx264')
    """
    import os

    # Check if hardware encoding is disabled
    if os.getenv("DISABLE_HW_ENCODING"):
        return "libx264"

    # Get acceleration method from env if not passed
    if hw_accel_method is None:
        hw_accel_method = os.getenv("HW_ACCEL_METHOD", "").lower()
    else:
        hw_accel_method = hw_accel_method.lower()

    # Map user-friendly names to encoder names
    accel_map = {
        "qsv": "h264_qsv",
        "vaapi": "h264_vaapi",
        "nvenc": "h264_nvenc",
        "cuda": "h264_nvenc",  # CUDA uses NVENC encoder
        "videotoolbox": "h264_videotoolbox",
        "toolbox": "h264_videotoolbox",
        "vdpau": "h264_vdpau",
        "drm": "h264_videotoolbox",  # DRM is for input, not encoding
        "opencl": "libx264",  # OpenCL doesn't have dedicated encoder, use software
        "vulkan": "libx264",  # Vulkan doesn't have dedicated encoder, use software
    }

    # If specific method requested
    if hw_accel_method in accel_map:
        encoder = accel_map[hw_accel_method]
        if encoder == "libx264":
            return encoder
        # Check if the requested encoder is available
        if hardware.get(encoder):
            return encoder
        else:
            # Fall back to software if requested encoder not available
            import logging
            logger = logging.getLogger("media.transcoder")
            logger.warning(
                f"Requested hardware encoder '{encoder}' not available, falling back to libx264"
            )
            return "libx264"

    # Auto-select best available
    priority = ["h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_vaapi"]
    for enc in priority:
        if hardware.get(enc):
            return enc

    return "libx264"


def _build_hwaccel_input_args(encoder: str) -> list[str]:
    """Build input-side hwaccel flags for hw-accelerated decoding."""
    if encoder == "h264_videotoolbox":
        return [
            "-hwaccel",
            "videotoolbox",
            "-hwaccel_output_format",
            "videotoolbox_vld",
        ]
    elif encoder == "h264_nvenc":
        return ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda", "-threads", "1"]
    elif encoder == "h264_qsv":
        return ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"]
    elif encoder == "h264_vaapi":
        return ["-hwaccel", "vaapi", "-hwaccel_output_format", "vaapi"]
    return []


def _build_video_codec_args(
    encoder: str,
    bitrate: Optional[int],
    max_height: Optional[int],
    lut_path: Optional[str] = None,
) -> list:
    """Build video codec args with LUT3D (software) for LUT application."""

    args = ["-codec:v:0", encoder]

    # --- Encoder configs ---
    if encoder == "libx264":
        args += ["-preset", "ultrafast", "-crf", "23"]
        if bitrate:
            args += ["-maxrate", str(bitrate), "-bufsize", str(bitrate * 2)]

    elif encoder == "h264_videotoolbox":
        args += ["-prio_speed", "1"]
        if bitrate:
            args += ["-b:v", str(bitrate), "-qmin", "-1", "-qmax", "-1"]

    elif encoder == "h264_nvenc":
        args += ["-preset", "p1"]
        if bitrate:
            args += ["-maxrate", str(bitrate), "-bufsize", str(bitrate * 2)]

    elif encoder in ("h264_qsv", "h264_vaapi"):
        args += ["-preset", "ultrafast"]
        if bitrate:
            args += [
                "-b:v",
                str(bitrate),
                "-maxrate",
                str(bitrate),
                "-bufsize",
                str(bitrate * 2),
            ]

    # --- Filter chain (lut3d for LUT, scale for max_height) ---
    filters = []

    if lut_path or max_height:
        # Build filter chain: lut3d for color grading, scale for resolution
        if lut_path:
            # lut3d requires absolute path escaped for FFmpeg filter syntax
            escaped_path = lut_path.replace("'", "\\'")
            filters.append(f"lut3d='{escaped_path}'")

        if max_height:
            # Scale filter: keep aspect ratio, max height
            filters.append(f"scale=w=-2:h='min(ih,{max_height})'")

    if filters:
        args += ["-vf", ",".join(filters)]

    return args


class TranscodeManager:
    """Manage all active transcoding jobs."""

    def __init__(self):
        self._jobs: dict[str, TranscodeJob] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._subscribers: set[asyncio.Queue] = set()
        self._event_buffer: deque = deque(maxlen=500)
        self._event_counter: int = 0
        self.encoder: str = "libx264"  # selected at startup after probe_hardware()

    def get_lock(self, stream_id: str) -> asyncio.Lock:
        """Get or create per-stream lock."""
        if stream_id not in self._locks:
            self._locks[stream_id] = asyncio.Lock()
        return self._locks[stream_id]

    async def broadcast_event(self, event: dict) -> None:
        """Broadcast SSE event to all connected subscribers."""
        self._event_counter += 1
        event["_id"] = self._event_counter
        self._event_buffer.append(event)

        dead = set()
        for q in self._subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.add(q)
        self._subscribers -= dead

    def subscribe(self) -> asyncio.Queue:
        """Subscribe to SSE events. Returns queue (maxsize=200)."""
        q = asyncio.Queue(maxsize=200)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Unsubscribe from SSE events."""
        self._subscribers.discard(q)

    def get_job(self, stream_id: str) -> Optional[TranscodeJob]:
        """Get active job by stream_id."""
        return self._jobs.get(stream_id)

    def get_all_jobs(self) -> list[TranscodeJob]:
        """Get all active jobs (for debug panel)."""
        return list(self._jobs.values())

    async def spawn_ffmpeg(
        self,
        job: TranscodeJob,
        seek_time_seconds: float,
        segment_id: int,
    ) -> bool:
        """Spawn FFmpeg process for this job. Returns True if successful."""
        # Kill existing process in background — don't block spawn
        if job.process is not None and not job.has_exited:
            old_process = job.process
            old_drain = job.drain_task
            # Detach from job so new spawn doesn't wait
            job.process = None
            job.drain_task = None
            asyncio.create_task(self._kill_process_bg(old_process, old_drain))

        work_dir = job.work_dir
        work_dir.mkdir(parents=True, exist_ok=True)

        preset = get_bitrate_preset(job.quality)
        vcodec = preset["vcodec"]
        acodec = preset["acodec"]
        bitrate = preset["bitrate"]
        max_height = preset["max_height"]

        # If LUT is active and copy codec is requested, downgrade to highest transcode tier
        if job.lut_path and vcodec == "copy":
            # lut3d filter requires re-encode, cannot use copy codec
            preset = get_bitrate_preset("120M")
            vcodec = self.encoder  # use detected hw encoder
            acodec = preset["acodec"]
            bitrate = preset["bitrate"]
            max_height = preset["max_height"]

        # Validate source_path is not a network URI (SSRF protection)
        _BLOCKED_SCHEMES = (
            "http://",
            "https://",
            "ftp://",
            "ftps://",
            "rtmp://",
            "rtsp://",
            "smb://",
        )
        source_lower = job.source_path.lower()
        if any(source_lower.startswith(s) for s in _BLOCKED_SCHEMES):
            raise ValueError(
                f"Network URIs are not allowed as source path: {job.source_path}"
            )

        # Build FFmpeg command
        cmd = [settings.ffmpeg_path]

        # lut3d filter is CPU-based, no GPU device needed

        # Add hwaccel input args ONLY when using copy codec (no filters needed)
        # If we have filters like scale, hwaccel input creates videotoolbox_vld format
        # which doesn't support standard filters. Decode in software, encode in hw.
        if vcodec == "copy":
            cmd.extend(_build_hwaccel_input_args(self.encoder))

        cmd.extend(
            [
                "-ss",
                str(seek_time_seconds),
                "-i",
                job.source_path,
                "-map_metadata",
                "-1",
                "-map_chapters",
                "-1",
                "-threads",
                "0",
            ]
        )

        # Video codec: use encoder-specific args (bitrate control, preset, etc)
        if vcodec == "copy":
            cmd.extend(["-codec:v:0", "copy", "-start_at_zero"])
        else:
            # Use encoder-aware codec builder (respects hw-specific bitrate control)
            codec_args = _build_video_codec_args(
                self.encoder, bitrate, max_height, job.lut_path
            )
            cmd.extend(codec_args)

            # Force keyframes at segment boundaries (only for transcoding, not copy)
            cmd.extend(
                [
                    "-force_key_frames:v:0",
                    f"expr:gte(t,n_forced*{job.segment_length})",
                ]
            )

        # Audio codec
        cmd.extend(["-codec:a:0", acodec, "-b:a", "128k", "-ac", "2"])

        # HLS muxer — aggressive settings for low latency
        cmd.extend(
            [
                "-max_muxing_queue_size",
                "32",  # Was 128; smaller = flush segments faster
                "-f",
                "hls",
                "-max_delay",
                "100000",  # Was 5000000; more aggressive flushing
                "-hls_time",
                str(job.segment_length),
                "-hls_segment_type",
                "mpegts",
                "-start_number",
                str(segment_id),
                "-hls_segment_filename",
                f"{work_dir}/{job.stream_id}%d.ts",
                "-hls_playlist_type",
                "vod",
                "-hls_list_size",
                "0",
                "-copyts",
                "-avoid_negative_ts",
                "disabled",
                "-y",
                f"{work_dir}/{job.stream_id}.m3u8",
            ]
        )

        try:
            job.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            job.pid = job.process.pid
            job.start_segment = segment_id
            job.start_time_sec = seek_time_seconds
            job.has_exited = False
            job.exit_code = None
            job.last_request_time = time.monotonic()

            # Print actual PID after process creation
            logger.info(
                "FFmpeg process spawned",
                extra={
                    "stream_id": job.stream_id,
                    "pid": job.pid,
                    "quality": job.quality,
                    "seek_time_seconds": seek_time_seconds,
                },
            )
            logger.debug(f"FFmpeg command: {' '.join(cmd)}")
            job.active_requests = 0

            # Drain stderr to prevent pipe block
            job.drain_task = asyncio.create_task(self._drain_stderr(job))

            # Emit spawn event
            await self.broadcast_event(
                {
                    "type": "spawn",
                    "stream_id": job.stream_id,
                    "pid": job.pid,
                    "quality": job.quality,
                    "start_segment": segment_id,
                    "start_time_sec": seek_time_seconds,
                }
            )

            return True
        except Exception as e:
            logger.error(
                f"FFmpeg spawn failed",
                extra={"stream_id": job.stream_id},
                exc_info=True,
            )
            await self.broadcast_event(
                {
                    "type": "error",
                    "stream_id": job.stream_id,
                    "message": f"FFmpeg spawn failed: {e}",
                }
            )
            return False

    async def _drain_stderr(self, job: TranscodeJob) -> None:
        """Drain FFmpeg stderr to prevent pipe block and parse progress."""
        try:
            while not job.has_exited:
                line = await job.process.stderr.readline()
                if not line:
                    # EOF detected
                    job.has_exited = True
                    job.exit_code = job.process.returncode
                    break

                decoded = line.decode("utf-8", errors="ignore").strip()
                if decoded:
                    logger.debug(
                        f"FFmpeg stderr",
                        extra={"stream_id": job.stream_id, "pid": job.pid},
                    )

                    # Parse time= for transcode position
                    time_match = re.search(
                        r"time=(\d{2}):(\d{2}):(\d{2}\.\d+)", decoded
                    )
                    if time_match:
                        hours = int(time_match.group(1))
                        minutes = int(time_match.group(2))
                        seconds = float(time_match.group(3))
                        job.transcode_position_sec = (
                            hours * 3600 + minutes * 60 + seconds
                        )

                    # Parse fps= (can be "fps= 47" with space or "fps=47")
                    fps_match = re.search(r"fps=\s*(\d+\.?\d*)", decoded)
                    if fps_match:
                        job.transcode_fps = float(fps_match.group(1))

                    # Parse speed= (e.g. "speed=1.95x")
                    speed_match = re.search(r"speed=\s*(\d+\.?\d*)x", decoded)
                    if speed_match:
                        job.transcode_speed = float(speed_match.group(1))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(
                f"FFmpeg stderr drain error",
                extra={"stream_id": job.stream_id, "pid": job.pid},
                exc_info=True,
            )

    async def kill_ffmpeg(self, job: TranscodeJob, reason: str = "manual") -> None:
        """Kill FFmpeg process gracefully with timeout."""
        if job.kill_task:
            job.kill_task.cancel()
            job.kill_task = None

        # Cancel drain task before terminating
        if job.drain_task:
            job.drain_task.cancel()
            job.drain_task = None

        if job.process and not job.has_exited:
            # Send graceful quit command
            try:
                job.process.stdin.write(b"q\n")
                await job.process.stdin.drain()
            except Exception:
                logger.warning(
                    f"Could not send quit to FFmpeg",
                    extra={"stream_id": job.stream_id, "pid": job.pid},
                    exc_info=True,
                )

            try:
                await asyncio.wait_for(job.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning(
                    f"Timeout waiting for FFmpeg graceful exit, force killing",
                    extra={"stream_id": job.stream_id, "pid": job.pid},
                )
                job.process.kill()
                await job.process.wait()

            job.has_exited = True
            job.exit_code = job.process.returncode

            # Emit killed event
            await self.broadcast_event(
                {
                    "type": "killed",
                    "stream_id": job.stream_id,
                    "pid": job.pid,
                    "reason": reason,
                }
            )

    async def _kill_process_bg(
        self, process: asyncio.subprocess.Process, drain_task: Optional[asyncio.Task]
    ) -> None:
        """Kill FFmpeg process in background without blocking."""
        if drain_task:
            drain_task.cancel()
        try:
            process.stdin.write(b"q\n")
            await process.stdin.drain()
        except Exception:
            pass
        try:
            await asyncio.wait_for(process.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

    async def wait_for_segment(
        self,
        job: TranscodeJob,
        segment_path: Path,
        next_segment_path: Path,
        timeout: float = 600.0,
    ) -> bool:
        """Poll for segment N to be ready. Wait for file to stop growing (FFmpeg finished writing)."""
        deadline = time.monotonic() + timeout
        MIN_SEGMENT_SIZE = 8192  # 8KB minimum (most TS segments are larger)
        MIN_STABLE_TIME = 0.1  # 100ms — file must not grow during this window

        last_size = 0
        stable_start = None

        while time.monotonic() < deadline:
            if job.has_exited:
                # If process exited, ensure segment exists and is complete
                return segment_path.exists()

            try:
                size = segment_path.stat().st_size

                # Check if file has reached minimum size
                if size < MIN_SEGMENT_SIZE:
                    stable_start = None  # Reset if file shrinks below threshold
                    last_size = size
                    await asyncio.sleep(0.05)
                    continue

                # File is large enough. Now check if it's stable (stopped growing)
                if size == last_size:
                    # Size didn't change
                    if stable_start is None:
                        stable_start = time.monotonic()
                    elif time.monotonic() - stable_start >= MIN_STABLE_TIME:
                        # File hasn't grown for MIN_STABLE_TIME — FFmpeg finished writing
                        return True
                else:
                    # Size changed — reset stability timer
                    stable_start = None
                    last_size = size

            except FileNotFoundError:
                stable_start = None
                last_size = 0

            await asyncio.sleep(0.05)  # 50ms poll interval

        return segment_path.exists()

    async def request_begin(self, job: TranscodeJob) -> None:
        """Called when segment request begins."""
        job.last_request_time = time.monotonic()
        job.active_requests += 1
        if job.kill_task:
            job.kill_task.cancel()
            job.kill_task = None

    async def request_end(
        self,
        job: TranscodeJob,
        runtime_ticks: int,
        actual_length_ticks: int,
    ) -> None:
        """Called when segment response completes."""
        job.download_position_ticks = max(
            job.download_position_ticks,
            runtime_ticks + actual_length_ticks,
        )
        job.active_requests -= 1

        if job.active_requests <= 0:
            # Arm 60s kill timer
            job.kill_task = asyncio.create_task(self._keep_alive_timer(job))

    async def _keep_alive_timer(self, job: TranscodeJob, timeout: float = 60.0) -> None:
        """Keep-alive timer. Kill if no new requests after timeout seconds."""
        try:
            await asyncio.sleep(timeout)
            elapsed = time.monotonic() - job.last_request_time
            if elapsed >= timeout - 1 and not job.has_exited:
                await self.kill_ffmpeg(job, reason="keepalive_timeout")
                if job.stream_id in self._jobs:
                    del self._jobs[job.stream_id]
                # Clean up lock
                if job.stream_id in self._locks:
                    del self._locks[job.stream_id]
        except asyncio.CancelledError:
            pass

    async def register_job(self, job: TranscodeJob) -> None:
        """Register new job."""
        self._jobs[job.stream_id] = job

    async def cleanup_segments(self, job: TranscodeJob, keep_seconds: int = 20) -> None:
        """Delete old segments behind playback position."""
        if job.download_position_ticks == 0:
            return

        dl_pos_sec = job.download_position_ticks / TICKS_PER_SECOND
        max_idx_to_keep = int((dl_pos_sec - keep_seconds) / job.segment_length)

        if max_idx_to_keep <= 0:
            return

        for f in job.work_dir.glob(f"{job.stream_id}*.ts"):
            suffix = f.stem[len(job.stream_id) :]
            try:
                idx = int(suffix)
                if idx < max_idx_to_keep:
                    f.unlink()
            except ValueError:
                pass
