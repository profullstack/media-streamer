-- Add genre column to torrents table
-- This stores genre metadata from OMDb API for movies and TV shows

-- Genre column (comma-separated string, e.g., "Action, Sci-Fi, Thriller")
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS genre TEXT;

-- Add comment for documentation
COMMENT ON COLUMN torrents.genre IS 'Genre(s) of the movie or TV show (comma-separated, from OMDb)';
