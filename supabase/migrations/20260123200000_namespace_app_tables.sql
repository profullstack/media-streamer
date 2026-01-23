-- Namespace App Tables Migration
-- Creates bt_ prefixed tables for user-submitted torrents to avoid collision with Bitmagnet's tables
-- DHT search remains separate (queries Bitmagnet's tables directly)

-- ============================================
-- CLEANUP: First drop any partial migration state
-- ============================================
DROP TABLE IF EXISTS bt_ebook_metadata CASCADE;
DROP TABLE IF EXISTS bt_video_metadata CASCADE;
DROP TABLE IF EXISTS bt_audio_metadata CASCADE;
DROP TABLE IF EXISTS bt_torrent_folders CASCADE;
DROP TABLE IF EXISTS bt_torrent_files CASCADE;
DROP TABLE IF EXISTS bt_torrents CASCADE;
DROP VIEW IF EXISTS v_all_torrents CASCADE;
DROP FUNCTION IF EXISTS search_all_torrents CASCADE;

-- ============================================
-- DROP UNUSED DHT TABLES (we created these but Bitmagnet uses its own)
-- ============================================
DROP VIEW IF EXISTS v_dht_torrents CASCADE;
DROP VIEW IF EXISTS v_dht_stats CASCADE;
DROP FUNCTION IF EXISTS dht_upsert_torrent CASCADE;
DROP FUNCTION IF EXISTS dht_update_sources CASCADE;
DROP FUNCTION IF EXISTS dht_search_torrents CASCADE;
DROP FUNCTION IF EXISTS dht_count_search_results CASCADE;
DROP TABLE IF EXISTS dht_torrent_sources CASCADE;
DROP TABLE IF EXISTS dht_torrent_files CASCADE;
DROP TABLE IF EXISTS dht_torrents CASCADE;

-- ============================================
-- BT_TORRENTS TABLE (user-submitted torrents)
-- ============================================
CREATE TABLE bt_torrents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    infohash VARCHAR(40) UNIQUE NOT NULL,
    magnet_uri TEXT NOT NULL,
    name TEXT NOT NULL,
    total_size BIGINT NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 0,
    piece_length INTEGER,
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'ready', 'error')),
    error_message TEXT,
    indexed_at TIMESTAMPTZ,
    -- Metadata from enrichment
    clean_title TEXT,
    poster_url TEXT,
    cover_url TEXT,
    content_type VARCHAR(50),
    year INTEGER,
    description TEXT,
    external_id TEXT,
    external_source VARCHAR(50),
    metadata_fetched_at TIMESTAMPTZ,
    director TEXT,
    actors TEXT[],
    genre TEXT,
    -- Music-specific fields
    artist TEXT,
    album TEXT,
    artist_image_url TEXT,
    album_cover_url TEXT,
    -- Swarm stats
    seeders INTEGER DEFAULT 0,
    leechers INTEGER DEFAULT 0,
    swarm_updated_at TIMESTAMPTZ,
    -- Voting
    upvotes INTEGER DEFAULT 0 NOT NULL,
    downvotes INTEGER DEFAULT 0 NOT NULL,
    -- Codec info (cached)
    video_codec VARCHAR(50),
    audio_codec VARCHAR(50),
    container VARCHAR(20),
    needs_transcoding BOOLEAN DEFAULT false,
    -- User tracking
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(clean_title, '')), 'A')
    ) STORED
);

-- Indexes for bt_torrents
CREATE INDEX idx_bt_torrents_infohash ON bt_torrents(infohash);
CREATE INDEX idx_bt_torrents_status ON bt_torrents(status);
CREATE INDEX idx_bt_torrents_created_at ON bt_torrents(created_at DESC);
CREATE INDEX idx_bt_torrents_seeders ON bt_torrents(seeders DESC);
CREATE INDEX idx_bt_torrents_search ON bt_torrents USING GIN(search_vector);
CREATE INDEX idx_bt_torrents_content_type ON bt_torrents(content_type);

-- ============================================
-- BT_TORRENT_FILES TABLE
-- ============================================
CREATE TABLE bt_torrent_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torrent_id UUID REFERENCES bt_torrents(id) ON DELETE CASCADE NOT NULL,
    file_index INTEGER NOT NULL,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    extension VARCHAR(20),
    size BIGINT NOT NULL,
    piece_start INTEGER,
    piece_end INTEGER,
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

-- Indexes for bt_torrent_files
CREATE INDEX idx_bt_torrent_files_torrent_id ON bt_torrent_files(torrent_id);
CREATE INDEX idx_bt_torrent_files_search ON bt_torrent_files USING GIN(search_vector);
CREATE INDEX idx_bt_torrent_files_category ON bt_torrent_files(media_category);
CREATE INDEX idx_bt_torrent_files_extension ON bt_torrent_files(extension);

-- ============================================
-- BT_TORRENT_FOLDERS TABLE
-- ============================================
CREATE TABLE bt_torrent_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    torrent_id UUID REFERENCES bt_torrents(id) ON DELETE CASCADE NOT NULL,
    path TEXT NOT NULL,
    -- Music album metadata
    artist TEXT,
    album TEXT,
    year INTEGER,
    cover_url TEXT,
    -- Aggregate info
    file_count INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(torrent_id, path)
);

-- Indexes for bt_torrent_folders
CREATE INDEX idx_bt_torrent_folders_torrent_id ON bt_torrent_folders(torrent_id);
CREATE INDEX idx_bt_torrent_folders_path ON bt_torrent_folders(path);

-- ============================================
-- BT_AUDIO_METADATA TABLE
-- ============================================
CREATE TABLE bt_audio_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES bt_torrent_files(id) ON DELETE CASCADE UNIQUE NOT NULL,
    artist TEXT,
    album TEXT,
    title TEXT,
    track_number INTEGER,
    duration_seconds NUMERIC(10, 3),
    bitrate INTEGER,
    sample_rate INTEGER,
    codec VARCHAR(50),
    container VARCHAR(20),
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

-- Index for bt_audio_metadata search
CREATE INDEX idx_bt_audio_metadata_search ON bt_audio_metadata USING GIN(search_vector);
CREATE INDEX idx_bt_audio_metadata_file_id ON bt_audio_metadata(file_id);

-- ============================================
-- BT_VIDEO_METADATA TABLE
-- ============================================
CREATE TABLE bt_video_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES bt_torrent_files(id) ON DELETE CASCADE UNIQUE NOT NULL,
    title TEXT,
    duration_seconds INTEGER,
    width INTEGER,
    height INTEGER,
    codec VARCHAR(50),
    audio_codec VARCHAR(50),
    container VARCHAR(20),
    bitrate INTEGER,
    framerate DECIMAL(5,2),
    needs_transcoding BOOLEAN DEFAULT false,
    -- Full-text search vector
    search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A')
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for bt_video_metadata search
CREATE INDEX idx_bt_video_metadata_search ON bt_video_metadata USING GIN(search_vector);
CREATE INDEX idx_bt_video_metadata_file_id ON bt_video_metadata(file_id);

-- ============================================
-- BT_EBOOK_METADATA TABLE
-- ============================================
CREATE TABLE bt_ebook_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES bt_torrent_files(id) ON DELETE CASCADE UNIQUE NOT NULL,
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

-- Index for bt_ebook_metadata search
CREATE INDEX idx_bt_ebook_metadata_search ON bt_ebook_metadata USING GIN(search_vector);
CREATE INDEX idx_bt_ebook_metadata_file_id ON bt_ebook_metadata(file_id);

-- ============================================
-- FIRST: DROP OLD TRIGGER/FUNCTION BEFORE DELETING VOTES
-- (The old trigger references the wrong table and will fail on DELETE)
-- ============================================
DROP TRIGGER IF EXISTS trigger_update_torrent_vote_counts ON torrent_votes;
DROP FUNCTION IF EXISTS update_torrent_vote_counts() CASCADE;

-- ============================================
-- UPDATE TORRENT_COMMENTS TO USE BT_TORRENTS
-- ============================================
-- Drop the broken FK first (if it exists)
ALTER TABLE torrent_comments DROP CONSTRAINT IF EXISTS torrent_comments_torrent_id_fkey;
-- Delete orphaned comments (comments for torrents that don't exist in bt_torrents)
DELETE FROM torrent_comments WHERE NOT EXISTS (
    SELECT 1 FROM bt_torrents WHERE bt_torrents.id = torrent_comments.torrent_id
);
-- Note: We'll keep the UUID torrent_id column for user-submitted torrents
-- Comments will only work on bt_torrents (user-submitted), not Bitmagnet DHT torrents
ALTER TABLE torrent_comments ADD CONSTRAINT torrent_comments_torrent_id_fkey
    FOREIGN KEY (torrent_id) REFERENCES bt_torrents(id) ON DELETE CASCADE;

-- ============================================
-- UPDATE TORRENT_VOTES TO USE BT_TORRENTS
-- ============================================
ALTER TABLE torrent_votes DROP CONSTRAINT IF EXISTS torrent_votes_torrent_id_fkey;
-- Delete orphaned votes (now safe without trigger)
DELETE FROM torrent_votes WHERE NOT EXISTS (
    SELECT 1 FROM bt_torrents WHERE bt_torrents.id = torrent_votes.torrent_id
);
ALTER TABLE torrent_votes ADD CONSTRAINT torrent_votes_torrent_id_fkey
    FOREIGN KEY (torrent_id) REFERENCES bt_torrents(id) ON DELETE CASCADE;

-- ============================================
-- UPDATE TORRENT_FAVORITES TO USE BT_TORRENTS
-- ============================================
ALTER TABLE torrent_favorites DROP CONSTRAINT IF EXISTS torrent_favorites_torrent_id_fkey;
-- Delete orphaned favorites
DELETE FROM torrent_favorites WHERE NOT EXISTS (
    SELECT 1 FROM bt_torrents WHERE bt_torrents.id = torrent_favorites.torrent_id
);
ALTER TABLE torrent_favorites ADD CONSTRAINT torrent_favorites_torrent_id_fkey
    FOREIGN KEY (torrent_id) REFERENCES bt_torrents(id) ON DELETE CASCADE;

-- ============================================
-- TRIGGER FOR BT_TORRENTS UPDATED_AT
-- ============================================
CREATE TRIGGER update_bt_torrents_updated_at
    BEFORE UPDATE ON bt_torrents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RECREATE VOTE COUNT TRIGGER TO USE BT_TORRENTS
-- ============================================

CREATE OR REPLACE FUNCTION update_torrent_vote_counts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE bt_torrents
        SET
            upvotes = upvotes + CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes + CASE WHEN NEW.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = NEW.torrent_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE bt_torrents
        SET
            upvotes = upvotes
                - CASE WHEN OLD.vote_value = 1 THEN 1 ELSE 0 END
                + CASE WHEN NEW.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes
                - CASE WHEN OLD.vote_value = -1 THEN 1 ELSE 0 END
                + CASE WHEN NEW.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = NEW.torrent_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE bt_torrents
        SET
            upvotes = upvotes - CASE WHEN OLD.vote_value = 1 THEN 1 ELSE 0 END,
            downvotes = downvotes - CASE WHEN OLD.vote_value = -1 THEN 1 ELSE 0 END
        WHERE id = OLD.torrent_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_update_torrent_vote_counts
    AFTER INSERT OR UPDATE OR DELETE ON torrent_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_torrent_vote_counts();

-- ============================================
-- SEARCH FUNCTION FOR FILES (uses bt_ tables)
-- ============================================
-- Drop all versions of search_files function
DROP FUNCTION IF EXISTS search_files(TEXT, VARCHAR, UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS search_files(TEXT, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS search_files(TEXT) CASCADE;
DROP FUNCTION IF EXISTS search_files() CASCADE;

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
    torrent_poster_url TEXT,
    torrent_cover_url TEXT,
    torrent_clean_title TEXT,
    rank REAL
)
SECURITY DEFINER
SET search_path = public
AS $$
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
        t.poster_url AS torrent_poster_url,
        t.cover_url AS torrent_cover_url,
        t.clean_title AS torrent_clean_title,
        ts_rank(tf.search_vector, websearch_to_tsquery('english', search_query)) AS rank
    FROM bt_torrent_files tf
    JOIN bt_torrents t ON tf.torrent_id = t.id
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
-- ROW LEVEL SECURITY FOR BT_ TABLES
-- ============================================

-- BT_TORRENTS RLS
ALTER TABLE bt_torrents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_torrents_public_read" ON bt_torrents
    FOR SELECT USING (true);

CREATE POLICY "bt_torrents_service_role" ON bt_torrents
    FOR ALL USING (auth.role() = 'service_role');

-- BT_TORRENT_FILES RLS
ALTER TABLE bt_torrent_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_torrent_files_public_read" ON bt_torrent_files
    FOR SELECT USING (true);

CREATE POLICY "bt_torrent_files_service_role" ON bt_torrent_files
    FOR ALL USING (auth.role() = 'service_role');

-- BT_TORRENT_FOLDERS RLS
ALTER TABLE bt_torrent_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_torrent_folders_public_read" ON bt_torrent_folders
    FOR SELECT USING (true);

CREATE POLICY "bt_torrent_folders_service_role" ON bt_torrent_folders
    FOR ALL USING (auth.role() = 'service_role');

-- BT_AUDIO_METADATA RLS
ALTER TABLE bt_audio_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_audio_metadata_public_read" ON bt_audio_metadata
    FOR SELECT USING (true);

CREATE POLICY "bt_audio_metadata_service_role" ON bt_audio_metadata
    FOR ALL USING (auth.role() = 'service_role');

-- BT_VIDEO_METADATA RLS
ALTER TABLE bt_video_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_video_metadata_public_read" ON bt_video_metadata
    FOR SELECT USING (true);

CREATE POLICY "bt_video_metadata_service_role" ON bt_video_metadata
    FOR ALL USING (auth.role() = 'service_role');

-- BT_EBOOK_METADATA RLS
ALTER TABLE bt_ebook_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bt_ebook_metadata_public_read" ON bt_ebook_metadata
    FOR SELECT USING (true);

CREATE POLICY "bt_ebook_metadata_service_role" ON bt_ebook_metadata
    FOR ALL USING (auth.role() = 'service_role');
