-- Add TMDB poster images to DHT torrent search results
-- Joins to Bitmagnet's content metadata tables to get TMDB poster_path

DROP FUNCTION IF EXISTS search_all_torrents(TEXT, INTEGER, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION search_all_torrents(
    search_query TEXT,
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0,
    sort_by TEXT DEFAULT 'seeders',
    sort_order TEXT DEFAULT 'desc'
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
    WITH combined_results AS (
        -- User-submitted torrents from bt_torrents
        SELECT
            bt.id::TEXT as id,
            bt.infohash::TEXT as infohash,
            bt.name::TEXT as name,
            bt.magnet_uri::TEXT as magnet_uri,
            bt.total_size as size,
            bt.file_count as files_count,
            COALESCE(bt.seeders, 0) as seeders,
            COALESCE(bt.leechers, 0) as leechers,
            bt.created_at::TIMESTAMPTZ as created_at,
            bt.poster_url::TEXT as poster_url,
            bt.cover_url::TEXT as cover_url,
            bt.content_type::TEXT as content_type,
            'user'::TEXT as source
        FROM bt_torrents bt
        WHERE
            bt.name ILIKE '%' || search_query || '%'
            OR bt.clean_title ILIKE '%' || search_query || '%'

        UNION ALL

        -- DHT torrents from Bitmagnet's torrents table with TMDB metadata
        SELECT
            encode(t.info_hash, 'hex')::TEXT as id,
            encode(t.info_hash, 'hex')::TEXT as infohash,
            t.name::TEXT as name,
            ('magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' || encode(t.name::bytea, 'escape'))::TEXT as magnet_uri,
            t.size as size,
            COALESCE(t.files_count, 0) as files_count,
            COALESCE(tts.seeders, 0) as seeders,
            COALESCE(tts.leechers, 0) as leechers,
            t.created_at::TIMESTAMPTZ as created_at,
            -- Construct TMDB poster URL from content_attributes if available
            CASE
                WHEN ca_poster.value IS NOT NULL
                THEN 'https://image.tmdb.org/t/p/w500' || ca_poster.value
                ELSE NULL
            END::TEXT as poster_url,
            -- Construct TMDB backdrop URL from content_attributes if available
            CASE
                WHEN ca_backdrop.value IS NOT NULL
                THEN 'https://image.tmdb.org/t/p/w1280' || ca_backdrop.value
                ELSE NULL
            END::TEXT as cover_url,
            tc.content_type::TEXT as content_type,
            'dht'::TEXT as source
        FROM torrents t
        LEFT JOIN LATERAL (
            SELECT tts_inner.seeders, tts_inner.leechers
            FROM torrents_torrent_sources tts_inner
            WHERE tts_inner.info_hash = t.info_hash
            ORDER BY tts_inner.seeders DESC NULLS LAST
            LIMIT 1
        ) tts ON true
        -- Join to torrent_contents to get content metadata
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        -- Join to content_attributes to get poster_path
        LEFT JOIN content_attributes ca_poster ON
            ca_poster.content_type = tc.content_type
            AND ca_poster.content_source = tc.content_source
            AND ca_poster.content_id = tc.content_id
            AND ca_poster.key = 'poster_path'
        -- Join to content_attributes to get backdrop_path for cover
        LEFT JOIN content_attributes ca_backdrop ON
            ca_backdrop.content_type = tc.content_type
            AND ca_backdrop.content_source = tc.content_source
            AND ca_backdrop.content_id = tc.content_id
            AND ca_backdrop.key = 'backdrop_path'
        WHERE
            t.name ILIKE '%' || search_query || '%'
            AND NOT EXISTS (
                SELECT 1 FROM bt_torrents bt2
                WHERE bt2.infohash = encode(t.info_hash, 'hex')
            )
    )
    SELECT * FROM combined_results cr
    ORDER BY
        CASE
            WHEN sort_by = 'seeders' AND sort_order = 'desc' THEN cr.seeders END DESC NULLS LAST,
        CASE
            WHEN sort_by = 'seeders' AND sort_order = 'asc' THEN cr.seeders END ASC NULLS LAST,
        CASE
            WHEN sort_by = 'leechers' AND sort_order = 'desc' THEN cr.leechers END DESC NULLS LAST,
        CASE
            WHEN sort_by = 'leechers' AND sort_order = 'asc' THEN cr.leechers END ASC NULLS LAST,
        CASE
            WHEN sort_by = 'size' AND sort_order = 'desc' THEN cr.size END DESC NULLS LAST,
        CASE
            WHEN sort_by = 'size' AND sort_order = 'asc' THEN cr.size END ASC NULLS LAST,
        CASE
            WHEN sort_by = 'date' AND sort_order = 'desc' THEN cr.created_at END DESC NULLS LAST,
        CASE
            WHEN sort_by = 'date' AND sort_order = 'asc' THEN cr.created_at END ASC NULLS LAST,
        -- Default: seeders desc, then date desc
        cr.seeders DESC NULLS LAST,
        cr.created_at DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION search_all_torrents TO anon, authenticated, service_role;

-- Report on available TMDB metadata
DO $$
DECLARE
    content_count INTEGER;
    poster_count INTEGER;
BEGIN
    -- Count torrents with content metadata
    BEGIN
        SELECT COUNT(DISTINCT tc.info_hash) INTO content_count
        FROM torrent_contents tc;
    EXCEPTION WHEN undefined_table THEN
        content_count := 0;
    END;

    -- Count content with poster_path
    BEGIN
        SELECT COUNT(*) INTO poster_count
        FROM content_attributes ca
        WHERE ca.key = 'poster_path';
    EXCEPTION WHEN undefined_table THEN
        poster_count := 0;
    END;

    RAISE NOTICE '=== TMDB Metadata Status ===';
    RAISE NOTICE 'Torrents with content metadata: %', content_count;
    RAISE NOTICE 'Content entries with poster_path: %', poster_count;
END $$;
