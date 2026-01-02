-- IPTV Playlists Table
-- Stores user's IPTV playlist configurations (M3U URLs, EPG URLs)

-- ============================================
-- IPTV PLAYLISTS TABLE
-- ============================================
CREATE TABLE iptv_playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    m3u_url TEXT NOT NULL,
    epg_url TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for iptv_playlists
CREATE INDEX idx_iptv_playlists_user_id ON iptv_playlists(user_id);
CREATE INDEX idx_iptv_playlists_user_active ON iptv_playlists(user_id, is_active);

-- Trigger for updated_at
CREATE TRIGGER update_iptv_playlists_updated_at
    BEFORE UPDATE ON iptv_playlists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE iptv_playlists ENABLE ROW LEVEL SECURITY;

-- Users can view their own playlists
CREATE POLICY "Users can view their own IPTV playlists"
    ON iptv_playlists FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own playlists
CREATE POLICY "Users can insert their own IPTV playlists"
    ON iptv_playlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own playlists
CREATE POLICY "Users can update their own IPTV playlists"
    ON iptv_playlists FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own playlists
CREATE POLICY "Users can delete their own IPTV playlists"
    ON iptv_playlists FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all playlists (for server-side operations)
CREATE POLICY "Service role can manage IPTV playlists"
    ON iptv_playlists FOR ALL
    USING (auth.role() = 'service_role');
