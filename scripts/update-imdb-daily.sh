#!/usr/bin/env bash
# Daily IMDB dataset updater
# Downloads fresh datasets, decompresses, and imports incrementally
# Only new/changed rows are upserted — not a full reimport
#
# First run: ./scripts/import-imdb.sh (full import, no --incremental)
# Daily:     ./scripts/update-imdb-daily.sh (incremental upsert)
#
# crontab (set up by setup-server.sh):
# 0 0 * * * /home/ubuntu/src/media-streamer/scripts/update-imdb-daily.sh >> /var/log/imdb-update.log 2>&1

set -euo pipefail

DATA_DIR="$HOME/tmp/data"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_FILE="/tmp/imdb-update.lock"

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
  pid=$(cat "$LOCK_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Another update is running (pid $pid), skipping"
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting IMDB daily incremental update"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

DATASETS=(
  "name.basics"
  "title.akas"
  "title.basics"
  "title.crew"
  "title.episode"
  "title.principals"
  "title.ratings"
)

# Download all datasets
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Downloading datasets..."
for ds in "${DATASETS[@]}"; do
  echo "  Downloading ${ds}.tsv.gz..."
  curl -sLO "https://datasets.imdbws.com/${ds}.tsv.gz"
done

# Decompress (overwrite existing)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Decompressing..."
for ds in "${DATASETS[@]}"; do
  gunzip -f "${ds}.tsv.gz"
done

# Incremental import (upsert only new/changed rows)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running incremental import..."
"$SCRIPT_DIR/import-imdb.sh" --incremental "$DATA_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] IMDB daily update complete"
