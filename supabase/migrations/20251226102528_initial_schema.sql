-- Media Torrent Platform - Initial Schema
-- This migration creates all tables for the multi-media torrent streaming platform

-- Note: gen_random_uuid() is built into PostgreSQL 13+ and doesn't require extensions

-- ============================================
-- TORRENTS TABLE
-- ============================================
CREATE TABLE torrents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    infohash VARCHAR(40) UNIQUE NOT NULL,
    magnet_uri TEXT NOT NULL,
    name TEXT NOT NULL,
    total_size BIGINT NOT NULL,
    file_count INTEGER NOT NULL,
    piece_length INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast infohash lookups
CREATE INDEX idx_torrents_infohash ON torrents(infohash);
CREATE INDEX idx_torrents_created_at ON torrents(created_at DESC);

-- ============================================
-- TORRENT FILES TABLE
-- ============================================
CREATE TABLE torrent_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torrent_id UUID REFERENCES torrents(id) ON DELETE CASCADE NOT NULL,
    file_index INTEGER NOT NULL,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    extension VARCHAR(20),
    size BIGINT NOT NULL,
    piece_start INTEGER NOT NULL,
    piece_end INTEGER NOT NULL,
    -- Media categorization
    media_category VARCHAR(20) CHECK (media_category IN ('audio', 'video', 'ebook', 'document', 'other')),
    mime_type VARCHAR(100),
    -- Full-text search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(path, '')), 'B')
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(torrent_id, file_index)
);

-- Indexes for torrent_files
CREATE INDEX idx_torrent_files_torrent_id ON torrent_files(torrent_id);
CREATE INDEX idx_torrent_files_search ON torrent_files USING GIN(search_vector);
CREATE INDEX idx_torrent_files_category ON torrent_files(media_category);
CREATE INDEX idx_torrent_files_extension ON torrent_files(extension);

-- ============================================
-- AUDIO METADATA TABLE
-- ============================================
CREATE TABLE audio_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE UNIQUE NOT NULL,
    artist TEXT,
    album TEXT,
    title TEXT,
    track_number INTEGER,
    duration_seconds INTEGER,
    bitrate INTEGER,
    sample_rate INTEGER,
    genre TEXT,
    year INTEGER,
    -- Full-text search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(artist, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(album, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(genre, '')), 'C')
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audio metadata search
CREATE INDEX idx_audio_metadata_search ON audio_metadata USING GIN(search_vector);
CREATE INDEX idx_audio_metadata_file_id ON audio_metadata(file_id);

-- ============================================
-- VIDEO METADATA TABLE
-- ============================================
CREATE TABLE video_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE UNIQUE NOT NULL,
    title TEXT,
    duration_seconds INTEGER,
    width INTEGER,
    height INTEGER,
    codec VARCHAR(50),
    bitrate INTEGER,
    framerate DECIMAL(5,2),
    -- Full-text search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A')
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for video metadata search
CREATE INDEX idx_video_metadata_search ON video_metadata USING GIN(search_vector);
CREATE INDEX idx_video_metadata_file_id ON video_metadata(file_id);

-- ============================================
-- EBOOK METADATA TABLE
-- ============================================
CREATE TABLE ebook_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE UNIQUE NOT NULL,
    title TEXT,
    author TEXT,
    publisher TEXT,
    isbn VARCHAR(20),
    language VARCHAR(10),
    page_count INTEGER,
    year INTEGER,
    -- Full-text search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(author, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(publisher, '')), 'B')
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ebook metadata search
CREATE INDEX idx_ebook_metadata_search ON ebook_metadata USING GIN(search_vector);
CREATE INDEX idx_ebook_metadata_file_id ON ebook_metadata(file_id);

-- ============================================
-- USER FAVORITES TABLE
-- ============================================
CREATE TABLE user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, file_id)
);

-- Index for user favorites
CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX idx_user_favorites_file_id ON user_favorites(file_id);

-- ============================================
-- COLLECTIONS TABLE (playlists, watchlists, reading lists)
-- ============================================
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    collection_type VARCHAR(20) CHECK (collection_type IN ('playlist', 'watchlist', 'reading_list', 'mixed')) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for collections
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collections_type ON collections(collection_type);

-- ============================================
-- COLLECTION ITEMS TABLE
-- ============================================
CREATE TABLE collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE NOT NULL,
    file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE NOT NULL,
    position INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(collection_id, file_id)
);

-- Index for collection items
CREATE INDEX idx_collection_items_collection_id ON collection_items(collection_id);
CREATE INDEX idx_collection_items_file_id ON collection_items(file_id);

-- ============================================
-- READING PROGRESS TABLE
-- ============================================
CREATE TABLE reading_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE NOT NULL,
    current_page INTEGER DEFAULT 0,
    total_pages INTEGER,
    percentage DECIMAL(5,2) DEFAULT 0,
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, file_id)
);

-- Index for reading progress
CREATE INDEX idx_reading_progress_user_id ON reading_progress(user_id);
CREATE INDEX idx_reading_progress_file_id ON reading_progress(file_id);

-- ============================================
-- WATCH PROGRESS TABLE
-- ============================================
CREATE TABLE watch_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE NOT NULL,
    current_time_seconds INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    percentage DECIMAL(5,2) DEFAULT 0,
    last_watched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, file_id)
);

-- Index for watch progress
CREATE INDEX idx_watch_progress_user_id ON watch_progress(user_id);
CREATE INDEX idx_watch_progress_file_id ON watch_progress(file_id);

-- ============================================
-- RATE LIMITS TABLE
-- ============================================
CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER DEFAULT 1,
    UNIQUE(ip_address, action_type, window_start)
);

-- Index for rate limits
CREATE INDEX idx_rate_limits_lookup ON rate_limits(ip_address, action_type, window_start);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for torrents updated_at
CREATE TRIGGER update_torrents_updated_at
    BEFORE UPDATE ON torrents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for collections updated_at
CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEARCH FUNCTION
-- ============================================

-- Combined search function across all media types
CREATE OR REPLACE FUNCTION search_files(
    search_query TEXT,
    media_type VARCHAR(20) DEFAULT NULL,
    torrent_uuid UUID DEFAULT NULL,
    result_limit INTEGER DEFAULT 20,
    result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    file_id UUID,
    file_name TEXT,
    file_path TEXT,
    file_size BIGINT,
    file_media_category VARCHAR(20),
    file_index INTEGER,
    torrent_id UUID,
    torrent_name TEXT,
    torrent_infohash VARCHAR(40),
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tf.id AS file_id,
        tf.name AS file_name,
        tf.path AS file_path,
        tf.size AS file_size,
        tf.media_category AS file_media_category,
        tf.file_index,
        t.id AS torrent_id,
        t.name AS torrent_name,
        t.infohash AS torrent_infohash,
        ts_rank(tf.search_vector, websearch_to_tsquery('english', search_query)) AS rank
    FROM torrent_files tf
    JOIN torrents t ON tf.torrent_id = t.id
    WHERE 
        tf.search_vector @@ websearch_to_tsquery('english', search_query)
        AND (media_type IS NULL OR tf.media_category = media_type)
        AND (torrent_uuid IS NULL OR tf.torrent_id = torrent_uuid)
    ORDER BY rank DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on user-specific tables
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;

-- Policies for user_favorites
CREATE POLICY "Users can view their own favorites"
    ON user_favorites FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites"
    ON user_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
    ON user_favorites FOR DELETE
    USING (auth.uid() = user_id);

-- Policies for collections
CREATE POLICY "Users can view their own collections"
    ON collections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own collections"
    ON collections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collections"
    ON collections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collections"
    ON collections FOR DELETE
    USING (auth.uid() = user_id);

-- Policies for collection_items
CREATE POLICY "Users can view items in their collections"
    ON collection_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM collections c
            WHERE c.id = collection_items.collection_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert items in their collections"
    ON collection_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM collections c
            WHERE c.id = collection_items.collection_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete items from their collections"
    ON collection_items FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM collections c
            WHERE c.id = collection_items.collection_id
            AND c.user_id = auth.uid()
        )
    );

-- Policies for reading_progress
CREATE POLICY "Users can view their own reading progress"
    ON reading_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reading progress"
    ON reading_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading progress"
    ON reading_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- Policies for watch_progress
CREATE POLICY "Users can view their own watch progress"
    ON watch_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watch progress"
    ON watch_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watch progress"
    ON watch_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================
-- PUBLIC ACCESS FOR TORRENTS AND FILES
-- ============================================

-- Torrents and files are publicly readable (no auth required)
ALTER TABLE torrents ENABLE ROW LEVEL SECURITY;
ALTER TABLE torrent_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebook_metadata ENABLE ROW LEVEL SECURITY;

-- Public read access for torrents
CREATE POLICY "Torrents are publicly readable"
    ON torrents FOR SELECT
    USING (true);

-- Public read access for torrent_files
CREATE POLICY "Torrent files are publicly readable"
    ON torrent_files FOR SELECT
    USING (true);

-- Public read access for audio_metadata
CREATE POLICY "Audio metadata is publicly readable"
    ON audio_metadata FOR SELECT
    USING (true);

-- Public read access for video_metadata
CREATE POLICY "Video metadata is publicly readable"
    ON video_metadata FOR SELECT
    USING (true);

-- Public read access for ebook_metadata
CREATE POLICY "Ebook metadata is publicly readable"
    ON ebook_metadata FOR SELECT
    USING (true);

-- Service role can insert/update/delete torrents and files
-- (These operations happen server-side only)
CREATE POLICY "Service role can manage torrents"
    ON torrents FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage torrent files"
    ON torrent_files FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage audio metadata"
    ON audio_metadata FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage video metadata"
    ON video_metadata FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage ebook metadata"
    ON ebook_metadata FOR ALL
    USING (auth.role() = 'service_role');

-- Rate limits managed by service role only
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage rate limits"
    ON rate_limits FOR ALL
    USING (auth.role() = 'service_role');
