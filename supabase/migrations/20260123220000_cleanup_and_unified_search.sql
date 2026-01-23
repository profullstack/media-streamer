-- Cleanup old unused app tables and create unified search
-- This migration:
-- 1. Drops old app tables that are no longer used (replaced by bt_ prefixed tables)
-- 2. Creates a unified search function that searches both bt_torrents AND Bitmagnet's torrents

-- ============================================
-- DROP OLD UNUSED APP TABLES
-- ============================================
-- These tables were replaced by bt_ prefixed versions
-- Only drop if they exist and have no foreign key dependencies

-- Drop old audio_metadata (replaced by bt_audio_metadata)
DROP TABLE IF EXISTS audio_metadata CASCADE;

-- Drop old ebook_metadata (replaced by bt_ebook_metadata)
DROP TABLE IF EXISTS ebook_metadata CASCADE;

-- Drop old video_metadata (replaced by bt_video_metadata)
DROP TABLE IF EXISTS video_metadata CASCADE;

-- Drop old torrent_folders (replaced by bt_torrent_folders)
DROP TABLE IF EXISTS torrent_folders CASCADE;

-- Note: We do NOT drop these tables as they are still used:
-- - torrent_comments, torrent_votes, torrent_favorites (FK to bt_torrents)
-- - torrents, torrent_files, torrent_sources, etc. (Bitmagnet's tables)

-- ============================================
-- RENAME COMMENT/VOTE/FAVORITE TABLES TO BT_ PREFIX
-- ============================================
-- The code expects bt_torrent_comments, bt_torrent_votes, etc.
-- but the namespace migration only updated FKs, not table names

-- First check if the bt_ tables already exist
DO $$
BEGIN
    -- Rename torrent_comments to bt_torrent_comments if not already renamed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'torrent_comments')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bt_torrent_comments') THEN
        ALTER TABLE torrent_comments RENAME TO bt_torrent_comments;
        RAISE NOTICE 'Renamed torrent_comments to bt_torrent_comments';
    END IF;

    -- Rename comment_votes to bt_comment_votes if not already renamed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comment_votes')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bt_comment_votes') THEN
        ALTER TABLE comment_votes RENAME TO bt_comment_votes;
        RAISE NOTICE 'Renamed comment_votes to bt_comment_votes';
    END IF;

    -- Rename torrent_votes to bt_torrent_votes if not already renamed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'torrent_votes')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bt_torrent_votes') THEN
        ALTER TABLE torrent_votes RENAME TO bt_torrent_votes;
        RAISE NOTICE 'Renamed torrent_votes to bt_torrent_votes';
    END IF;

    -- Rename torrent_favorites to bt_torrent_favorites if not already renamed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'torrent_favorites')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bt_torrent_favorites') THEN
        ALTER TABLE torrent_favorites RENAME TO bt_torrent_favorites;
        RAISE NOTICE 'Renamed torrent_favorites to bt_torrent_favorites';
    END IF;
END $$;

-- ============================================
-- CREATE UNIFIED TORRENT SEARCH FUNCTION
-- ============================================
-- This function searches both bt_torrents (user-submitted) and
-- Bitmagnet's torrents table (DHT-crawled)

DROP FUNCTION IF EXISTS search_all_torrents(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION search_all_torrents(
    search_query TEXT,
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id TEXT,
    infohash TEXT,
    name TEXT,
    magnet_uri TEXT,
    size BIGINT,
    files_count INTEGER,
    seeders INTEGER,
    leechers INTEGER,
    created_at TIMESTAMPTZ,
    poster_url TEXT,
    cover_url TEXT,
    content_type TEXT,
    source TEXT
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    -- User-submitted torrents from bt_torrents
    SELECT
        bt.id::TEXT as id,
        bt.infohash as infohash,
        bt.name as name,
        bt.magnet_uri as magnet_uri,
        bt.total_size as size,
        bt.file_count as files_count,
        COALESCE(bt.seeders, 0) as seeders,
        COALESCE(bt.leechers, 0) as leechers,
        bt.created_at::TIMESTAMPTZ as created_at,
        bt.poster_url as poster_url,
        bt.cover_url as cover_url,
        bt.content_type as content_type,
        'user'::TEXT as source
    FROM bt_torrents bt
    WHERE
        bt.name ILIKE '%' || search_query || '%'
        OR bt.clean_title ILIKE '%' || search_query || '%'

    UNION ALL

    -- DHT torrents from Bitmagnet's torrents table
    SELECT
        encode(t.info_hash, 'hex') as id,
        encode(t.info_hash, 'hex') as infohash,
        t.name as name,
        'magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' || encode(t.name::bytea, 'escape') as magnet_uri,
        t.size as size,
        COALESCE(t.files_count, 0) as files_count,
        COALESCE(ts.seeders, 0) as seeders,
        COALESCE(ts.leechers, 0) as leechers,
        t.created_at::TIMESTAMPTZ as created_at,
        NULL::TEXT as poster_url,
        NULL::TEXT as cover_url,
        NULL::TEXT as content_type,
        'dht'::TEXT as source
    FROM torrents t
    LEFT JOIN torrent_sources ts ON ts.info_hash = t.info_hash
    WHERE
        t.name ILIKE '%' || search_query || '%'
        -- Exclude torrents that already exist in bt_torrents (avoid duplicates)
        AND NOT EXISTS (
            SELECT 1 FROM bt_torrents bt2
            WHERE bt2.infohash = encode(t.info_hash, 'hex')
        )

    ORDER BY seeders DESC NULLS LAST, created_at DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_all_torrents TO anon, authenticated, service_role;

-- ============================================
-- REPORT RESULTS
-- ============================================
DO $$
DECLARE
    bt_count INTEGER;
    dht_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO bt_count FROM bt_torrents;

    -- Try to count DHT torrents, handle if table doesn't exist
    BEGIN
        SELECT COUNT(*) INTO dht_count FROM torrents;
    EXCEPTION WHEN undefined_table THEN
        dht_count := 0;
    END;

    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'bt_torrents (user-submitted): % records', bt_count;
    RAISE NOTICE 'torrents (DHT/Bitmagnet): % records', dht_count;
    RAISE NOTICE 'Total searchable: % records', bt_count + dht_count;
END $$;
