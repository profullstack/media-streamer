#!/usr/bin/env bash
# Import IMDB datasets into Supabase/PostgreSQL
# Usage: ./scripts/import-imdb.sh [--incremental] [DATA_DIR]
#
# Modes:
#   Full (default):        TRUNCATE + reimport everything (first run)
#   --incremental:         Load into temp tables, upsert only new/changed rows
#
# Expects TSV files in DATA_DIR (default: ~/tmp/data)
# Requires DATABASE_URL env var or .env file with it

set -euo pipefail

INCREMENTAL=false
if [ "${1:-}" = "--incremental" ]; then
  INCREMENTAL=true
  shift
fi

DATA_DIR="${1:-$HOME/tmp/data}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load DATABASE_URL from .env if not set
if [ -z "${DATABASE_URL:-}" ]; then
  for envfile in "$PROJECT_DIR/.env.local" "$PROJECT_DIR/.env" "$PROJECT_DIR/.env.production"; do
    if [ -f "$envfile" ]; then
      url=$(grep -E '^DATABASE_URL=' "$envfile" | head -1 | cut -d'=' -f2-)
      if [ -n "$url" ]; then
        DATABASE_URL="$url"
        echo "Loaded DATABASE_URL from $envfile"
        break
      fi
    fi
  done
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set. Set it in env or .env file."
  exit 1
fi

echo "=== IMDB Dataset Import ($([ "$INCREMENTAL" = true ] && echo "INCREMENTAL" || echo "FULL")) ==="
echo "Data directory: $DATA_DIR"
echo ""

# Check all files exist
REQUIRED_FILES=(
  "title.basics.tsv"
  "title.ratings.tsv"
  "title.crew.tsv"
  "title.episode.tsv"
  "title.akas.tsv"
  "title.principals.tsv"
  "name.basics.tsv"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$DATA_DIR/$f" ]; then
    echo "ERROR: Missing $DATA_DIR/$f"
    exit 1
  fi
done

import_full() {
  local table="$1"
  local file="$2"
  local rows
  rows=$(( $(wc -l < "$DATA_DIR/$file") - 1 ))

  echo "[$table] Full import from $file ($rows rows)..."
  psql "$DATABASE_URL" -c "TRUNCATE $table CASCADE;" 2>/dev/null || true
  psql "$DATABASE_URL" -c "\copy $table FROM '$DATA_DIR/$file' WITH (FORMAT csv, DELIMITER E'\t', HEADER true, NULL '\\N', QUOTE E'\b')"
  
  local count
  count=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM $table;" | tr -d ' ')
  echo "  ✓ $table: $count rows"
}

import_incremental() {
  local table="$1"
  local file="$2"
  local pkey="$3"  # primary key column(s) for upsert
  local columns="$4"  # all columns
  
  local tmp_table="_tmp_${table}"
  local rows
  rows=$(( $(wc -l < "$DATA_DIR/$file") - 1 ))

  echo "[$table] Incremental import from $file ($rows rows)..."

  # Create temp table with same structure
  psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS $tmp_table; CREATE TEMP TABLE $tmp_table (LIKE $table INCLUDING ALL);"
  
  # Load into temp table
  psql "$DATABASE_URL" -c "\copy $tmp_table FROM '$DATA_DIR/$file' WITH (FORMAT csv, DELIMITER E'\t', HEADER true, NULL '\\N', QUOTE E'\b')"

  # Build upsert SQL: INSERT ... ON CONFLICT DO UPDATE
  local set_clause=""
  IFS=',' read -ra cols <<< "$columns"
  IFS=',' read -ra pkeys <<< "$pkey"
  for col in "${cols[@]}"; do
    col=$(echo "$col" | xargs)
    # Skip primary key columns in SET clause
    is_pk=false
    for pk in "${pkeys[@]}"; do
      pk=$(echo "$pk" | xargs)
      if [ "$col" = "$pk" ]; then
        is_pk=true
        break
      fi
    done
    if [ "$is_pk" = false ]; then
      [ -n "$set_clause" ] && set_clause="$set_clause, "
      set_clause="${set_clause}${col} = EXCLUDED.${col}"
    fi
  done

  # Count before
  local before
  before=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM $table;" | tr -d ' ')

  # Upsert from temp to real table
  psql "$DATABASE_URL" -c "
    INSERT INTO $table ($columns)
    SELECT $columns FROM $tmp_table
    ON CONFLICT ($pkey) DO UPDATE SET $set_clause;
  "

  # Count after
  local after
  after=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM $table;" | tr -d ' ')
  local new=$(( after - before ))
  
  psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS $tmp_table;"

  echo "  ✓ $table: $after rows total ($new new)"
}

# Table definitions: table_name, file, primary_key, columns
TABLES=(
  "imdb_title_ratings|title.ratings.tsv|tconst|tconst, average_rating, num_votes"
  "imdb_title_crew|title.crew.tsv|tconst|tconst, directors, writers"
  "imdb_title_basics|title.basics.tsv|tconst|tconst, title_type, primary_title, original_title, is_adult, start_year, end_year, runtime_minutes, genres"
  "imdb_title_episode|title.episode.tsv|tconst|tconst, parent_tconst, season_number, episode_number"
  "imdb_name_basics|name.basics.tsv|nconst|nconst, primary_name, birth_year, death_year, primary_profession, known_for_titles"
  "imdb_title_akas|title.akas.tsv|title_id, ordering|title_id, ordering, title, region, language, types, attributes, is_original_title"
  "imdb_title_principals|title.principals.tsv|tconst, ordering|tconst, ordering, nconst, category, job, characters"
)

for entry in "${TABLES[@]}"; do
  IFS='|' read -r table file pkey columns <<< "$entry"
  if [ "$INCREMENTAL" = true ]; then
    import_incremental "$table" "$file" "$pkey" "$columns"
  else
    import_full "$table" "$file"
  fi
  echo ""
done

echo "=== Import Complete ==="
echo ""

# Summary
psql "$DATABASE_URL" -c "
SELECT 
  'imdb_title_basics' as table_name, count(*) as rows FROM imdb_title_basics
UNION ALL SELECT 'imdb_title_ratings', count(*) FROM imdb_title_ratings
UNION ALL SELECT 'imdb_title_crew', count(*) FROM imdb_title_crew
UNION ALL SELECT 'imdb_title_episode', count(*) FROM imdb_title_episode
UNION ALL SELECT 'imdb_name_basics', count(*) FROM imdb_name_basics
UNION ALL SELECT 'imdb_title_akas', count(*) FROM imdb_title_akas
UNION ALL SELECT 'imdb_title_principals', count(*) FROM imdb_title_principals
ORDER BY table_name;
"
