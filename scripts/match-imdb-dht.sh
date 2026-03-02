#!/usr/bin/env bash
# Match DHT torrents to IMDB titles by parsed name + year
# Designed for cron — runs after update-imdb-daily.sh
# Processes unmatched torrents in small batches to avoid statement timeouts
#
# crontab: 30 1 * * * /home/ubuntu/src/media-streamer/scripts/match-imdb-dht.sh >> /var/log/imdb-match.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BATCH_SIZE=50000
MAX_BATCHES=200

# Load DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  for envfile in "$PROJECT_DIR/.env.local" "$PROJECT_DIR/.env" "$PROJECT_DIR/.env.production"; do
    if [ -f "$envfile" ]; then
      url=$(grep -E '^DATABASE_URL=' "$envfile" | head -1 | cut -d'=' -f2-)
      if [ -n "$url" ]; then
        DATABASE_URL="$url"
        break
      fi
    fi
  done
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set"
  exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting IMDB-DHT matching"

# Ensure table exists
psql "$DATABASE_URL" -c "
CREATE TABLE IF NOT EXISTS dht_imdb_matches (
  info_hash bytea NOT NULL PRIMARY KEY,
  tconst text NOT NULL,
  match_method text NOT NULL DEFAULT 'title_year',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dht_imdb_tconst ON dht_imdb_matches(tconst);
" 2>/dev/null

before=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM dht_imdb_matches;" | tr -d ' ')
echo "  Existing matches: $before"

batch=0
new_total=0
while [ $batch -lt $MAX_BATCHES ]; do
  inserted=$(psql "$DATABASE_URL" -t << SQL
WITH batch AS (
  SELECT t.info_hash, t.name
  FROM torrents t
  LEFT JOIN dht_imdb_matches m ON m.info_hash = t.info_hash
  WHERE m.info_hash IS NULL
    AND t.name ~ '[.\s(]((?:19|20)\d{2})[.\s)]'
  LIMIT $BATCH_SIZE
),
parsed AS (
  SELECT
    b.info_hash,
    (regexp_match(b.name, '[.\s(]*((?:19|20)\d{2})[.\s)]+'))[1]::int AS yr,
    lower(trim(regexp_replace(
      split_part(b.name, (regexp_match(b.name, '[.\s(]*((?:19|20)\d{2})[.\s)]+'))[1], 1),
      '[._]', ' ', 'g'
    ))) AS title
  FROM batch b
),
ins AS (
  INSERT INTO dht_imdb_matches (info_hash, tconst, match_method)
  SELECT DISTINCT ON (p.info_hash) p.info_hash, ib.tconst, 'title_year'
  FROM parsed p
  JOIN imdb_title_basics ib
    ON lower(ib.primary_title) = p.title
    AND ib.start_year::int = p.yr
    AND ib.title_type IN ('movie', 'tvSeries', 'tvMiniSeries', 'tvMovie')
  WHERE length(p.title) > 2
  ON CONFLICT (info_hash) DO NOTHING
  RETURNING 1
)
SELECT count(*) FROM ins;
SQL
  )
  inserted=$(echo "$inserted" | tr -d ' ')
  
  # Check if there are more unmatched torrents
  remaining=$(psql "$DATABASE_URL" -t -c "
    SELECT count(*) FROM (
      SELECT 1 FROM torrents t
      LEFT JOIN dht_imdb_matches m ON m.info_hash = t.info_hash
      WHERE m.info_hash IS NULL
        AND t.name ~ '[.\s(]((?:19|20)\d{2})[.\s)]'
      LIMIT 1
    ) x;
  " | tr -d ' ')

  batch=$((batch + 1))
  new_total=$((new_total + inserted))
  echo "  Batch $batch: +$inserted matches (remaining: $remaining)"

  if [ "$remaining" = "0" ]; then
    break
  fi
done

after=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM dht_imdb_matches;" | tr -d ' ')
echo "  Total matches: $after (+$((after - before)) new)"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] IMDB-DHT matching complete"
