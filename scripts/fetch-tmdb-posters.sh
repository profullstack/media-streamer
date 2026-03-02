#!/bin/bash
# Fetch TMDB poster URLs for dht_imdb_matches that don't have one yet.
# Uses TMDB /find/{imdb_id} endpoint. Rate limit: ~40 req/s.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../.env" 2>/dev/null || true

DB_URL="${DATABASE_URL:?DATABASE_URL not set}"
TMDB_KEY="${TMDB_API_KEY:?TMDB_API_KEY not set}"
BATCH=500

echo "[$(date -u +%H:%M:%S)] Fetching IMDB IDs without posters..."
TCONSTS=$(psql "$DB_URL" -t -A -c "
  SELECT DISTINCT tconst FROM dht_imdb_matches
  WHERE poster_url IS NULL
  LIMIT $BATCH;
")

COUNT=$(echo "$TCONSTS" | grep -c '^tt' || true)
echo "[$(date -u +%H:%M:%S)] Processing $COUNT IMDB IDs..."

UPDATED=0
for tconst in $TCONSTS; do
  [ -z "$tconst" ] && continue
  RESP=$(curl -sf "https://api.themoviedb.org/3/find/${tconst}?api_key=${TMDB_KEY}&external_source=imdb_id" 2>/dev/null || echo '{}')
  POSTER=$(echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
m = (d.get('movie_results') or [None])[0] or (d.get('tv_results') or [None])[0]
print(f'https://image.tmdb.org/t/p/w500{m[\"poster_path\"]}' if m and m.get('poster_path') else '')
" 2>/dev/null || echo '')

  if [ -n "$POSTER" ]; then
    psql "$DB_URL" -q -c "UPDATE dht_imdb_matches SET poster_url = '${POSTER}' WHERE tconst = '${tconst}' AND poster_url IS NULL;"
    UPDATED=$((UPDATED + 1))
  else
    # Mark as checked (empty string = no poster available)
    psql "$DB_URL" -q -c "UPDATE dht_imdb_matches SET poster_url = '' WHERE tconst = '${tconst}' AND poster_url IS NULL;"
  fi

  # Respect TMDB rate limit (~40/s, so ~25ms between)
  sleep 0.03
done

echo "[$(date -u +%H:%M:%S)] Updated $UPDATED poster URLs"
