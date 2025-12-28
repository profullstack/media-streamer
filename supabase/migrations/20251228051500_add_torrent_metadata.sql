-- Add external metadata fields to torrents table
-- This allows storing poster URLs, cover art, and other enrichment data

-- Add metadata columns to torrents table
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) CHECK (content_type IN ('movie', 'tvshow', 'music', 'book', 'other'));
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS external_source VARCHAR(50);
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS metadata_fetched_at TIMESTAMPTZ;

-- Index for content type filtering
CREATE INDEX IF NOT EXISTS idx_torrents_content_type ON torrents(content_type);

-- Index for year filtering
CREATE INDEX IF NOT EXISTS idx_torrents_year ON torrents(year);

-- Comment on columns
COMMENT ON COLUMN torrents.poster_url IS 'URL to movie/TV show poster image';
COMMENT ON COLUMN torrents.cover_url IS 'URL to album/book cover image';
COMMENT ON COLUMN torrents.content_type IS 'Type of content: movie, tvshow, music, book, other';
COMMENT ON COLUMN torrents.external_id IS 'ID from external metadata source (IMDB, MusicBrainz, etc.)';
COMMENT ON COLUMN torrents.external_source IS 'Source of external metadata (omdb, thetvdb, musicbrainz, openlibrary)';
COMMENT ON COLUMN torrents.year IS 'Release year of the content';
COMMENT ON COLUMN torrents.description IS 'Description or overview of the content';
COMMENT ON COLUMN torrents.metadata_fetched_at IS 'Timestamp when external metadata was last fetched';
