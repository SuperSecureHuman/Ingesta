# Ingesta - Docker Deployment Guide

## Local Development

Use `docker-compose.local.yml` for local development with local builds:

```bash
# Build and run locally
docker-compose -f docker-compose.local.yml up -d --build

# Access at http://localhost:8080
```

## Production Deployment (with GHCR)

### Prerequisites

1. GitHub repository (public or private)
2. Docker images pushed to GHCR (GitHub Container Registry)
3. Token for pulling from GHCR (if private)

### Setup

1. **Configure environment variables:**

```bash
cp .env.docker .env
# Edit .env with your settings:
# - BACKEND_IMAGE=ghcr.io/YOUR-USERNAME/ingesta-backend:latest
# - FRONTEND_IMAGE=ghcr.io/YOUR-USERNAME/ingesta-frontend:latest
# - MEDIA_ROOT=/path/to/media
# - SECRET_KEY (generate with: python3 -c "import secrets; print(secrets.token_hex(32))")
# - ADMIN_API_KEY (generate with: python3 -c "import secrets; print(secrets.token_hex(32))")
# - ADMIN_PASSWORD (strong password)
```

2. **Deploy with docker-compose:**

```bash
# Pull latest images and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Automatic Image Builds

Images are automatically built and pushed to GHCR on every push to `main` branch:

- **Backend:** `ghcr.io/USERNAME/ingesta-backend:latest`
- **Frontend:** `ghcr.io/USERNAME/ingesta-frontend:latest`

Both images are tagged with:
- `latest` (always latest)
- `COMMIT_SHA` (specific commit)

### Accessing the App

- **UI:** `http://your-server/` (or `http://localhost:8080` if local)
- **API:** `http://your-server/api/` (or `http://localhost:8080/api/` if local)

Default credentials:
- Username: `admin`
- Password: (from `ADMIN_PASSWORD` env var)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_IMAGE` | `ghcr.io/your-username/ingesta-backend:latest` | Backend container image |
| `FRONTEND_IMAGE` | `ghcr.io/your-username/ingesta-frontend:latest` | Frontend container image |
| `MEDIA_ROOT` | `/path/to/media` | Host directory with media files |
| `HTTP_PORT` | `80` | Port to expose on host |
| `API_URL` | `http://localhost/api` | API URL for frontend |
| `SECRET_KEY` | `your-secret-key-change-in-prod` | JWT secret (CHANGE THIS!) |
| `ADMIN_API_KEY` | `admin-key-test-value` | Admin API key (CHANGE THIS!) |
| `ADMIN_USERNAME` | `admin` | Admin username |
| `ADMIN_PASSWORD` | `changeme` | Admin password (CHANGE THIS!) |
| `LOG_LEVEL` | `INFO` | Log level (INFO, DEBUG, WARNING, ERROR) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost` | CORS allowed origins |

### Updating Images

To pull the latest images and restart:

```bash
docker-compose pull
docker-compose up -d
```

### Troubleshooting

**Images not found:**
- Ensure `BACKEND_IMAGE` and `FRONTEND_IMAGE` point to correct GHCR repositories
- For private repos, log in: `docker login ghcr.io -u USERNAME -p GITHUB_TOKEN`

**Transcoding timeout:**
- Increase timeout in `nginx.conf` if needed
- Ensure sufficient CPU/RAM for encoding

**Media files not found:**
- Verify `MEDIA_ROOT` path exists and is readable by Docker
- Check permissions: `ls -la /path/to/media`
