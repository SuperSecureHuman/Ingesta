# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (ffmpeg + full Intel QSV/VAAPI support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libva2 \
    libva-drm2 \
    libva-x11-2 \
    libvpl2 \
    intel-media-va-driver-non-free \
    intel-gpu-tools \
    libdrm2 \
    libigfxcmrt7 \
    && rm -rf /var/lib/apt/lists/*

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
# && chmod +x /app/ffmpeg /app/ffprobe

# Expose FastAPI port
EXPOSE 8000

# Run FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
