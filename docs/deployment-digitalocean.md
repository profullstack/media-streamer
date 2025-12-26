# DigitalOcean Deployment Guide

This guide covers deploying BitTorrented.com to DigitalOcean App Platform.

## Prerequisites

1. DigitalOcean account
2. GitHub repository with the code

## Setup Steps

### 1. Create App Platform Application

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Select "GitHub" as the source
4. Authorize DigitalOcean to access your repository
5. Select the `music-torrent` repository
6. Choose the `main` branch
7. Select "Dockerfile" as the build method (auto-detected)

### 2. Configure Environment Variables

In the App Platform setup wizard, add these environment variables:

| Variable | Type | Description |
|----------|------|-------------|
| `NODE_ENV` | Plain | `production` |
| `NEXT_TELEMETRY_DISABLED` | Plain | `1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Secret | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Secret | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Supabase service role key |
| `COINPAY_API_KEY` | Secret | CoinPayPortal API key |
| `COINPAY_WEBHOOK_SECRET` | Secret | CoinPayPortal webhook secret |

### 3. Configure Resources

Recommended settings:
- **Instance Size**: Professional XS (1 GB RAM, 1 vCPU) for production
- **Instance Count**: 1 (scale as needed)
- **HTTP Port**: 3000 (auto-detected from Dockerfile)

### 4. Configure Domain

1. After app creation, go to Settings → Domains
2. Add `bittorrented.com` as primary domain
3. Add `www.bittorrented.com` as alias
4. Update DNS records at your registrar:

```
Type: A
Name: @
Value: <App Platform IP from dashboard>

Type: CNAME
Name: www
Value: <your-app>.ondigitalocean.app
```

### 5. Enable Auto-Deploy

Auto-deploy is enabled by default. Every push to `main` will trigger a new deployment.

## CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push:

1. **Lint & Type Check** - ESLint and TypeScript validation
2. **Tests** - Vitest test suite (979 tests)
3. **Build** - Next.js production build verification
4. **Security Audit** - pnpm audit for vulnerabilities

**Note**: Deployment is handled automatically by DigitalOcean App Platform when you push to `main`. The CI pipeline ensures code quality before deployment.

## Health Check

The app exposes `/api/health` endpoint. Configure in App Platform:
- **Path**: `/api/health`
- **Initial Delay**: 10 seconds
- **Period**: 30 seconds
- **Timeout**: 10 seconds

## Monitoring

### View Logs

In DigitalOcean dashboard:
1. Go to your app
2. Click "Runtime Logs" tab

Or via CLI:
```bash
doctl apps logs <app-id> --type=run
```

### Alerts

Configure alerts in App Platform for:
- Deployment failures
- Domain configuration issues
- High CPU/memory usage

## Scaling

To scale the application:

1. Go to App Settings → Resources
2. Adjust instance count or size

Available instance sizes:
- `basic-xxs` - 512 MB RAM, 1 vCPU ($5/mo)
- `basic-xs` - 1 GB RAM, 1 vCPU ($10/mo)
- `basic-s` - 2 GB RAM, 1 vCPU ($20/mo)
- `professional-xs` - 1 GB RAM, 1 vCPU (dedicated, $12/mo)
- `professional-s` - 2 GB RAM, 1 vCPU (dedicated, $25/mo)

## Troubleshooting

### Build Failures

1. Check build logs in DigitalOcean dashboard
2. Ensure all environment variables are set
3. Verify Dockerfile syntax

### Deployment Failures

1. Check deployment logs
2. Verify health check endpoint is responding
3. Check for port configuration issues (should be 3000)

### App Not Starting

1. Check runtime logs for errors
2. Verify environment variables are correct
3. Ensure Supabase credentials are valid

## Local Docker Testing

Test the Docker build locally before deploying:

```bash
# Build the image
docker build -t bittorrented:local .

# Run with environment variables
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_SUPABASE_URL=your-url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key \
  bittorrented:local

# Test health endpoint
curl http://localhost:3000/api/health
```
