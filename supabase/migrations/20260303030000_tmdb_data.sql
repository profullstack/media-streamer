-- Cache table for TMDB API responses
-- Avoids repeated API calls for the same content
CREATE TABLE IF NOT EXISTS tmdb_data (
  -- Lookup key: either an IMDB ID (tt1234567) or a cleaned title hash
  lookup_key text PRIMARY KEY,
  tmdb_id integer,
  poster_url text,
  backdrop_url text,
  overview text,
  tagline text,
  cast_names text,
  writers text,
  content_rating text,
  -- Track freshness
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for cleanup of stale entries
CREATE INDEX idx_tmdb_data_updated_at ON tmdb_data (updated_at);

-- Allow the app to read/write
ALTER TABLE tmdb_data ENABLE ROW LEVEL SECURITY;

-- Public read/write (no user-scoping needed, this is shared cache)
CREATE POLICY "tmdb_data_public_read" ON tmdb_data FOR SELECT USING (true);
CREATE POLICY "tmdb_data_service_write" ON tmdb_data FOR ALL USING (true);

COMMENT ON TABLE tmdb_data IS 'Cache for TMDB API responses to reduce API calls. Entries keyed by IMDB ID or title hash.';
COMMENT ON COLUMN tmdb_data.lookup_key IS 'IMDB ID (e.g. tt1234567) or sha256 of cleaned title for non-IMDB lookups';
