# Jellyfin FFmpeg Hardware Encoding — Complete Reference

This document covers every FFmpeg flag Jellyfin generates for hardware-accelerated transcoding.
It is derived from a deep analysis of the Jellyfin source codebase and a real production log.
Use this as a blueprint for building FFmpeg command lines in your Python project.

**Primary source file:** `jellyfin/MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs`
**Secondary source:** `jellyfin/Jellyfin.Api/Controllers/DynamicHlsController.cs`

---

## How Jellyfin Builds the FFmpeg Command

The command is assembled in layers. Each layer corresponds to a specific function:

```
Layer 1 — GetInputModifier()             → probe flags, HW device init, decoder flags, input format
Layer 2 — GetInputArgument()             → -i path, -noautoscale, per-stream decoder args
Layer 3 — GetMapArgs()                   → -map, -map_metadata, -map_chapters
Layer 4 — GetVideoArguments()            → video encoder, GOP flags
Layer 5 — GetVideoProcessingFilterParam()→ -vf filter chain (scale, tonemap, bridges)
Layer 6 — GetVideoQualityParam()         → encoder preset, bitrate, profile, level
Layer 7 — GetAudioArguments()            → audio codec, channels, bitrate, volume filter
Layer 8 — DynamicHlsController          → timestamp flags, HLS muxer flags, output path
```

---

## Part 1: Hardware Device Init & Decoder (`GetInputVideoHwaccelArgs()` ~line 984)

The device init flags come **before** `-i`. The decoder flags control how frames are decoded and kept in GPU memory.

### NVIDIA CUDA / nvdec
```
-init_hw_device cuda=cuda_hw:0
-filter_hw_device cuda_hw
-hwaccel cuda
-hwaccel_output_format cuda
-hwaccel_flags +unsafe_output      # only if nvdec no-internal-copy enabled, FFmpeg >= specific ver
-threads 1                         # enhanced nvdec mode
-noautorotate
-display_rotation 0
```

### Intel QSV on Linux
QSV on Linux is a two-step init: VAAPI parent → QSV child. This is because QSV on Linux requires
a VAAPI device as the underlying GPU abstraction. Jellyfin decodes with VAAPI then encodes with QSV.
```
-init_hw_device vaapi=va:/dev/dri/renderD128,driver=iHD
-init_hw_device qsv=qs@va
-filter_hw_device qs
-hwaccel vaapi
-hwaccel_output_format vaapi
-noautorotate
-display_rotation 0
```
> Note: The decoder is VAAPI even when encoding with QSV. The frame is bridged later in the filter
> chain using `hwmap=derive_device=qsv,format=qsv`. See Part 4.

### Intel QSV on Windows
```
-init_hw_device d3d11va=d3d11va_hw:0,vendor=0x8086
-init_hw_device qsv=qsv_hw@d3d11va_hw
-filter_hw_device qsv_hw
-hwaccel qsv
-hwaccel_output_format qsv
-threads 2
-noautorotate
-display_rotation 0
```

### Intel / AMD VAAPI on Linux
```
-init_hw_device vaapi=vaapi_hw:/dev/dri/renderD128
  OR (with driver hints):
-init_hw_device vaapi=vaapi_hw:,kernel_driver=i915,driver=iHD
-filter_hw_device vaapi_hw
-hwaccel vaapi
-hwaccel_output_format vaapi
-hwaccel_flags +allow_profile_mismatch    # for H.264 baseline profile sources
-noautorotate
-display_rotation 0
```

### AMD AMF on Windows (uses D3D11VA decode + OpenCL filters)
```
-init_hw_device d3d11va=d3d11va_hw:0,vendor=0x1002
-init_hw_device opencl=opencl_hw@d3d11va_hw
-filter_hw_device opencl_hw
-hwaccel d3d11va
-hwaccel_output_format d3d11
-hwaccel_flags +allow_profile_mismatch
-threads 2
-noautorotate
-display_rotation 0
```

### Apple VideoToolbox (macOS)
```
-init_hw_device videotoolbox=videotoolbox_hw
-filter_hw_device videotoolbox_hw
-hwaccel videotoolbox
-hwaccel_output_format videotoolbox_vld
-noautorotate
-display_rotation 0
```

### Rockchip RKMPP (Linux embedded)
```
-init_hw_device rkmpp=rkmpp_hw
-filter_hw_device rkmpp_hw
-hwaccel rkmpp
-hwaccel_output_format drm_prime
-noautorotate
-display_rotation 0
```

---

## Part 2: Input Modifier Flags (`GetInputModifier()` ~line 7186)

These are prepended before the `-i` argument.

### Probe / analysis flags
```
-analyzeduration 200M    # hardcoded default (ConfigurationOptions.cs line 19)
-probesize 1G            # hardcoded default (ConfigurationOptions.cs line 18)
```
These can be overridden per MediaSource if `AnalyzeDurationMs > 0` (converted to microseconds).

### Input container format forcing (`GetInputFormat()` ~line 519)
```
-f matroska    # when input container == "mkv"
-f mpegts      # when input container == "ts"
```
**Only applied when:** HW acceleration is enabled AND input is a VideoFile (not a disc/folder).
Most other containers are passed without format forcing.

### Anti-autoscale flag (`GetInputArgument()` ~line 1316)
```
-noautoscale    # added when ANY hardware decoder is used
```
Without this, FFmpeg may auto-insert a software scaler when the HW decoder output resolution
differs from input — defeating HW acceleration.

---

## Part 3: Stream Mapping & Global Flags (`GetMapArgs()` ~line 2989)

### Always-present (hardcoded)
```
-map_metadata -1    # strip all input metadata from output
-map_chapters -1    # strip all chapters from output
-threads 0          # 0 = auto (all CPU cores). Set from GetNumberOfThreads().
                    # Uses CpuCoreLimit if set, else EncodingThreadCount; falls back to 0.
```

### Stream selection
```
-map 0:0    # video stream: index of selected video stream in input
-map 0:1    # audio stream: index of selected audio stream in input
            # If audio is an external file: -map 1:0 or -map 2:0
-map -0:s   # exclude ALL subtitle streams (always used for HLS delivery)
```

**When `-map -0:s` is used:** Any time `SubtitleDeliveryMethod == Hls` or no subtitle was selected.
HLS subtitles are separate `.m3u8` sidecar playlists, never embedded in video segments.

**When a subtitle IS embedded** (`SubtitleDeliveryMethod.Embed`):
```
-map 0:N    # include specific subtitle stream by index
```

---

## Part 4: Video Filter Chain (`GetVideoProcessingFilterParam()` ~line 6145)

The filter chain is passed as `-vf "filter1,filter2,..."`.
The order is always: **color annotation → scale → tonemap (optional) → cross-device bridge → overlay (optional)**

### 4a. Color Annotation — always first (`GetOverwriteColorPropertiesParam()` ~line 6251)

This is always the first filter. FFmpeg doesn't always carry color metadata from container to frames;
this explicitly tags frames before any processing.

```
# SDR output (most common case — source is SDR or tonemap has already happened)
setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709

# SDR with explicit range
setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv
setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=pc

# HDR10 input annotation (when tonemapping will follow)
setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc

# HLG input annotation
setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc
```

### 4b. Scale Filters (per platform)

**NVIDIA CUDA**
```
scale_cuda=w=W:h=H
scale_cuda=w=W:h=H:format=yuv420p
scale_cuda=w=W:h=H:format=nv12
```

**Intel QSV** (`vpp_qsv` is a unified VPP filter — handles scale, transpose, and optionally tonemap)
```
vpp_qsv=w=W:h=H
vpp_qsv=w=W:h=H:format=nv12
vpp_qsv=w=W:h=H:transpose=DIR          # DIR: 0=90°CCW, 1=90°CW, 2=180°, 3=90°CW flip
vpp_qsv=w=W:h=H:scale_mode=hq          # high-quality scale (for MJPEG input)
vpp_qsv=w=W:h=H:out_range=pc           # full range output (MJPEG)
vpp_qsv=w=W:h=H:tonemap=1:format=nv12:async_depth=2                         # with HDR tonemap
vpp_qsv=w=W:h=H:tonemap=1:procamp=1:brightness=N:contrast=N:format=nv12:async_depth=2
vpp_qsv=w=W:h=H:passthrough=0          # D3D11VA passthrough control
```

**Intel / AMD VAAPI**
```
scale_vaapi=w=W:h=H
scale_vaapi=w=W:h=H:format=nv12
scale_vaapi=w=W:h=H:extra_hw_frames=24         # extra GPU frame buffers to prevent OOM
scale_vaapi=w=W:h=H:mode=hq:extra_hw_frames=24
scale_vaapi=w=W:h=H:out_range=pc               # full range (MJPEG)
```

**Apple VideoToolbox**
```
scale_vt=w=W:h=H
scale_vt=w=W:h=H:format=nv12
scale_vt=w=W:h=H:format=p010le                  # 10-bit for HDR tonemap path
scale_vt=color_matrix=bt709:color_primaries=bt709:color_transfer=bt709    # HDR→SDR tonemap
```

**OpenCL (AMD Windows)**
```
scale_opencl=w=W:h=H
scale_opencl=w=W:h=H:format=nv12
```

**Rockchip RKMPP**
```
vpp_rkrga=w=W:h=H:format=nv12
vpp_rkrga=w=W:h=H:format=nv12:afbc=1           # AFBC compressed framebuffer
vpp_rkrga=w=W:h=H:transpose=DIR
scale_rkrga=w=iw/7.9:h=ih/7.9:format=nv12:force_original_aspect_ratio=increase:force_divisible_by=4
```

### 4c. Tonemap Filters (HDR → SDR, optional)

**VAAPI (Intel)**
```
tonemap_vaapi=format=nv12:p=bt709:t=bt709:m=bt709:extra_hw_frames=32
procamp_vaapi=b=N:c=N,tonemap_vaapi=format=nv12:p=bt709:t=bt709:m=bt709:extra_hw_frames=32
```

**CUDA (NVIDIA)**
```
tonemap_cuda=format=yuv420p:p=bt709:t=bt709:m=bt709:tonemap=hable:peak=1000:desat=2
tonemap_cuda=format=yuv420p:p=bt709:t=bt709:m=bt709:tonemap=hable:peak=1000:desat=2:tonemap_mode=luma_only
tonemap_cuda=format=yuv420p:p=bt709:t=bt709:m=bt709:tonemap=hable:peak=1000:desat=2:param=0.5
tonemap_cuda=format=yuv420p:p=bt709:t=bt709:m=bt709:tonemap=hable:peak=1000:desat=2:range=tv
```

**OpenCL (AMD Windows / Intel fallback)**
```
tonemap_opencl=format=nv12:p=bt709:t=bt709:m=bt709:tonemap=hable:peak=1000:desat=2
```

**VideoToolbox (Metal, macOS)**
```
tonemap_videotoolbox=format=nv12:p=bt709:t=bt709:m=bt709:tonemap=hable:peak=1000:desat=2
```

### 4d. Cross-Device Bridges (hwmap + format)

When the decoder and encoder use different GPU APIs, frames must be mapped across devices.
The pattern is always: `hwmap=derive_device=TARGET` followed by `format=TARGET_SURFACE_FORMAT`.

**Why two steps?** `hwmap` creates a cross-device *reference* to the frame; `format=X` commits the
pixel layout so the receiving encoder gets properly formatted GPU surfaces.

**VAAPI → QSV (Linux Intel, most common)**
```
hwmap=derive_device=qsv
format=qsv
```
Generated in `GetIntelQsvVaapiVidFiltersPrefered()` ~line 4649.

**VAAPI → QSV after OpenCL tonemap (reverse-map back)**
```
hwmap=derive_device=qsv:mode=write:reverse=1:extra_hw_frames=16
format=qsv
```
`extra_hw_frames=16` prevents "cannot allocate memory" errors in the QSV frame pool.

**D3D11VA → OpenCL → D3D11VA (AMD Windows, for tonemap)**
```
# into OpenCL for tonemap:
hwmap=derive_device=opencl:mode=read
# ... tonemap_opencl filter ...
# back to D3D11VA for AMF encoder:
hwmap=derive_device=d3d11va:mode=write:reverse=1
format=d3d11
```

**D3D11VA → QSV (Windows Intel)**
```
hwmap=derive_device=qsv
format=qsv
```

**VAAPI → OpenCL → VAAPI (Linux VAAPI tonemap)**
```
hwmap=derive_device=vaapi:mode=write:reverse=1
format=vaapi
```

**RKMPP reverse bridge**
```
hwmap=derive_device=rkmpp:reverse=1
format=drm_prime
```

### 4e. HW Upload / Download

When bridging between HW and SW:
```
# SW → specific HW device:
hwupload=derive_device=cuda
hwupload=derive_device=opencl
hwupload=derive_device=qsv:extra_hw_frames=64
hwupload=derive_device=vaapi
hwupload=derive_device=d3d11va:extra_hw_frames=24
hwupload=derive_device=vulkan
hwupload=derive_device=rkmpp
hwupload_cuda                  # shorthand for CUDA
hwupload                       # generic (VideoToolbox)

# HW → SW (end of HW pipeline before SW encoder):
hwdownload
format=yuv420p                 # always paired with hwdownload
```

When using a SW encoder after a HW decoder, Jellyfin adds `hwdownload,format=yuv420p` to
terminate the HW surface pipeline before handing frames to libx264/libx265.

### 4f. Deinterlace Filters
```
yadif                  # software
yadif_cuda             # NVIDIA
yadif_vaapi            # VAAPI (Intel/AMD Linux)
yadif_videotoolbox     # Apple
deinterlace_qsv        # Intel QSV
```

### 4g. Transpose / Rotation
```
transpose_cuda=dir=N       # NVIDIA
transpose_vaapi=dir=N      # VAAPI
transpose_vt=dir=N         # Apple
transpose_opencl=dir=N     # AMD
vpp_qsv=transpose=N        # Intel (integrated into vpp_qsv)
vpp_rkrga=transpose=N      # Rockchip
```
`N`: 0=90°CCW, 1=90°CW, 2=180°, 3=90°CW+flip

### 4h. Overlay Filters (subtitle burn-in)
```
overlay_cuda=eof_action=pass:repeatlast=0
overlay_cuda=eof_action=pass:repeatlast=0:alpha_format=premultiplied
overlay_vaapi=eof_action=pass:repeatlast=0
overlay_vaapi=eof_action=pass:repeatlast=0:w=W:h=H
overlay_videotoolbox=eof_action=pass:repeatlast=0
overlay_opencl=eof_action=pass:repeatlast=0
overlay_opencl=eof_action=pass:repeatlast=0:alpha_format=premultiplied
overlay_qsv=eof_action=pass:repeatlast=0
overlay_rkrga=eof_action=pass:repeatlast=0:format=nv12
overlay_rkrga=eof_action=pass:repeatlast=0:format=nv12:afbc=1
overlay=eof_action=pass:repeatlast=0    # software fallback
```

---

## Part 5: Encoder Selection

```
Encoder name          Platform           Codec
──────────────────────────────────────────────────────
h264_nvenc            NVIDIA             H.264
hevc_nvenc            NVIDIA             H.265/HEVC
av1_nvenc             NVIDIA             AV1
h264_qsv              Intel              H.264
hevc_qsv              Intel              H.265/HEVC
av1_qsv               Intel              AV1
h264_vaapi            VAAPI Linux        H.264
hevc_vaapi            VAAPI Linux        H.265/HEVC
av1_vaapi             VAAPI Linux        AV1
h264_amf              AMD Windows        H.264
hevc_amf              AMD Windows        H.265/HEVC
av1_amf               AMD Windows        AV1
h264_videotoolbox     Apple macOS        H.264
hevc_videotoolbox     Apple macOS        H.265/HEVC
h264_rkmpp            Rockchip           H.264
hevc_rkmpp            Rockchip           H.265/HEVC
av1_rkmpp             Rockchip           AV1
h264_v4l2m2m          Linux V4L2         H.264
libx264               software           H.264
libx265               software           H.265/HEVC
libsvtav1             software           AV1
```

---

## Part 6: GOP / Keyframe Flags (`GetHlsVideoKeyFrameArguments()` ~line 1924)

For HLS, keyframes must land exactly on segment boundaries so seeking works.

```
-g:v:0 {N} -keyint_min:v:0 {N}
```

**Formula:** `N = math.ceil(segment_length_seconds × framerate)`
Example: 3s segments × 24fps = 72; 6s × 30fps = 180

**Codecs that use `-g` + `-keyint_min`:**
- h264_qsv, h264_nvenc, h264_amf, h264_rkmpp
- hevc_qsv, hevc_nvenc, hevc_rkmpp
- av1_qsv, av1_nvenc, av1_amf, libsvtav1

**Codecs that use forced keyframe expression instead:**
- libx264, libx265, h264_vaapi, hevc_vaapi, av1_vaapi
```
-force_key_frames:v:0 "expr:gte(t,n_forced*{seg_len})"
```

---

## Part 7: Rate Control & Bitrate (`GetVideoBitrateParam()` ~line 1561)

| Encoder | Flags |
|---------|-------|
| libx264 / libx265 | `-maxrate {br} -bufsize {br*2}` |
| libsvtav1 | `-b:v {br} -bufsize {br*2}` |
| h264_nvenc / hevc_nvenc / av1_nvenc | `-b:v {br} -maxrate {br} -bufsize {br*2}` |
| h264_qsv / hevc_qsv / av1_qsv | `-b:v {br} -maxrate {br+1} -rc_init_occupancy {br*2} -bufsize {br*4}` + `-mbbrc 1` (not av1) |
| h264_amf / hevc_amf / av1_amf | `-rc cbr -qmin 0 -qmax 32 -b:v {br} -maxrate {br} -bufsize {br*2}` |
| h264_vaapi / hevc_vaapi (i965 driver) | `-rc_mode CBR -b:v {br} -maxrate {br} -bufsize {br*2}` |
| h264_vaapi / hevc_vaapi (iHD driver) | `-rc_mode VBR -b:v {br} -maxrate {br} -bufsize {br*2}` |
| h264_videotoolbox / hevc_videotoolbox | `-b:v {br} -qmin -1 -qmax -1` ← NO maxrate/bufsize (causes hangs) |

**QSV trick:** `maxrate = bitrate + 1` is intentional — it triggers QSV's VBR mode internally.

**CRF (software encoders only):**
```
-crf {value}    # libx264 default=23, libx265 default=28, range 0–51
```

---

## Part 8: Preset Flags (`GetEncoderParam()` ~line 1649)

### NVIDIA NVENC (`-preset p1`–`p7`)
| Slowness | Flag |
|---|---|
| veryslow | `-preset p7` |
| slower | `-preset p6` |
| slow | `-preset p5` |
| medium | `-preset p4` |
| fast | `-preset p3` |
| faster | `-preset p2` |
| veryfast/superfast/ultrafast | `-preset p1` |

### Intel QSV
```
-preset veryslow|slower|slow|medium|fast|faster|veryfast
```
Default fallback: `veryfast`

### AMD AMF (`-quality`)
| Slowness | Flag |
|---|---|
| veryslow/slower/slow | `-quality quality` |
| medium | `-quality balanced` |
| fast/faster/veryfast/superfast/ultrafast | `-quality speed` |

HEVC + AV1 AMF extra:
```
-header_insertion_mode gop    # hevc_amf and av1_amf
-gops_per_idr 1               # hevc_amf only
```

### Intel VAAPI (`-compression_level`, Intel iHD driver only — NOT on AMD)
| Slowness | Flag |
|---|---|
| veryslow | `-compression_level 1` |
| medium | `-compression_level 4` |
| veryfast/superfast/ultrafast | `-compression_level 7` |

### Apple VideoToolbox (`-prio_speed`)
```
veryslow/slower/slow/medium → -prio_speed 0    # quality priority
fast and faster             → -prio_speed 1    # speed priority
```

### libsvtav1 (`-preset 5`–`13`)
| Slowness | Preset |
|---|---|
| veryslow | `-preset 5` |
| medium | `-preset 8` |
| ultrafast | `-preset 13` |

---

## Part 9: Profile & Level Flags (`GetVideoQualityParam()` ~line 2005)

Applied as `-profile:v:0 {value}` and `-level {value}`.

### H.264 Profile Normalization (per encoder)
| Encoder | Constrained Baseline input | Constrained High input |
|---------|---------------------------|------------------------|
| h264_vaapi | kept as `constrained_baseline` | → `high` |
| h264_qsv / h264_nvenc / libx264 | → `baseline` | → `high` |
| h264_amf / h264_videotoolbox | kept as-is (both supported) | kept as-is |

**H.265:** High/main10 profiles → `main` for 8-bit sources  
**AV1:** Only `main` profile supported; high/professional → `main`  
**No profile flag:** `av1_nvenc`, `h264_v4l2m2m`

### Level Conversion
| Encoder | Conversion | Example |
|---------|------------|---------|
| h264_qsv / libx264 / h264_amf | direct | 51 → `-level 51` |
| hevc_qsv | `level / 3` | 153 → `-level 51` |
| av1_qsv / libsvtav1 | `(2 + (L>>2))*10 + (L&3)` | 15 → `-level 63` |
| NVENC (any codec) | **NOT applied** — causes encoder failure | — |
| VAAPI on AMD | **NOT applied** — causes corrupt frames | — |
| libx265 | via `-x265-params:0 level=N` only | — |

---

## Part 10: Platform-Specific Extra Flags

### Intel (QSV and VAAPI)
```
-low_power 1        # enables Intel Low Power encoding mode
                    # condition: EnableIntelLowPowerH264HwEncoder / EnableIntelLowPowerHevcHwEncoder config flag

-async_depth 1      # workaround for i915 GPU hang on Linux kernel 5.18–6.1.3 when using QSV + OCL tonemap

-sei -a53_cc        # embed A/53 closed caption SEI data (h264_vaapi / hevc_vaapi)
                    # condition: FFmpeg >= minimum version that supports this

-flags:v -global_header   # hevc_vaapi on AMD driver only
                           # prevents non-playable fMP4 on iOS Safari
```

### Software Encoders
```
# libx264
-x264opts:0 subme=0:me_range=16:rc_lookahead=10:me=hex:open_gop=0

# libx265
-x265-params:0 no-scenecut=1:no-open-gop=1:no-info=1
# (when preset < ultrafast, adds):
# :subme=3:merange=25:rc-lookahead=10:me=star:ctu=32:max-tu-size=32:min-cu-size=16:rskip=2:rskip-edge-threshold=2:no-sao=1:no-strong-intra-smoothing=1

# libsvtav1
-svtav1-params:0 rc=1:tune=0:film-grain=0:enable-overlays=1:enable-tf=0
```

---

## Part 11: Audio Flags (`GetAudioArguments()` / `DynamicHlsController`)

### Codec selection (`GetAudioEncoder()` ~line 735)
AAC priority chain: `aac_at` (Apple hardware) → `libfdk_aac` (if FDK-enabled build) → `aac`

| Requested codec | Encoder used |
|---|---|
| aac | aac_at → libfdk_aac → aac |
| mp3 | libmp3lame |
| opus | libopus |
| vorbis | libvorbis |
| flac | flac |
| dts | dca |
| alac | alac |

### Channel count (`GetNumAudioChannelsParam()` ~line 2851)
```
-ac 2    # stereo downmix
```
HLS enforces valid channel counts. When input has odd channel count:
- 3 or 4 channels → forced to 2 (stereo)
- 5 channels → bumped to 6 (5.1 + LFE)
- 7 channels → bumped to 8 (7.1)

### Audio bitrate (`GetAudioBitrateParam()` ~line 2704)
```
-ab {value}    # in bits/s (e.g. 128000)
```
Formula: `output_channels × 128000` for AAC/MP3/Opus  
Example: stereo = 256000 bps, but client request cap applies.

### Volume boost filter (`GetAudioFilterParam()` ~line 2804)
```
-af "volume=2"
```
Triggered when: stereo downmix is happening AND `DownMixAudioBoost != 1.0`  
Default `DownMixAudioBoost = 2.0` (EncodingOptions.cs). Compensates loudness loss from surround→stereo collapse.

When custom downmix algorithm is set, `-af` may include a stereo filter first:
```
-af "stereo,volume=2"    # with downmix algorithm
```

---

## Part 12: Timestamp & Queue Flags

```
-copyts                      # preserve original PTS/DTS timestamps
-avoid_negative_ts disabled  # don't clip negative timestamps (always paired with -copyts)
```
Applied when: `RunTimeTicks.HasValue` (file has a known duration).

```
-max_muxing_queue_size 2048  # configurable (default 2048, hard minimum 128)
                              # prevents "Too many packets buffered for output stream" errors
```

---

## Part 13: HLS Muxer Flags (`DynamicHlsController.GetCommandLineArguments()` ~line 1573)

```
-f hls                                    # HLS mux format (always)
-max_delay 5000000                        # 5 seconds in μs (always hardcoded)
-hls_time {N}                             # segment duration in seconds
-hls_segment_type fmp4                    # "fmp4" when output container is mp4; "mpegts" otherwise
-hls_fmp4_init_filename "{hash}-1.mp4"    # init segment filename (fMP4 only)
-start_number {N}                         # first segment index (0 normally; changes on seek)
-hls_segment_filename "{hash}%d.mp4"      # segment file pattern
-hls_playlist_type vod                    # "vod" for files, "event" for live append
-hls_list_size 0                          # 0 = keep all segments in playlist (unlimited)
-hls_segment_options movflags=+frag_discont   # fMP4 + video stream present; allows discontinuous fragments
-y                                        # overwrite output (always)
```

**Segment length (`-hls_time`) decision logic:**
```python
if request.segment_length:
    return request.segment_length
elif copy_codec:
    if apple_device:   return 6
    elif live_stream:  return 3
    else:              return 6
else:  # transcoded
    return 3
```

**`-hls_segment_options` vs `-hls_ts_options`:**  
FFmpeg < 4.1 uses `-hls_ts_options`; FFmpeg ≥ 4.1 uses `-hls_segment_options`.

---

## Part 14: Pixel Formats Reference

| Context | Format string |
|---------|---------------|
| 8-bit SDR (most common output) | `yuv420p` |
| 10-bit HDR intermediate | `yuv420p10le` |
| NV12 HW surface (GPU memory, 8-bit) | `nv12` |
| 10-bit HW surface | `p010` / `p010le` |
| VAAPI GPU surface | `vaapi` |
| QSV GPU surface | `qsv` |
| CUDA GPU surface | `cuda` |
| D3D11VA GPU surface | `d3d11` |
| VideoToolbox GPU surface | `videotoolbox_vld` |
| DRM/RKMPP surface | `drm_prime` |
| Subtitle BGRA alpha | `bgra` |
| Subtitle with alpha channel | `yuva420p` |

---

## Part 15: Full HW vs. SW Encode Pipeline Comparison

### Full HW Transcode (entire pipeline on GPU)
No `hwdownload` is inserted. Surfaces stay in VRAM throughout.
```
NVIDIA:  [nvdec] → scale_cuda=format=nv12 → [h264_nvenc / hevc_nvenc]
Intel:   [vaapi] → scale_vaapi=format=nv12 → hwmap=derive_device=qsv,format=qsv → [h264_qsv]
VAAPI:   [vaapi] → scale_vaapi=format=nv12 → [h264_vaapi / hevc_vaapi]
Apple:   [videotoolbox] → scale_vt=format=nv12 → [h264_videotoolbox]
AMD:     [d3d11va] → hwmap→opencl → scale_opencl → hwmap→d3d11va,format=d3d11 → [hevc_amf]
```

### HW Decode + SW Encode
`hwdownload` terminates the HW pipeline before the SW encoder.
```
NVIDIA:  [nvdec] → scale_cuda → hwdownload → format=yuv420p → [libx265]
VAAPI:   [vaapi] → scale_vaapi → hwdownload → format=yuv420p → [libx264]
QSV:     [qsv] → vpp_qsv → hwdownload → format=yuv420p → [libx264]
```

---

## Part 16: Real Production Command (Annotated)

This is a real command from Jellyfin logs for Intel QSV H.264 encoding on Linux.

```bash
/usr/lib/jellyfin-ffmpeg/ffmpeg
  # Input analysis (Part 2)
  -analyzeduration 200M -probesize 1G
  -f matroska                            # mkv container, HW accel enabled

  # HW device init — VAAPI parent → QSV child (Part 1)
  -init_hw_device vaapi=va:/dev/dri/renderD128,driver=iHD
  -init_hw_device qsv=qs@va
  -filter_hw_device qs

  # VAAPI decoder (Part 1)
  -hwaccel vaapi -hwaccel_output_format vaapi -noautorotate

  -i file:"/storage/movies/Dhurandhar/Dhurandhar.mkv"
  -noautoscale                           # HW decoder in use (Part 2)

  # Stream mapping (Part 3)
  -map_metadata -1 -map_chapters -1 -threads 0
  -map 0:0 -map 0:1 -map -0:s           # video + audio, exclude subs (HLS)

  # Video encoder (Part 5)
  -codec:v:0 h264_qsv

  # Preset (Part 8)
  -preset veryfast

  # Rate control (Part 7)
  -mbbrc 1                               # MacroBlock RC for QSV H.264
  -b:v 292000 -maxrate 292001            # +1 trick to force VBR
  -rc_init_occupancy 584000              # bitrate × 2
  -bufsize 1168000                       # bitrate × 4

  # Profile & level (Part 9)
  -profile:v:0 high -level 51

  # GOP (Part 6)
  -g:v:0 72 -keyint_min:v:0 72          # ceil(3s × 24fps)

  # Filter chain (Part 4)
  -vf "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,
       scale_vaapi=w=960:h=402:format=nv12:extra_hw_frames=24,
       hwmap=derive_device=qsv,
       format=qsv"

  # Audio (Part 11)
  -codec:a:0 libfdk_aac
  -ac 2                                  # stereo (multichannel input)
  -ab 128000                             # 128 kbps
  -af "volume=2"                         # DownMixAudioBoost=2.0 compensation

  # Timestamps + queue (Part 12)
  -copyts -avoid_negative_ts disabled
  -max_muxing_queue_size 2048

  # HLS muxer (Part 13)
  -f hls
  -max_delay 5000000
  -hls_time 3
  -hls_segment_type fmp4
  -hls_fmp4_init_filename "6fc37c61e5dc970611f3cda3bc94adb4-1.mp4"
  -start_number 0
  -hls_segment_filename "/cache/transcodes/6fc37c61e5dc970611f3cda3bc94adb4%d.mp4"
  -hls_playlist_type vod
  -hls_list_size 0
  -hls_segment_options movflags=+frag_discont
  -y "/cache/transcodes/6fc37c61e5dc970611f3cda3bc94adb4.m3u8"
```

---

## Part 17: Where to Find Reference Code in Jellyfin

All paths are relative to the Jellyfin repository root.
The repo is at `/Users/I749659/repo/jellyfin/`.

| What you want to understand | File | Key function | Approx. line |
|---|---|---|---|
| HW device init + decoder selection | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetInputVideoHwaccelArgs()` | 984 |
| Input format forcing, probesize | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetInputModifier()` | 7186 |
| `-noautoscale` | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetInputArgument()` | 1218 |
| Stream mapping | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetMapArgs()` | 2989 |
| GOP / keyframe flags | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetHlsVideoKeyFrameArguments()` | 1924 |
| Color annotation (setparams) | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetOverwriteColorPropertiesParam()` | 6251 |
| VAAPI scale filter | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetHwScaleFilter()` | 3225 |
| VAAPI→QSV bridge + full QSV filter chain | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetIntelQsvVaapiVidFiltersPrefered()` | 4649 |
| Full filter chain router | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetVideoProcessingFilterParam()` | 6145 |
| NVIDIA filter chain | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetNvidiaVidFilterChain()` | ~3871 |
| AMD Windows filter chain | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetAmdDx11VidFiltersPrefered()` | 4081 |
| VAAPI filter chain (Linux) | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetVaapiVidFilterChain()` | ~4921 |
| Apple filter chain | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetAppleVidFiltersPreferred()` | ~5666 |
| Encoder selection | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetH26xOrAv1Encoder()` | 196 |
| Bitrate / rate control | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetVideoBitrateParam()` | 1561 |
| Preset flags | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetEncoderParam()` | 1649 |
| Profile + level + low_power + async_depth | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetVideoQualityParam()` | 2005 |
| Audio codec selection | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetAudioEncoder()` | 735 |
| Audio channel count + downmix | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetNumAudioChannelsParam()` | 2851 |
| Audio bitrate | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetAudioBitrateParam()` | 2704 |
| Volume boost filter | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` | `GetAudioFilterParam()` | 2804 |
| HLS muxer flags + full command assembly | `Jellyfin.Api/Controllers/DynamicHlsController.cs` | `GetCommandLineArguments()` | 1573 |
| Segment length decision | `MediaBrowser.Controller/Streaming/StreamState.cs` | `SegmentLength` property | 74 |
| Default probe/analyze values | `Emby.Server.Implementations/ConfigurationOptions.cs` | static dict | 18–19 |
| Encoding config knobs | `MediaBrowser.Model/Configuration/EncodingOptions.cs` | all properties | throughout |
| HW acceleration type enum | `MediaBrowser.Model/Entities/HardwareAccelerationType.cs` | enum | throughout |

---

## Quick-Reference: Encoder Flag Matrix

| Encoder | Preset flag | Rate control | mbbrc | Level flag | Profile flag |
|---|---|---|---|---|---|
| h264_nvenc | `-preset p1`–`p7` | `-b:v -maxrate -bufsize` | no | **never** | yes |
| hevc_nvenc | `-preset p1`–`p7` | `-b:v -maxrate -bufsize` | no | **never** | no |
| av1_nvenc | `-preset p1`–`p7` | `-b:v -maxrate -bufsize` | no | **never** | **never** |
| h264_qsv | `-preset` | `-b:v -maxrate(+1) -rc_init_occupancy -bufsize` | **yes** | direct | yes (normalized) |
| hevc_qsv | `-preset` | same | yes | `level/3` | yes |
| av1_qsv | `-preset` | same | no | formula | yes |
| h264_amf | `-quality` | `-rc cbr -qmin 0 -qmax 32 -b:v -maxrate -bufsize` | no | direct | yes |
| hevc_amf | `-quality` + `-header_insertion_mode gop -gops_per_idr 1` | same | no | direct | yes |
| h264_vaapi | `-compression_level` (iHD only) | `-rc_mode VBR/CBR -b:v -maxrate -bufsize` | no | Intel only | yes (normalized) |
| hevc_vaapi | same | same | no | Intel only | yes |
| h264_videotoolbox | `-prio_speed 0/1` | `-b:v -qmin -1 -qmax -1` | no | no | yes |
| hevc_videotoolbox | `-prio_speed 0/1` | same | no | no | yes |
| libx264 | `-preset` | `-maxrate -bufsize` (+ `-crf`) | no | direct | yes |
| libx265 | `-preset` | `-maxrate -bufsize` (+ `-crf`) | no | via x265-params | yes |
| libsvtav1 | `-preset 5`–`13` | `-b:v -bufsize` | no | formula | yes |
