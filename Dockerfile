# Backend Dockerfile
FROM ghcr.io/supersecurehuman/ffmpeg-intel-base:latest

WORKDIR /app

# Install system dependencies (ffmpeg + Intel QSV/VAAPI support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libva2 \
    libva-drm2 \
    libdrm2 \
    intel-gpu-tools \
    intel-media-va-driver mesa-va-drivers \
    i965-va-driver libva2 libva-drm2 libva-x11-2 libvpl2 vainfo \
    wget xz-utils \
    curl ca-certificates

RUN rm -rf /var/lib/apt/lists/*

RUN apt-get clean

ADD https://astral.sh/uv/install.sh /uv-installer.sh

# Run the installer then remove it
RUN sh /uv-installer.sh && rm /uv-installer.sh

# Ensure the installed binary is on the `PATH`
ENV PATH="/root/.local/bin/:$PATH"


# Copy requirements and install Python dependencies
RUN uv python install 3.12
RUN uv venv
COPY requirements.txt .
RUN uv pip install --no-cache-dir -r requirements.txt

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
# RUN chmod +x /app/ffmpeg /app/ffprobe

# Expose FastAPI port
EXPOSE 8000

# Run FastAPI server
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
