# Product Requirements Document
## DHT Torrent Search API Service

**Version:** 1.0  
**Date:** January 2025  
**Status:** Draft

---

## 1. Overview

A standalone JSON API service that provides torrent search capabilities by indexing the BitTorrent DHT network. Designed to be integrated into existing applications and potentially sold as a paid API service.

### Goals
- Provide fast, reliable torrent search via REST API
- Support real-time updates via Server-Sent Events (SSE)
- Run as a managed systemd service on a VPS
- Support API key authentication for monetization
- Handle high throughput with minimal resources

### Non-Goals
- No web UI (consumers build their own)
- No user accounts (API keys only)
- No torrent downloading (metadata only)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VPS (DigitalOcean / Hetzner)                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          systemd                                     │   │
│  │                                                                      │   │
│  │   ┌─────────────────────┐         ┌─────────────────────────────┐  │   │
│  │   │  bitmagnet.service  │         │  dht-api.service            │  │   │
│  │   │                     │         │                             │  │   │
│  │   │  Bitmagnet CLI      │         │  Hono API Server            │  │   │
│  │   │  - DHT Crawler      │         │  - REST endpoints           │  │   │
│  │   │  - Metadata Fetch   │         │  - SSE streams              │  │   │
│  │   │  - Queue Worker     │         │  - API key auth             │  │   │
│  │   │                     │         │  - Rate limiting            │  │   │
│  │   │  Port: 3334/udp     │         │  Port: 3000                 │  │   │
│  │   └──────────┬──────────┘         └──────────────┬──────────────┘  │   │
│  │              │                                   │                  │   │
│  └──────────────┼───────────────────────────────────┼──────────────────┘   │
│                 │                                   │                       │
│                 │ writes                            │ reads                 │
│                 ▼                                   ▼                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │                        Supabase Postgres                             │   │
│  │                                                                      │   │
│  │   • torrents table (infohash, name, size, files)                    │   │
│  │   • api_keys table (key, tier, usage, limits)                       │   │
│  │   • usage_logs table (tracking for billing)                         │   │
│  │   • Full-text search indexes                                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS (port 443)
                                      ▼
                              ┌───────────────┐
                              │   Consumers   │
                              │   (Your UI,   │
                              │   3rd party)  │
                              └───────────────┘
```

---

## 3. Technical Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| DHT Crawler | Bitmagnet CLI | Proven Go-based crawler, 500-1000 torrents/hr |
| API Server | Hono (Bun runtime) | Fastest Node-compatible framework, native SSE |
| Database | Supabase (Postgres) | Managed, includes connection pooling |
| Process Manager | systemd | Native Linux, auto-restart, logging |
| Reverse Proxy | Caddy | Auto HTTPS, simple config |
| Rate Limiting | In-memory + Redis | Fast checks, persistent counters |

### Why Hono + Bun?

```
Benchmark (requests/sec on simple JSON response):
- Express: ~15,000
- Fastify: ~30,000
- Hono + Node: ~35,000
- Hono + Bun: ~90,000
```

Hono also has built-in SSE support, middleware system, and TypeScript-first design.

---

## 4. API Specification

**Base URL:** `https://api.yourdomain.com/v1`

### 4.1 Authentication

All endpoints require an API key via header:

```
Authorization: Bearer <api_key>
```

Or query parameter (less secure, for testing):

```
?api_key=<api_key>
```

### 4.2 Endpoints

#### Search Torrents

```
GET /search
```

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| q | string | Yes | - | Search query (2-200 chars) |
| limit | int | No | 50 | Results per page (1-100) |
| offset | int | No | 0 | Pagination offset |
| sort | string | No | `date` | Sort: `date`, `size`, `seeders`, `relevance` |
| order | string | No | `desc` | Order: `asc`, `desc` |
| min_size | int | No | - | Min size in bytes |
| max_size | int | No | - | Max size in bytes |
| category | string | No | - | Filter: `video`, `audio`, `software`, `other` |

**Response:**

```json
{
  "success": true,
  "data": {
    "query": "ubuntu server",
    "total": 1523,
    "limit": 50,
    "offset": 0,
    "results": [
      {
        "infohash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        "name": "Ubuntu Server 24.04 LTS x64",
        "size": 2548039680,
        "size_formatted": "2.37 GB",
        "files_count": 1,
        "seeders": 150,
        "leechers": 23,
        "discovered_at": "2025-01-20T10:30:00Z",
        "magnet": "magnet:?xt=urn:btih:a1b2c3d4..."
      }
    ]
  },
  "meta": {
    "request_id": "req_abc123",
    "took_ms": 45
  }
}
```

---

#### Get Torrent Details

```
GET /torrent/:infohash
```

**Response:**

```json
{
  "success": true,
  "data": {
    "infohash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "name": "Ubuntu Server 24.04 LTS x64",
    "size": 2548039680,
    "size_formatted": "2.37 GB",
    "seeders": 150,
    "leechers": 23,
    "discovered_at": "2025-01-20T10:30:00Z",
    "updated_at": "2025-01-22T15:00:00Z",
    "magnet": "magnet:?xt=urn:btih:a1b2c3d4...",
    "files": [
      {
        "path": "ubuntu-24.04-live-server-amd64.iso",
        "size": 2548039680,
        "size_formatted": "2.37 GB"
      }
    ]
  }
}
```

---

#### Get Recent Torrents

```
GET /recent
```

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| limit | int | No | 50 | Results (1-100) |
| category | string | No | - | Filter by category |

**Response:** Same structure as search results.

---

#### Get Statistics

```
GET /stats
```

**Response:**

```json
{
  "success": true,
  "data": {
    "total_torrents": 1523847,
    "total_size_bytes": 58493028573920,
    "total_size_formatted": "53.2 TB",
    "torrents_24h": 4521,
    "torrents_7d": 28493,
    "torrents_30d": 98234,
    "crawler_status": "running",
    "last_indexed_at": "2025-01-22T15:30:00Z"
  }
}
```

---

#### Stream New Torrents (SSE)

```
GET /stream
```

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| filter | string | No | - | Filter by name (simple match) |
| category | string | No | - | Filter by category |

**Response:** Server-Sent Events stream

```
event: torrent
data: {"infohash":"a1b2...","name":"Ubuntu...","size":2548039680}

event: torrent
data: {"infohash":"b2c3...","name":"Debian...","size":3221225472}

event: heartbeat
data: {"timestamp":"2025-01-22T15:30:00Z"}
```

Heartbeat sent every 30 seconds to keep connection alive.

---

#### API Key Info

```
GET /me
```

**Response:**

```json
{
  "success": true,
  "data": {
    "key_id": "key_abc123",
    "tier": "pro",
    "requests_today": 1523,
    "requests_limit": 10000,
    "rate_limit": "100/min",
    "created_at": "2025-01-01T00:00:00Z",
    "expires_at": null
  }
}
```

---

### 4.3 Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 45 seconds.",
    "details": {
      "limit": 100,
      "window": "1m",
      "retry_after": 45
    }
  },
  "meta": {
    "request_id": "req_abc123"
  }
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_API_KEY` | 401 | Missing or invalid API key |
| `EXPIRED_API_KEY` | 401 | API key has expired |
| `RATE_LIMITED` | 429 | Too many requests |
| `QUOTA_EXCEEDED` | 429 | Daily/monthly quota reached |
| `INVALID_PARAMS` | 400 | Invalid query parameters |
| `NOT_FOUND` | 404 | Torrent not found |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 5. Database Schema

### 5.1 Bitmagnet Tables (Auto-created)

Bitmagnet creates its own schema. Key tables:

- `torrents` - Main torrent metadata
- `torrent_files` - Files within torrents  
- `torrent_sources` - Seeders/leechers from DHT scrape

### 5.2 API Service Tables

```sql
-- API Keys
CREATE TABLE api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,  -- SHA256 of actual key
    key_prefix TEXT NOT NULL,        -- First 8 chars for identification
    name TEXT,                       -- Friendly name
    tier TEXT NOT NULL DEFAULT 'free', -- free, basic, pro, enterprise
    
    -- Limits
    rate_limit_per_min INT DEFAULT 30,
    daily_limit INT DEFAULT 1000,
    monthly_limit INT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    
    -- Metadata
    owner_email TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Usage Tracking
CREATE TABLE usage_logs (
    id BIGSERIAL PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id),
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INT,
    response_time_ms INT,
    request_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily aggregates for billing
CREATE TABLE usage_daily (
    api_key_id UUID REFERENCES api_keys(id),
    date DATE NOT NULL,
    request_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    avg_response_ms INT,
    PRIMARY KEY (api_key_id, date)
);

-- Indexes
CREATE INDEX idx_usage_logs_key_date ON usage_logs (api_key_id, created_at);
CREATE INDEX idx_api_keys_hash ON api_keys (key_hash);
```

### 5.3 Views for API

```sql
-- Search view with aggregated data
CREATE OR REPLACE VIEW v_torrents AS
SELECT 
    encode(t.info_hash, 'hex') as infohash,
    t.name,
    t.size,
    t.created_at as discovered_at,
    t.updated_at,
    COALESCE(s.seeders, 0) as seeders,
    COALESCE(s.leechers, 0) as leechers,
    (SELECT COUNT(*) FROM torrent_files f WHERE f.info_hash = t.info_hash) as files_count
FROM torrents t
LEFT JOIN LATERAL (
    SELECT SUM(seeders) as seeders, SUM(leechers) as leechers
    FROM torrent_sources WHERE info_hash = t.info_hash
) s ON true;

-- Full-text search index
CREATE INDEX idx_torrents_fts ON torrents 
USING GIN (to_tsvector('english', name));
```

---

## 6. API Key Tiers

| Tier | Rate Limit | Daily Limit | Monthly Limit | SSE | Price |
|------|------------|-------------|---------------|-----|-------|
| Free | 30/min | 1,000 | - | No | $0 |
| Basic | 60/min | 10,000 | - | No | $19/mo |
| Pro | 120/min | 50,000 | - | Yes | $49/mo |
| Enterprise | 300/min | Unlimited | - | Yes | Custom |

---

## 7. Project Structure

```
dht-search-api/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Hono app setup
│   ├── routes/
│   │   ├── search.ts         # GET /search
│   │   ├── torrent.ts        # GET /torrent/:infohash
│   │   ├── recent.ts         # GET /recent
│   │   ├── stats.ts          # GET /stats
│   │   ├── stream.ts         # GET /stream (SSE)
│   │   └── me.ts             # GET /me
│   ├── middleware/
│   │   ├── auth.ts           # API key validation
│   │   ├── rateLimit.ts      # Rate limiting
│   │   ├── logging.ts        # Request logging
│   │   └── errors.ts         # Error handler
│   ├── services/
│   │   ├── db.ts             # Supabase client
│   │   ├── search.ts         # Search logic
│   │   ├── cache.ts          # Redis cache
│   │   └── usage.ts          # Usage tracking
│   ├── utils/
│   │   ├── format.ts         # Size formatting, etc.
│   │   ├── validate.ts       # Input validation
│   │   └── magnet.ts         # Magnet URI builder
│   └── types/
│       └── index.ts          # TypeScript types
├── scripts/
│   ├── generate-key.ts       # CLI to generate API keys
│   └── migrate.ts            # Run DB migrations
├── sql/
│   ├── 001_api_keys.sql
│   └── 002_views.sql
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 8. Deployment

### 8.1 Server Requirements

- **OS:** Ubuntu 24.04 LTS
- **CPU:** 2+ cores
- **RAM:** 4GB minimum (2GB for bitmagnet, 1GB for API, 1GB buffer)
- **Disk:** 50GB+ SSD
- **Network:** Public IP, UDP port 3334 open

### 8.2 systemd Services

**Bitmagnet Crawler:** `/etc/systemd/system/bitmagnet.service`

```ini
[Unit]
Description=Bitmagnet DHT Crawler
After=network.target

[Service]
Type=simple
User=dht
WorkingDirectory=/opt/bitmagnet
Environment=POSTGRES_HOST=db.xxx.supabase.co
Environment=POSTGRES_PORT=5432
Environment=POSTGRES_USER=postgres
Environment=POSTGRES_PASSWORD=xxx
Environment=POSTGRES_DB=postgres
ExecStart=/opt/bitmagnet/bitmagnet worker run --keys=queue_server --keys=dht_crawler
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**API Service:** `/etc/systemd/system/dht-api.service`

```ini
[Unit]
Description=DHT Search API
After=network.target

[Service]
Type=simple
User=dht
WorkingDirectory=/opt/dht-api
EnvironmentFile=/opt/dht-api/.env
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/dht-api/logs

[Install]
WantedBy=multi-user.target
```

### 8.3 Caddy Reverse Proxy

`/etc/caddy/Caddyfile`

```
api.yourdomain.com {
    reverse_proxy localhost:3000
    
    # Rate limiting at edge (backup)
    rate_limit {
        zone api {
            key {remote_host}
            events 100
            window 1m
        }
    }
    
    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        -Server
    }
    
    log {
        output file /var/log/caddy/api.log
        format json
    }
}
```

### 8.4 Environment Variables

```env
# Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres

# Redis (optional, for rate limiting)
REDIS_URL=redis://localhost:6379

# API Config
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Secrets
API_KEY_SALT=random-32-char-string
```

---

## 9. Monitoring & Observability

### 9.1 Health Check Endpoint

```
GET /health
```

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "checks": {
    "database": "ok",
    "crawler": "ok",
    "redis": "ok"
  }
}
```

### 9.2 Metrics Endpoint (Prometheus)

```
GET /metrics
```

```
# HELP dht_api_requests_total Total API requests
# TYPE dht_api_requests_total counter
dht_api_requests_total{endpoint="/search",status="200"} 12345

# HELP dht_api_response_time_ms Response time histogram
# TYPE dht_api_response_time_ms histogram
dht_api_response_time_ms_bucket{endpoint="/search",le="50"} 10000

# HELP dht_torrents_total Total indexed torrents
# TYPE dht_torrents_total gauge
dht_torrents_total 1523847

# HELP dht_crawler_torrents_per_hour Crawl rate
# TYPE dht_crawler_torrents_per_hour gauge
dht_crawler_torrents_per_hour 523
```

### 9.3 Logging

JSON structured logs to stdout (captured by journald):

```json
{
  "level": "info",
  "ts": "2025-01-22T15:30:00Z",
  "msg": "request completed",
  "request_id": "req_abc123",
  "method": "GET",
  "path": "/search",
  "status": 200,
  "duration_ms": 45,
  "api_key": "key_abc...",
  "ip": "1.2.3.4"
}
```

---

## 10. Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Search latency p50 | < 50ms | With warm cache |
| Search latency p99 | < 200ms | Cold query |
| Throughput | > 1000 req/s | Single instance |
| Crawler rate | > 500/hr | Torrents indexed |
| Memory (API) | < 512MB | Bun runtime |
| Memory (Crawler) | < 2GB | Bitmagnet |
| Startup time | < 5s | API service |

---

## 11. Security

### 11.1 API Key Security
- Keys stored as SHA256 hash in database
- Keys generated with 32 bytes of randomness
- Prefix stored separately for identification (e.g., `dht_live_abc123...`)

### 11.2 Input Validation
- All query params validated and sanitized
- Infohash must be exactly 40 hex characters
- Search query max 200 characters
- Parameterized SQL queries (via Supabase client)

### 11.3 Rate Limiting
- Per-key limits (primary)
- Per-IP limits (fallback for abuse)
- Sliding window algorithm
- Redis for distributed state

### 11.4 Network
- HTTPS only (Caddy auto-cert)
- No CORS (API only, not browser)
- Firewall: only 443, 22, and 3334/udp open

---

## 12. Development Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up VPS with Ubuntu 24.04
- [ ] Deploy Bitmagnet, connect to Supabase
- [ ] Verify crawler populating database
- [ ] Initialize Hono project structure
- [ ] Set up systemd services

### Phase 2: Core API (Week 2)
- [ ] Implement `/search` endpoint
- [ ] Implement `/torrent/:infohash` endpoint
- [ ] Implement `/recent` endpoint
- [ ] Implement `/stats` endpoint
- [ ] Add input validation
- [ ] Add error handling

### Phase 3: Auth & Limits (Week 3)
- [ ] Design API key schema
- [ ] Implement key validation middleware
- [ ] Implement rate limiting
- [ ] Add usage tracking
- [ ] Create key generation script
- [ ] Implement `/me` endpoint

### Phase 4: SSE & Polish (Week 4)
- [ ] Implement `/stream` SSE endpoint
- [ ] Add Redis caching layer
- [ ] Implement `/health` and `/metrics`
- [ ] Set up Caddy reverse proxy
- [ ] Load testing
- [ ] Documentation

### Phase 5: Launch (Week 5)
- [ ] Production deployment
- [ ] Set up monitoring/alerts
- [ ] Create API documentation site
- [ ] Soft launch to beta users
- [ ] Iterate based on feedback

---

## 13. Future Enhancements

### 13.1 Features
- Webhooks (notify on new torrents matching filter)
- Batch lookup endpoint (multiple infohashes)
- Advanced search (regex, file type filtering)
- Torrent similarity/recommendations
- Historical data (track seeders over time)

### 13.2 Infrastructure
- Multi-region deployment
- Read replicas for search
- Elasticsearch for better full-text search
- Multiple crawler instances
- CDN for static responses (stats)

### 13.3 Business
- Stripe integration for payments
- Usage dashboard for customers
- Tiered SLAs
- White-label option

---

## 14. Open Questions

1. **Domain:** What domain for the API? (e.g., `api.torrentindex.io`)
2. **Billing:** Stripe? Paddle? LemonSqueezy?
3. **Support:** Email only? Discord?
4. **Legal:** Terms of service, jurisdiction?
5. **Branding:** Service name?

---

## Appendix A: Example cURL Commands

```bash
# Search
curl -H "Authorization: Bearer dht_live_xxx" \
  "https://api.example.com/v1/search?q=ubuntu&limit=10"

# Get torrent
curl -H "Authorization: Bearer dht_live_xxx" \
  "https://api.example.com/v1/torrent/a1b2c3d4e5f6..."

# Stream (SSE)
curl -N -H "Authorization: Bearer dht_live_xxx" \
  "https://api.example.com/v1/stream?filter=linux"

# Check key info
curl -H "Authorization: Bearer dht_live_xxx" \
  "https://api.example.com/v1/me"
```

---

## Appendix B: Generate API Key Script

```typescript
// scripts/generate-key.ts
import { createHash, randomBytes } from 'crypto';
import { db } from '../src/services/db';

const tier = process.argv[2] || 'free';
const name = process.argv[3] || 'Unnamed Key';

const rawKey = `dht_live_${randomBytes(24).toString('base64url')}`;
const keyHash = createHash('sha256').update(rawKey).digest('hex');
const keyPrefix = rawKey.slice(0, 12);

await db.from('api_keys').insert({
  key_hash: keyHash,
  key_prefix: keyPrefix,
  name,
  tier,
});

console.log(`API Key created: ${rawKey}`);
console.log('Save this key - it cannot be retrieved later!');
```

---

*Document Version: 1.0*
