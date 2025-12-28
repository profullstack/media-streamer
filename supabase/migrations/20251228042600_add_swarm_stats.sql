-- ============================================================================
-- Add Swarm Statistics (Seeders/Leechers) to Torrents Table
-- ============================================================================
-- This migration adds columns to track torrent swarm statistics:
-- - seeders: Number of peers with complete copies
-- - leechers: Number of peers downloading
-- - swarm_updated_at: When the swarm stats were last updated
-- ============================================================================

-- Add seeders column (nullable, null means unknown)
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS seeders INTEGER;

-- Add leechers column (nullable, null means unknown)
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS leechers INTEGER;

-- Add timestamp for when swarm stats were last updated
ALTER TABLE torrents ADD COLUMN IF NOT EXISTS swarm_updated_at TIMESTAMPTZ;

-- Add index for sorting by seeders (popular torrents)
CREATE INDEX IF NOT EXISTS idx_torrents_seeders ON torrents(seeders DESC NULLS LAST);

-- Add comment explaining the columns
COMMENT ON COLUMN torrents.seeders IS 'Number of peers with complete copies of the torrent (from tracker scrape)';
COMMENT ON COLUMN torrents.leechers IS 'Number of peers currently downloading the torrent (from tracker scrape)';
COMMENT ON COLUMN torrents.swarm_updated_at IS 'Timestamp when seeders/leechers were last updated from trackers';
