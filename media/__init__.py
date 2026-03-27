"""Media package: transcoding, thumbnails, and playlist generation."""

from media.transcoder import (
    TranscodeManager,
    TranscodeJob,
    make_stream_id,
    get_current_transcode_index,
    BITRATE_TIERS,
    get_bitrate_preset,
    TICKS_PER_SECOND,
    probe_hardware,
    select_encoder,
)
from media.thumbs import get_or_generate_thumb
from media.playlist import (
    probe_media,
    compute_equal_length_segments,
    build_vod_playlist,
    MediaInfo,
    PlaylistSegment,
)

__all__ = [
    "TranscodeManager",
    "TranscodeJob",
    "make_stream_id",
    "get_current_transcode_index",
    "BITRATE_TIERS",
    "get_bitrate_preset",
    "TICKS_PER_SECOND",
    "probe_hardware",
    "select_encoder",
    "get_or_generate_thumb",
    "probe_media",
    "compute_equal_length_segments",
    "build_vod_playlist",
    "MediaInfo",
    "PlaylistSegment",
]
