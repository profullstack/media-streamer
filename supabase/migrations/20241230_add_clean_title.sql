-- Add clean_title column to torrents table
-- This stores a cleaned version of the torrent name for display purposes

ALTER TABLE torrents ADD COLUMN IF NOT EXISTS clean_title TEXT;

-- Create index for searching by clean_title
CREATE INDEX IF NOT EXISTS idx_torrents_clean_title ON torrents (clean_title);

-- Add comment explaining the column
COMMENT ON COLUMN torrents.clean_title IS 'Cleaned torrent name for display (removes quality indicators, release groups, etc.)';
