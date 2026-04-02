"""
Hardware encoding flags and FFmpeg command builders.
Supports multiple platforms: Intel QSV/VAAPI, NVIDIA NVENC, Apple VideoToolbox.
"""

from typing import Optional


def build_hwaccel_input_args(encoder: str) -> list[str]:
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
        # QSV on Linux: VAAPI parent device → QSV child device.
        # Decode with VAAPI; bridge to QSV in filter chain via hwmap=derive_device=qsv.
        return [
            "-init_hw_device", "vaapi=va:/dev/dri/renderD128,driver=iHD",
            "-init_hw_device", "qsv=qs@va",
            "-filter_hw_device", "qs",
            "-hwaccel", "vaapi",
            "-hwaccel_output_format", "vaapi",
            "-noautorotate",
        ]
    elif encoder == "h264_vaapi":
        return [
            "-init_hw_device", "vaapi=va:/dev/dri/renderD128,driver=iHD",
            "-filter_hw_device", "va",
            "-hwaccel", "vaapi",
            "-hwaccel_output_format", "vaapi",
            "-hwaccel_flags", "+allow_profile_mismatch",
            "-noautorotate",
        ]
    return []


def build_video_codec_args(
    encoder: str,
    bitrate: Optional[int],
    max_height: Optional[int],
) -> list:
    """Build video codec args with filter chain for scaling and format conversion."""

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

    elif encoder == "h264_qsv":
        args += ["-preset", "veryfast", "-mbbrc", "1"]
        if bitrate:
            args += [
                "-b:v", str(bitrate),
                "-maxrate", str(bitrate + 1),       # +1 triggers QSV VBR mode internally
                "-rc_init_occupancy", str(bitrate * 2),
                "-bufsize", str(bitrate * 4),
            ]
        # GOP via stream-indexed flags; -force_key_frames is NOT added for QSV (see transcoder.py)
        args += ["-g:v:0", "180", "-keyint_min:v:0", "180"]

    elif encoder == "h264_vaapi":
        # h264_vaapi has no -preset; use -compression_level (iHD driver, 1=slow 7=fast)
        # -rc_mode VBR required; without it iHD defaults to CQP and ignores bitrate flags
        args += ["-rc_mode", "VBR", "-compression_level", "7"]
        if bitrate:
            args += [
                "-b:v", str(bitrate),
                "-maxrate", str(bitrate),
                "-bufsize", str(bitrate * 2),
            ]

    # --- Filter chain ---
    # scale_vaapi=format=nv12 handles both resizing and 10-bit→8-bit conversion for H.264
    filters = []

    if max_height:
        if encoder in ("h264_qsv", "h264_vaapi"):
            filters.append(
                f"scale_vaapi=w=-2:h='min(ih,{max_height})':format=nv12:extra_hw_frames=24"
            )
            if encoder == "h264_qsv":
                filters.append("hwmap=derive_device=qsv")
                filters.append("format=qsv")
        else:
            filters.append(f"scale=w=-2:h='min(ih,{max_height})'")

    else:
        # No scaling — still need format conversion (e.g. 10-bit source → nv12 for H.264)
        if encoder == "h264_qsv":
            filters.append("scale_vaapi=format=nv12:extra_hw_frames=24")
            filters.append("hwmap=derive_device=qsv")
            filters.append("format=qsv")
        elif encoder == "h264_vaapi":
            filters.append("scale_vaapi=format=nv12:extra_hw_frames=24")

    if filters:
        args += ["-vf", ",".join(filters)]

    return args
