# BitTorrented

A comprehensive multi-media streaming platform that allows users to stream music, movies, books, and live TV from torrents and IPTV sources - without downloading content until playback.

## Features

### Torrent Streaming
- 🎵 **Music Streaming** - Stream FLAC, MP3, OGG, and more with full player controls
- 🎬 **Video Streaming** - Watch videos with seeking, fullscreen, and picture-in-picture
- 📚 **Ebook Reader** - Read PDFs and EPUBs with progress tracking
- 🔍 **Deep Search** - Search across file names, paths, and metadata
- ⬇️ **Download** - Download individual files or entire torrents
- 🎙️ **Podcasts** - Browse and stream podcasts with episode tracking

### IPTV Support
- 📺 **Live TV** - Stream from M3U playlists and Xtream Codes providers
- 📋 **EPG Guide** - Electronic Program Guide for live channels
- 🔄 **Multiple Providers** - Manage multiple IPTV sources
- 🔐 **IPTV Subscriptions** - Premium IPTV access with subscription management

### Personal Library
- ❤️ **Favorites** - Save your favorite files for quick access
- 📁 **Collections** - Create custom playlists and watchlists
- 📜 **Watch History** - Track your viewing and reading progress
- 🔄 **Progress Sync** - Resume where you left off across devices

### Social Features
- 🎉 **Watch Parties** - Synchronized viewing with friends
- 💬 **Real-time Chat** - Chat while watching together

### Premium Features
- 💳 **Crypto Payments** - Pay with cryptocurrency via CoinPayPortal
- 👨‍👩‍👧‍👦 **Family Plans** - Share with up to 10 family members
- 📺 **IPTV Add-on** - Premium live TV subscription

### Platform
- 📱 **PWA Support** - Install as a native app on mobile and desktop
- 🌙 **Dark Mode** - Premium dark-mode-first design
- 🔒 **Server-side Security** - All sensitive operations server-side only
- ⚡ **Server-Side Rendering** - Fast page loads with pre-fetched data

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Server-side only)
- **Database**: Supabase (PostgreSQL with Full-Text Search)
- **Torrent**: WebTorrent (metadata-only fetching)
- **Video**: Video.js with HLS.js for M3U8 streaming
- **Payments**: CoinPayPortal (cryptocurrency)
- **Testing**: Vitest with TDD approach
- **Deployment**: DigitalOcean Droplet (with UDP support for DHT)

## Prerequisites

- Node.js v24+
- pnpm v9+
- Supabase account

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/bittorrented.git
cd bittorrented
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Metadata APIs
THETVDB_API_KEY=your-thetvdb-key
OMDB_API_KEY=your-omdb-key

# CoinPayPortal (for payments)
COINPAYPORTAL_MERCHANT_ID=your-merchant-id
COINPAYPORTAL_API_KEY=your-api-key
```

### 4. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |

## Project Structure

```
bittorrented/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes (server-side only)
│   │   │   ├── library/        # Library API (favorites, collections, history)
│   │   │   ├── iptv/           # IPTV API (channels, playlists, subscriptions)
│   │   │   ├── auth/           # Authentication API
│   │   │   ├── payments/       # Payment processing API
│   │   │   └── stream/         # Streaming API
│   │   ├── library/            # My Library page (server-rendered)
│   │   ├── live-tv/            # Live TV page
│   │   ├── podcasts/           # Podcasts page
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Home page
│   ├── components/             # React components
│   │   ├── layout/             # Layout components (sidebar, header)
│   │   ├── torrents/           # Torrent-related components
│   │   ├── live-tv/            # Live TV components (HLS player)
│   │   ├── media/              # Media player components
│   │   └── ui/                 # UI primitives
│   ├── lib/                    # Utility functions and services
│   │   ├── supabase/           # Supabase client (server-side only)
│   │   ├── library/            # Library repository (favorites, collections, history)
│   │   ├── iptv/               # IPTV services (M3U parser, playlist cache)
│   │   ├── iptv-proxy/         # IPTV proxy for HLS rewriting
│   │   ├── podcasts/           # Podcast services
│   │   ├── torrent/            # Torrent services
│   │   ├── streaming/          # Streaming services
│   │   ├── magnet/             # Magnet URL parsing
│   │   ├── payments/           # Payment processing
│   │   └── indexer/            # File indexing
│   ├── hooks/                  # React hooks
│   └── types/                  # TypeScript types
├── public/                     # Static assets
├── supabase/                   # Supabase migrations
└── plans/                      # Implementation plans
```

## Testing

This project follows Test-Driven Development (TDD). Tests are written first, then implementation.

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run

# Run tests with coverage
pnpm test:coverage
```

## Deployment

### DigitalOcean Droplet (Recommended)

We use a DigitalOcean Droplet instead of App Platform because **App Platform doesn't support UDP**, which is required for DHT (Distributed Hash Table) peer discovery in BitTorrent.

**Quick Start:**

```bash
# 1. SSH into your Droplet
ssh root@YOUR_DROPLET_IP

# 2. Run the setup script
curl -fsSL https://raw.githubusercontent.com/profullstack/music-torrent/main/scripts/setup-droplet.sh | bash

# 3. Setup SSL
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**What the setup script does:**
- Installs Node.js 22, pnpm, FFmpeg, Nginx
- Clones the repository
- Creates a systemd service for auto-restart
- Configures Nginx as reverse proxy

**GitHub Actions auto-deploy:**
- Push to `main` branch triggers automatic deployment
- Required GitHub Secrets:
  - `DROPLET_HOST` - Droplet IP address or hostname
  - `DROPLET_USER` - SSH username (e.g., `ubuntu`)
  - `DROPLET_SSH_KEY` - Private SSH key for authentication
  - `ENV_FILE` - Contents of `.env` file for production
- Optional GitHub Secrets:
  - `DROPLET_PORT` - SSH port (defaults to `22` if not set)

See [docs/deployment-droplet.md](docs/deployment-droplet.md) for detailed instructions.

## Security

- **All Supabase calls are server-side only** - No client-side database access
- **Rate limiting** - Prevents abuse of magnet ingestion and streaming
- **Input validation** - All user inputs are validated
- **No content storage** - Only metadata is stored, content is streamed on-demand
- **Webhook verification** - Payment webhooks are cryptographically verified

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests first (TDD)
4. Implement the feature
5. Ensure all tests pass
6. Submit a pull request

## License

MIT
