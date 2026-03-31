"""
Hardware encoding flags and FFmpeg command builders.
Supports multiple platforms: Intel QSV/VAAPI, NVIDIA NVENC, Apple VideoToolbox, AMD VDPAU.
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
        # QSV uses VAAPI for decoding on Intel
        return [
            "-init_hw_device",
            "vaapi=va:/dev/dri/renderD128,driver=iHD",
            # TODO: Find what this does in jellyfin that falis in this version
            # "-init_hw_device",
            # "qsv=qs@va",
            # "-filter_hw_device",
            # "qs",
            "-hwaccel",
            "vaapi",
            "-hwaccel_output_format",
            "vaapi",
        ]
    elif encoder == "h264_vaapi":
        return [
            "-init_hw_device",
            "vaapi=va:/dev/dri/renderD128,driver=iHD",
            "-filter_hw_device",
            "va",
            "-hwaccel",
            "vaapi",
            "-hwaccel_output_format",
            "vaapi",
        ]
    return []


def build_video_codec_args(
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

    elif encoder == "h264_qsv":
        args += ["-preset", "veryfast"]
        if bitrate:
            args += [
                "-b:v",
                str(bitrate),
                "-maxrate",
                str(bitrate),
                "-bufsize",
                str(bitrate * 2),
            ]
        args += ["-g:v", "180"]  # Keyframe interval for QSV

    elif encoder == "h264_vaapi":
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

    # Color space setup (important for 10-bit HEVC input)
    filters.append("setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709")

    if lut_path or max_height:
        # Build filter chain: lut3d for color grading, scale for resolution
        if lut_path:
            # lut3d requires absolute path escaped for FFmpeg filter syntax
            escaped_path = lut_path.replace("'", "\\'")
            filters.append(f"lut3d='{escaped_path}'")

        if max_height:
            # Use hardware-accelerated scaler based on encoder
            if encoder == "h264_qsv":
                filters.append(
                    f"scale_vaapi=w=-2:h='min(ih,{max_height})':format=nv12:extra_hw_frames=24"
                )
                # Map VAAPI output to QSV
                filters.append("hwmap=derive_device=qsv,format=qsv")
            elif encoder == "h264_vaapi":
                filters.append(
                    f"scale_vaapi=w=-2:h='min(ih,{max_height})':format=nv12:extra_hw_frames=24"
                )
            else:
                # Software scale for other encoders
                filters.append(f"scale=w=-2:h='min(ih,{max_height})'")

    else:
        # Even without scaling, apply format conversion for hw encoders
        if encoder == "h264_qsv":
            filters.append("format=nv12|vaapi,hwupload=extra_hw_frames=64")
            filters.append("hwmap=derive_device=qsv,format=qsv")
        elif encoder == "h264_vaapi":
            filters.append("format=nv12|vaapi,hwupload=extra_hw_frames=64")

    if filters:
        args += ["-vf", ",".join(filters)]

    return args
