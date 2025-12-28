-- Migration: Add torrent_folders table for folder-level metadata
-- This table stores cover art URLs for individual album folders within
-- discography/multi-album torrents.

-- Create the torrent_folders table
CREATE TABLE IF NOT EXISTS torrent_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torrent_id UUID NOT NULL REFERENCES torrents(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  year INTEGER,
  cover_url TEXT,
  external_id TEXT,
  external_source TEXT,
  metadata_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique folder paths per torrent
  UNIQUE(torrent_id, path)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_torrent_folders_torrent_id ON torrent_folders(torrent_id);
CREATE INDEX IF NOT EXISTS idx_torrent_folders_path ON torrent_folders(path);
CREATE INDEX IF NOT EXISTS idx_torrent_folders_artist_album ON torrent_folders(artist, album);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_torrent_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER torrent_folders_updated_at
  BEFORE UPDATE ON torrent_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_torrent_folders_updated_at();

-- Add comment for documentation
COMMENT ON TABLE torrent_folders IS 'Stores folder-level metadata for discographies and multi-album torrents';
COMMENT ON COLUMN torrent_folders.path IS 'Relative path to the folder within the torrent';
COMMENT ON COLUMN torrent_folders.cover_url IS 'URL to album cover art from Cover Art Archive';
COMMENT ON COLUMN torrent_folders.external_id IS 'MusicBrainz release-group ID';
