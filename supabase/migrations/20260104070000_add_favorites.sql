-- Favorites Tables Migration
-- Adds support for favoriting torrents and IPTV channels

-- ============================================
-- TORRENT FAVORITES TABLE
-- ============================================
-- Allows users to favorite entire torrents (not just files)
CREATE TABLE torrent_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    torrent_id UUID REFERENCES torrents(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, torrent_id)
);

-- Indexes for torrent_favorites
CREATE INDEX idx_torrent_favorites_user_id ON torrent_favorites(user_id);
CREATE INDEX idx_torrent_favorites_torrent_id ON torrent_favorites(torrent_id);
CREATE INDEX idx_torrent_favorites_created_at ON torrent_favorites(user_id, created_at DESC);

-- ============================================
-- IPTV CHANNEL FAVORITES TABLE
-- ============================================
-- Stores favorited IPTV channels with their data to avoid re-fetching M3U
CREATE TABLE iptv_channel_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    playlist_id UUID REFERENCES iptv_playlists(id) ON DELETE CASCADE NOT NULL,
    -- Channel data (stored to avoid re-fetching M3U)
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    channel_url TEXT NOT NULL,
    channel_logo TEXT,
    channel_group TEXT,
    tvg_id TEXT,
    tvg_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Unique per user, playlist, and channel
    UNIQUE(user_id, playlist_id, channel_id)
);

-- Indexes for iptv_channel_favorites
CREATE INDEX idx_iptv_channel_favorites_user_id ON iptv_channel_favorites(user_id);
CREATE INDEX idx_iptv_channel_favorites_playlist_id ON iptv_channel_favorites(playlist_id);
CREATE INDEX idx_iptv_channel_favorites_created_at ON iptv_channel_favorites(user_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on torrent_favorites
ALTER TABLE torrent_favorites ENABLE ROW LEVEL SECURITY;

-- Users can view their own torrent favorites
CREATE POLICY "Users can view their own torrent favorites"
    ON torrent_favorites FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own torrent favorites
CREATE POLICY "Users can insert their own torrent favorites"
    ON torrent_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own torrent favorites
CREATE POLICY "Users can delete their own torrent favorites"
    ON torrent_favorites FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all torrent favorites
CREATE POLICY "Service role can manage torrent favorites"
    ON torrent_favorites FOR ALL
    USING (auth.role() = 'service_role');

-- Enable RLS on iptv_channel_favorites
ALTER TABLE iptv_channel_favorites ENABLE ROW LEVEL SECURITY;

-- Users can view their own IPTV channel favorites
CREATE POLICY "Users can view their own IPTV channel favorites"
    ON iptv_channel_favorites FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own IPTV channel favorites
CREATE POLICY "Users can insert their own IPTV channel favorites"
    ON iptv_channel_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own IPTV channel favorites
CREATE POLICY "Users can delete their own IPTV channel favorites"
    ON iptv_channel_favorites FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all IPTV channel favorites
CREATE POLICY "Service role can manage IPTV channel favorites"
    ON iptv_channel_favorites FOR ALL
    USING (auth.role() = 'service_role');
