# DHT Search API

A JSON API service for searching torrents indexed from the BitTorrent DHT network. Built with Hono + Node.js.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VPS (DigitalOcean)                       │
│                                                              │
│   ┌─────────────────┐         ┌─────────────────────────┐   │
│   │  bitmagnet      │         │  dht-api                │   │
│   │                 │         │                         │   │
│   │  DHT Crawler    │         │  Hono API Server        │   │
│   │  Port: 3334/udp │         │  Port: 3333             │   │
│   └────────┬────────┘         └────────────┬────────────┘   │
│            │ writes                        │ reads          │
│            ▼                               ▼                │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 Supabase Postgres                    │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 3. Run Database Migrations

From the main project root:

```bash
supabase db push --linked --include-all
```

### 4. Generate an API Key

```bash
pnpm generate-key pro "My Application" admin@example.com
```

### 5. Start Development Server

```bash
pnpm dev
```

### 6. Test the API

```bash
# Health check (no auth required)
curl http://localhost:3333/health

# Search (requires API key)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3333/v1/search?q=ubuntu"
```

## Deployment

### Automated Setup

On your VPS (Ubuntu 22.04+):

```bash
sudo bash scripts/setup-dht-services.sh
```

This installs:
- Bitmagnet DHT crawler
- DHT Search API
- systemd services
- Log rotation

### Manual Setup

1. Ensure Node.js 22+ and pnpm are installed
2. Copy service files to `/opt/dht-api`
3. Configure environment variables
4. Install systemd services from `systemd/` directory
5. Start services

## API Reference

### Authentication

All `/v1/*` endpoints require an API key:

```
Authorization: Bearer dht_live_xxx...
```

Or as query parameter: `?api_key=dht_live_xxx...`

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (no auth) |
| `/v1/search` | GET | Search torrents |
| `/v1/torrent/:infohash` | GET | Get torrent details |
| `/v1/recent` | GET | Recent torrents |
| `/v1/stats` | GET | DHT statistics |
| `/v1/stream` | GET | SSE stream (Pro+) |
| `/v1/me` | GET | API key info |

### Search Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query (2-200 chars) |
| `limit` | int | 50 | Results per page (1-100) |
| `offset` | int | 0 | Pagination offset |
| `sort` | string | date | Sort: date, size, seeders, relevance |
| `order` | string | desc | Order: asc, desc |
| `min_size` | int | - | Min size in bytes |
| `max_size` | int | - | Max size in bytes |
| `category` | string | - | Filter: video, audio, software, ebook, other |

### Response Format

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "request_id": "req_abc123",
    "took_ms": 45
  }
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_API_KEY` | 401 | Missing or invalid key |
| `EXPIRED_API_KEY` | 401 | Key has expired |
| `RATE_LIMITED` | 429 | Too many requests |
| `QUOTA_EXCEEDED` | 429 | Daily quota reached |
| `INVALID_PARAMS` | 400 | Invalid parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Server error |

## API Tiers

| Tier | Rate Limit | Daily Limit | SSE |
|------|------------|-------------|-----|
| Free | 30/min | 1,000 | No |
| Basic | 60/min | 10,000 | No |
| Pro | 120/min | 50,000 | Yes |
| Enterprise | 300/min | 1,000,000 | Yes |

## Development

### Scripts

```bash
# Development with hot reload
pnpm dev

# Production
pnpm start

# Generate API key
pnpm generate-key [tier] [name] [email]

# Type check
pnpm typecheck
```

### Project Structure

```
dht-search-api/
├── src/
│   ├── index.ts           # Entry point
│   ├── app.ts             # Hono app setup
│   ├── routes/            # API route handlers
│   ├── middleware/        # Auth, rate limiting, logging
│   ├── services/          # Database, cache, search logic
│   ├── utils/             # Helpers and validation
│   └── types/             # TypeScript types
├── scripts/
│   ├── generate-key.ts    # API key generation
│   └── setup-dht-services.sh  # Deployment script
├── systemd/               # Service configurations
├── package.json
└── tsconfig.json
```

## Service Management

```bash
# Start services
sudo systemctl start bitmagnet dht-api

# Stop services
sudo systemctl stop bitmagnet dht-api

# View status
sudo systemctl status bitmagnet dht-api

# View logs
tail -f /var/log/bitmagnet.log
tail -f /var/log/dht-api.log
journalctl -u dht-api -f
```

## Monitoring

### Health Check

```bash
curl http://localhost:3333/health
```

Response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Rate Limit Headers

All authenticated responses include:
- `X-RateLimit-Limit`: Requests allowed per minute
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `X-DailyLimit-Limit`: Daily request limit
- `X-DailyLimit-Used`: Requests used today
- `X-DailyLimit-Remaining`: Requests remaining today
