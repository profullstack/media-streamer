-- Add external_id and external_source columns to bt_torrent_folders
-- These columns store MusicBrainz or other external metadata references for folder-level album enrichment

ALTER TABLE bt_torrent_folders
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source VARCHAR(50);

-- Add index for faster lookups by external_id
CREATE INDEX IF NOT EXISTS idx_bt_torrent_folders_external_id ON bt_torrent_folders(external_id) WHERE external_id IS NOT NULL;
