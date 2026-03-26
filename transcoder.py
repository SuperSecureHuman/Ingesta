"""
Transcoder: FFmpeg process management, on-demand spawning, seeking
"""

import asyncio
import hashlib
import json
import re
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

TICKS_PER_SECOND = 10_000_000

# ANSI color codes
CYAN = "\033[96m"
YELLOW = "\033[93m"
RESET = "\033[0m"

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
    segment_length: int
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

    def __post_init__(self):
        if self.work_dir is None:
            self.work_dir = Path(f"/tmp/hls_poc/{self.stream_id}")


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
    """Probe available hardware acceleration: videotoolbox, nvenc, qsv, vaapi."""
    result = {
        "videotoolbox": False,
        "nvenc": False,
        "qsv": False,
        "vaapi": False,
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

        # Probe encoders for nvenc variants
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-encoders",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        output = stdout.decode("utf-8", errors="ignore")

        if "hevc_nvenc" in output or "h264_nvenc" in output:
            result["nvenc"] = True

    except Exception as e:
        print(f"[probe_hardware] Warning: {e}")

    return result


class TranscodeManager:
    """Manage all active transcoding jobs."""

    def __init__(self):
        self._jobs: dict[str, TranscodeJob] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._subscribers: set[asyncio.Queue] = set()
        self._event_buffer: deque = deque(maxlen=500)
        self._event_counter: int = 0

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
        # Kill existing process if any
        if job.process is not None and not job.has_exited:
            await self.kill_ffmpeg(job, reason="restart_for_seek")

        work_dir = job.work_dir
        work_dir.mkdir(parents=True, exist_ok=True)

        preset = get_bitrate_preset(job.quality)
        vcodec = preset["vcodec"]
        acodec = preset["acodec"]
        bitrate = preset["bitrate"]
        max_height = preset["max_height"]

        # Build FFmpeg command
        cmd = [
            "ffmpeg",
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

        # Video codec
        if vcodec == "copy":
            cmd.extend(["-codec:v:0", "copy", "-start_at_zero"])
        else:
            cmd.extend(
                [
                    "-codec:v:0",
                    vcodec,
                    "-preset",
                    "veryfast",
                    "-crf",
                    "23",
                ]
            )
            if bitrate:
                cmd.extend(
                    [
                        "-maxrate",
                        str(bitrate),
                        "-bufsize",
                        str(bitrate * 2),
                    ]
                )
            # Build video filter chain (scale only if max_height)
            if max_height:
                cmd.extend(["-vf", f"scale=-2:'min(ih,{max_height})'"])
            # Force keyframes at segment boundaries
            cmd.extend(
                [
                    "-force_key_frames:v:0",
                    f"expr:gte(t,n_forced*{job.segment_length})",
                ]
            )

        # Audio codec
        cmd.extend(["-codec:a:0", acodec, "-b:a", "128k", "-ac", "2"])

        # HLS muxer
        cmd.extend(
            [
                "-max_muxing_queue_size",
                "128",
                "-f",
                "hls",
                "-max_delay",
                "5000000",
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
            # Color by seek status: cyan for mid-stream restart, yellow for initial
            color = CYAN if seek_time_seconds > 0 else YELLOW

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
            print(
                f"{color}[SPAWN] FFmpeg PID {job.pid} | quality={job.quality} | seek={seek_time_seconds:.1f}s{RESET}"
            )
            print(f"  cmd: {' '.join(cmd)}")
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
            print(f"[SPAWN] ERROR: {type(e).__name__}: {e}")
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
                    print(f"[FFmpeg {job.pid}] {decoded}")

                    # Parse time=HH:MM:SS.ms to extract transcode progress
                    match = re.search(r"time=(\d{2}):(\d{2}):(\d{2}\.\d+)", decoded)
                    if match:
                        hours = int(match.group(1))
                        minutes = int(match.group(2))
                        seconds = float(match.group(3))
                        total_sec = hours * 3600 + minutes * 60 + seconds
                        job.transcode_position_sec = total_sec

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[FFmpeg stderr drain error] {e}")

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
            except Exception as e:
                print(f"[kill_ffmpeg] Could not send quit to {job.pid}: {e}")

            try:
                await asyncio.wait_for(job.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                print(f"[kill_ffmpeg] Timeout waiting for {job.pid}, force killing")
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

    async def wait_for_segment(
        self,
        job: TranscodeJob,
        segment_path: Path,
        next_segment_path: Path,
        timeout: float = 30.0,
    ) -> bool:
        """Poll for segment N and N+1 to exist (or ffmpeg exit). Returns True if ready."""
        deadline = time.monotonic() + timeout
        segment_exists = segment_path.exists()

        while time.monotonic() < deadline:
            if segment_exists:
                # Check if next segment exists or ffmpeg exited
                if job.has_exited or next_segment_path.exists():
                    return True
            else:
                segment_exists = segment_path.exists()
                if segment_exists:
                    continue  # Avoid 100ms delay

            await asyncio.sleep(0.1)

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
