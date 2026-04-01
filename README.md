# Ingesta

## CAUTION: Work in progress (or vibe in progress)


A professional media review and delivery platform for teams that work with large-format media files. Preview, scrub, and selectively download instantly—without waiting for 50GB downloads.

## Objective

Ingesta solves the core workflow problem for media professionals: collaborators shouldn't have to download massive files (6K RAW, 4K ProRes, etc.) just to review, approve, or make decisions about them.

With server-side on-demand transcoding, teammates can:
- **Preview instantly** at any quality tier without downloading
- **Scrub through** long-form content with dynamic seeking
- **Make decisions faster** with real-time feedback
- **Download selectively** only approved clips or final versions

**Core capabilities:**
- On-demand transcoding with multiple quality / bitrate tiers (480p, 720p, 1080p, source)
- Dynamic seeking with instant transcode restart
- Segment-based HLS streaming for adaptive playback
- Hardware acceleration detection (NVENC, VideoToolbox, etc.)
- Multi-user support with JWT authentication
- Media library and project management
- SQLite or PostgreSQL support
- Structured logging for production deployments

## Planned Features
- User roles & permissions (admin, editor, viewer)
- Collaborative annotations and comments

- Support for more formats (ProRes RAW, REDCODE, etc.)
- Raw sub clip download (no quality loss clip downloads)

## Implemented Features
- Realtime LUT preview so that we dont look at flat footage [server side vs webgl?]
- Tag camera / color metadata

## Stack

**Backend:**
- FastAPI 0.104+ (async web framework)
- uvicorn (ASGI server)
- aiosqlite / asyncpg (async database drivers)
- FFmpeg (transcoding engine)
- pydantic (validation & settings)
- PyJWT + passlib (authentication)

**Frontend:**
- Next.js 14 (React + TypeScript)
- hls.js (HLS playback)
- Tailwind CSS (styling)

**Media:**
- FFprobe (media metadata)
- FFmpeg (on-demand transcoding)

## Installation

### Prerequisites
- Python 3.10+
- FFmpeg + FFprobe in PATH
- Node.js 18+ (for frontend)

### Backend Setup

1. Clone the repo:
```bash
git clone https://github.com/SuperSecureHuman/Ingesta.git
cd Ingesta
```

2. Create virtual environment and install dependencies:
```bash
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# or: .venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

3. Configure environment:
```bash
cp .env.example .env
```

Edit `.env` with your settings:
```env
MEDIA_ROOT=/path/to/your/media
SEGMENT_LENGTH=6
DATABASE_URL=sqlite+aio:///./data/ingesta.db
SECRET_KEY=your-secret-key-here
ADMIN_API_KEY=your-api-key-here
LOG_LEVEL=INFO
```

4. Initialize database:
```bash
python3 -c "import asyncio; import db; asyncio.run(db.init_db('sqlite+aio:///./data/ingesta.db'))"
```

5. Run backend:
```bash
python3 main.py
```

Backend runs at `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend:
```bash
cd frontend
npm install
```

2. Run development server:
```bash
npm run dev
```

Frontend runs at `http://localhost:3000`

## Use Cases

**Post-Production Teams**
- Director + VFX supervisor review dailies without 100GB downloads
- Color grader gets real-time feedback on LUT changes at 1080p instead of waiting for DCI 4K render

**VFX Studios**
- Clients review work-in-progress at source resolution on their home connections (auto-downscales)
- Asset library: browse renders by shot, preview at working resolution before commit

**Broadcast / Content Delivery**
- Archive large uncompressed masters, deliver review proxies instantly
- Editors scrub through 8-hour rushes at 720p from any location

**Commercial Production**
- Photographer shares 6K RAW library with creative director — preview at 1080p, approve selectively for download
- Production company shares delivery cuts with multiple stakeholders simultaneously

## Usage

### Web UI (Media Review Workflow)

1. Open `http://localhost:3000` and login with default credentials: `admin` / `changeme`
2. **Create a Library** → point to your media storage (NAS, local drive, etc.)
3. **Create a Project** → organize reviews/deliverables by job/client/deadline
4. **Add Media** → browse library and add files to project
5. **Share Link** → generate shareable review link for team members or clients
6. **Play & Review** → instant playback at any quality (no download needed)
   - Scrub through full-res content smoothly
   - Quality auto-adjusts to network speed
   - Request download-only files individually


## Configuration

All settings from `.env`:

| Variable                    | Default                           | Notes                           |
|-----------------------------|-----------------------------------|---------------------------------|
| `MEDIA_ROOT`                | (empty)                           | Path to media files             |
| `SEGMENT_LENGTH`            | 6                                 | Seconds per HLS segment         |
| `DATABASE_URL`              | `sqlite+aio:///./data/ingesta.db` | SQLite or PostgreSQL            |
| `MAX_CONCURRENT_STREAMS`    | 10                                | Parallel FFmpeg processes       |
| `SECRET_KEY`                | change-me-in-production           | JWT signing key                 |
| `ADMIN_API_KEY`             | change-me-in-production           | Admin endpoint header key       |
| `ADMIN_USERNAME`            | admin                             | Default user                    |
| `ADMIN_PASSWORD`            | changeme                          | Default password                |
| `SCANNER_INTERVAL`          | 30                                | Seconds between file scans      |
| `CLEANUP_INTERVAL`          | 20                                | Seconds between segment cleanup |
| `WORKDIR_RETENTION_SECONDS` | 3600                              | Keep work dirs 1 hour           |
| `SEGMENT_RETENTION_SECONDS` | 120                               | Keep segments 2 minutes         |
| `LOG_LEVEL`                 | INFO                              | DEBUG, INFO, WARNING, ERROR     |
| `LOG_FORMAT`                | auto                              | json, text, or auto-detect      |



## Architecture

**Backend (FastAPI):**
- `/routes/auth.py` — Authentication (JWT + session)
- `/routes/libraries.py` — Media library management
- `/routes/projects.py` — Project & file management
- `/routes/stream.py` — HLS playlist, segments, thumbnails
- `/media/transcoder.py` — FFmpeg process management & seeking
- `/media/playlist.py` — HLS playlist generation
- `/db/` — SQLite/PostgreSQL models and CRUD

**Frontend (Next.js):**
- React Context for app state (auth, UI, playback)
- hls.js for adaptive bitrate playback
- Server-side API calls (no backend proxy)

**Workflow:**
1. Client requests segment at quality `X`, position `Y`
2. Backend checks if segment cached; if yes, return immediately
3. If no, spawn FFmpeg transcode from position Y → next segment
4. Client polls for segment availability
5. Once ready, serve cached segment via FileResponse
6. Background cleanup removes old segments every 20s

## Development

### Adding a New Quality Tier

Edit `media/transcoder.py` `BITRATE_TIERS` list, then backend auto-exposes via `/api/bitrate-tiers`.

## Performance Notes

- Segments cached to `/tmp/hls_srv/{stream_id}/`
- FFmpeg processes share the same output directory per stream
- Quality changes trigger transcode restart (old segments cleared)
- Up to 10 concurrent FFmpeg processes (configurable)
- Segment retention is 2 minutes by default (tune `SEGMENT_RETENTION_SECONDS`)

## Security

- All API endpoints require JWT authentication (except `/static/`)
- Admin endpoints check `X-Admin-Key` header
- Database passwords should be in environment variables
- Change default credentials in production
- Use HTTPS in production (add reverse proxy)

## Troubleshooting

**"Permission denied" on MEDIA_ROOT:**
- Ensure process has read access to media files

**FFmpeg not found:**
- Install FFmpeg: `brew install ffmpeg` (macOS), `apt-get install ffmpeg` (Linux)
- Verify with: `which ffmpeg && which ffprobe`

**Segment generation timeout (504):**
- Increase `MAX_CONCURRENT_STREAMS` or reduce concurrent playback
- Check FFmpeg errors in logs with `LOG_LEVEL=DEBUG`

**Database locked (SQLite):**
- SQLite doesn't handle high concurrency well — use PostgreSQL for production

