#!/usr/bin/env bash
# Daily IMDB dataset update — download, decompress, and import
# Designed to be run via cron at midnight
# Usage: ./scripts/update-imdb.sh
#
# Cron entry (add via: crontab -e):
#   0 0 * * * /home/ubuntu/src/media-streamer/scripts/update-imdb.sh >> /var/log/imdb-update.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$HOME/tmp/data"
LOCK_FILE="/tmp/imdb-update.lock"

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
  pid=$(cat "$LOCK_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] Another update is running (PID $pid), skipping."
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] === Starting IMDB daily update ==="

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
echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] Downloading datasets..."
for ds in "${DATASETS[@]}"; do
  echo "  Downloading ${ds}.tsv.gz..."
  curl -sLo "${ds}.tsv.gz.new" "https://datasets.imdbws.com/${ds}.tsv.gz"
  
  # Check if file actually changed (compare sizes as quick check)
  if [ -f "${ds}.tsv.gz" ]; then
    old_size=$(stat -c%s "${ds}.tsv.gz" 2>/dev/null || echo 0)
    new_size=$(stat -c%s "${ds}.tsv.gz.new" 2>/dev/null || echo 0)
    if [ "$old_size" = "$new_size" ]; then
      echo "  ${ds}: unchanged (same size: ${new_size}), skipping decompress"
      rm -f "${ds}.tsv.gz.new"
      continue
    fi
  fi
  
  mv "${ds}.tsv.gz.new" "${ds}.tsv.gz"
  echo "  Decompressing ${ds}.tsv.gz..."
  gunzip -f -k "${ds}.tsv.gz"
done

echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] Download complete."

# Run import
echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] Running import..."
"$SCRIPT_DIR/import-imdb.sh" "$DATA_DIR"

echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] === IMDB daily update complete ==="
