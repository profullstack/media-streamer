# BitTorrented.com Dockerfile
# Multi-stage build for production deployment

# Stage 1: Dependencies
FROM node:25-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:25-alpine AS builder
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
FROM node:25-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install FFmpeg for video/audio transcoding, and build tools for reliq/torge
RUN apk add --no-cache ffmpeg git curl make gcc musl-dev bash jq

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
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
