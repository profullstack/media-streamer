-- Add director and actors columns to torrents table
-- These store metadata from OMDb API for movies and TV shows

-- Director column (single string, e.g., "Christopher Nolan")
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS director TEXT;

-- Actors column (comma-separated string, e.g., "Leonardo DiCaprio, Joseph Gordon-Levitt")
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS actors TEXT;

-- Add comments for documentation
COMMENT ON COLUMN torrents.director IS 'Director of the movie or TV show (from OMDb)';
COMMENT ON COLUMN torrents.actors IS 'Main actors/cast of the movie or TV show (comma-separated, from OMDb)';
