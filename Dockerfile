# BitTorrented.com Dockerfile
# Multi-stage build for production deployment

# Stage 0: librespot (Spotify Connect receiver for /spotify)
# No prebuilt binaries exist, and device pairing (--enable-device-auth) is not
# in the 0.8.0 tag, so this builds a pinned commit from git. rustls keeps the
# musl build free of OpenSSL; the pipe/subprocess audio backends need no
# system audio libraries. The droplet deploy does not use this image; it
# installs the same binary from the `librespot-<rev>` release asset (see
# scripts/setup-server.sh), which is produced by this stage.
FROM rust:1-alpine AS librespot
RUN apk add --no-cache musl-dev
ARG LIBRESPOT_REV=a1b66d3c8a14e55a9572a9e17467150dca618c9a
RUN cargo install --git https://github.com/librespot-org/librespot --rev ${LIBRESPOT_REV} \
    --no-default-features --features rustls-tls-webpki-roots --root /out librespot

# Stage 1: Dependencies
FROM node:26-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:26-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN pnpm build

# Stage 3: Runner
FROM node:26-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install FFmpeg for video/audio transcoding, and build tools for reliq/torge
RUN apk add --no-cache ffmpeg git curl make gcc musl-dev bash jq

# librespot: Spotify Connect receiver spawned per user by src/lib/spotify
COPY --from=librespot /out/bin/librespot /usr/local/bin/librespot

# Install reliq (HTML parsing library - must be installed before torge)
RUN git clone https://github.com/TUVIMEN/reliq.git /tmp/reliq && \
    cd /tmp/reliq && \
    make && \
    make install && \
    rm -rf /tmp/reliq

# Install torge (shell script tool for torrent searching)
RUN git clone https://github.com/TUVIMEN/torge.git /tmp/torge && \
    cp /tmp/torge/torge /usr/local/bin/torge && \
    chmod +x /usr/local/bin/torge && \
    rm -rf /tmp/torge

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Limit Node.js heap to 2GB to prevent unbounded memory growth
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy bin directory for torge-all.sh script
COPY --from=builder --chown=nextjs:nodejs /app/bin ./bin
RUN chmod +x ./bin/*.sh

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
# Reads $PORT rather than hardcoding 3000: Railway injects its own port, and a
# healthcheck pinned to 3000 reports a healthy container as unhealthy (or worse,
# probes a port nothing is listening on while the app is fine).
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:${PORT:-3000}/api/health" || exit 1

# Start the application
CMD ["node", "server.js"]
