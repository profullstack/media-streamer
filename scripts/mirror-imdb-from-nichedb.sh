#!/usr/bin/env bash
# Nightly imdb_* refresh from nichedb.dev, in place of the IMDb dump download.
#
# Runs scripts/mirror-imdb-from-nichedb.ts (pnpm mirror:imdb) with a lock so two
# cron runs never overlap. One run walks at most NICHEDB_MIRROR_MAX_PAGES pages
# (default 480, ~56 minutes at 7 s a page) and stores its cursor, so the first
# backfill spreads over a few nights unless kicked off by hand with
#   pnpm mirror:imdb -- --all
#
# crontab (set up by setup-server.sh when NICHEDB_MIRROR=1):
# 0 0 * * * /home/ubuntu/src/media-streamer/scripts/mirror-imdb-from-nichedb.sh >> /var/log/imdb-update.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCK_FILE="/tmp/imdb-update.lock"

if [ -f "$LOCK_FILE" ]; then
  pid=$(cat "$LOCK_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Another IMDb update is running (pid $pid), skipping"
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# cron's PATH has no pnpm; pick up the user's toolchain.
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"

cd "$PROJECT_DIR"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting nichedb -> imdb_* mirror"
pnpm mirror:imdb "$@"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] nichedb mirror finished"
