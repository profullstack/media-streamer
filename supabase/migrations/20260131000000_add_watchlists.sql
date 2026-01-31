-- ============================================
-- USER WATCHLISTS TABLE
-- ============================================
-- Stores named watchlists for users. Each user gets a default
-- watchlist auto-created on first visit.
CREATE TABLE user_watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'My Watchlist',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_watchlists_user_id ON user_watchlists(user_id);
CREATE INDEX idx_user_watchlists_updated_at ON user_watchlists(user_id, updated_at DESC);

-- ============================================
-- WATCHLIST ITEMS TABLE
-- ============================================
-- Stores TMDB movie/TV items that users add to their watchlists.
-- Unlike collection_items (which reference torrent file_id), these
-- store denormalized TMDB metadata directly.
CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID REFERENCES user_watchlists(id) ON DELETE CASCADE NOT NULL,
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    title TEXT NOT NULL,
    poster_path TEXT,
    overview TEXT,
    release_date TEXT,
    vote_average NUMERIC(3,1),
    genres TEXT[],
    cast_names TEXT[],
    directors TEXT[],
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(watchlist_id, tmdb_id, media_type)
);

CREATE INDEX idx_watchlist_items_watchlist_id ON watchlist_items(watchlist_id);
CREATE INDEX idx_watchlist_items_tmdb_id ON watchlist_items(tmdb_id, media_type);
CREATE INDEX idx_watchlist_items_position ON watchlist_items(watchlist_id, position ASC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watchlists"
    ON user_watchlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watchlists"
    ON user_watchlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlists"
    ON user_watchlists FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlists"
    ON user_watchlists FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all watchlists"
    ON user_watchlists FOR ALL
    USING (auth.role() = 'service_role');

ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watchlist items"
    ON watchlist_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_watchlists
            WHERE user_watchlists.id = watchlist_items.watchlist_id
            AND user_watchlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert into their own watchlists"
    ON watchlist_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_watchlists
            WHERE user_watchlists.id = watchlist_items.watchlist_id
            AND user_watchlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete from their own watchlists"
    ON watchlist_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_watchlists
            WHERE user_watchlists.id = watchlist_items.watchlist_id
            AND user_watchlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all watchlist items"
    ON watchlist_items FOR ALL
    USING (auth.role() = 'service_role');
