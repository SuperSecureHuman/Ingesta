# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (ffmpeg + Intel QSV/VAAPI support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libva2 \
    libva-drm2 \
    libdrm2 \
    intel-gpu-tools \
    intel-media-va-driver mesa-va-drivers \
    i965-va-driver libva2 libva-drm2 libva-x11-2 libvpl2 vainfo \
    wget xz-utils

RUN wget https://github.com/jellyfin/jellyfin-ffmpeg/releases/download/v7.1.3-4/jellyfin-ffmpeg_7.1.3-4_portable_linux64-gpl.tar.xz

RUN tar -xf jellyfin-ffmpeg_7.1.3-4_portable_linux64-gpl.tar.xz -C /app

RUN rm -rf /var/lib/apt/lists/*

RUN apt-get clean

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY config.py logger.py main.py ./
COPY routes ./routes
COPY db ./db
COPY media ./media
COPY scripts ./scripts
COPY static ./static

# Copy ffmpeg/ffprobe binaries
# COPY ffmpeg ffprobe /app/

# Create data directory for SQLite
RUN mkdir -p /app/data /app/media 
RUN chmod +x /app/ffmpeg /app/ffprobe

# Expose FastAPI port
EXPOSE 8000

# Run FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
