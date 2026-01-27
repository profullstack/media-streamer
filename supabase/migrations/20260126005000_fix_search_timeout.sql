-- Fix search timeout by using full-text search indexes instead of ILIKE
-- The ILIKE '%word%' pattern causes full table scans on the large DHT torrents table
-- Full-text search uses the existing GIN indexes for fast lookups:
--   idx_torrents_name_search ON torrents USING gin(to_tsvector('english', name))
--   idx_bt_torrents_search ON bt_torrents USING GIN(search_vector)

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
DECLARE
    normalized_query TEXT;
    tsq TSQUERY;
BEGIN
    -- Normalize the search query
    normalized_query := TRIM(search_query);

    -- Require minimum 2 characters to search
    IF LENGTH(normalized_query) < 2 THEN
        RETURN;
    END IF;

    -- Build tsquery from search terms
    -- websearch_to_tsquery handles multi-word queries naturally:
    --   "foo bar" => 'foo' & 'bar' (both required)
    tsq := websearch_to_tsquery('english', normalized_query);

    RETURN QUERY
    WITH
    -- User-submitted torrents: use the pre-computed search_vector column + GIN index
    user_results AS (
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
        WHERE bt.search_vector @@ tsq
    ),
    -- DHT torrents: use to_tsvector GIN index for fast lookup
    -- Limit candidates early, then join metadata only for matches
    dht_candidates AS (
        SELECT
            t.info_hash,
            t.name,
            t.size,
            t.files_count,
            t.created_at
        FROM torrents t
        WHERE to_tsvector('english', t.name) @@ tsq
        LIMIT 5000
    ),
    dht_results AS (
        SELECT
            encode(dc.info_hash, 'hex')::TEXT as id,
            encode(dc.info_hash, 'hex')::TEXT as infohash,
            dc.name::TEXT as name,
            ('magnet:?xt=urn:btih:' || encode(dc.info_hash, 'hex') || '&dn=' || encode(dc.name::bytea, 'escape'))::TEXT as magnet_uri,
            dc.size as size,
            COALESCE(dc.files_count, 0) as files_count,
            COALESCE(tts.seeders, 0) as seeders,
            COALESCE(tts.leechers, 0) as leechers,
            dc.created_at::TIMESTAMPTZ as created_at,
            CASE
                WHEN ca_poster.value IS NOT NULL
                THEN 'https://image.tmdb.org/t/p/w500' || ca_poster.value
                ELSE NULL
            END::TEXT as poster_url,
            CASE
                WHEN ca_backdrop.value IS NOT NULL
                THEN 'https://image.tmdb.org/t/p/w1280' || ca_backdrop.value
                ELSE NULL
            END::TEXT as cover_url,
            tc.content_type::TEXT as content_type,
            'dht'::TEXT as source
        FROM dht_candidates dc
        LEFT JOIN LATERAL (
            SELECT tts_inner.seeders, tts_inner.leechers
            FROM torrents_torrent_sources tts_inner
            WHERE tts_inner.info_hash = dc.info_hash
            ORDER BY tts_inner.seeders DESC NULLS LAST
            LIMIT 1
        ) tts ON true
        LEFT JOIN torrent_contents tc ON tc.info_hash = dc.info_hash
        LEFT JOIN content_attributes ca_poster ON
            ca_poster.content_type = tc.content_type
            AND ca_poster.content_source = tc.content_source
            AND ca_poster.content_id = tc.content_id
            AND ca_poster.key = 'poster_path'
        LEFT JOIN content_attributes ca_backdrop ON
            ca_backdrop.content_type = tc.content_type
            AND ca_backdrop.content_source = tc.content_source
            AND ca_backdrop.content_id = tc.content_id
            AND ca_backdrop.key = 'backdrop_path'
        WHERE NOT EXISTS (
            SELECT 1 FROM bt_torrents bt2
            WHERE bt2.infohash = encode(dc.info_hash, 'hex')
        )
    ),
    combined_results AS (
        SELECT * FROM user_results
        UNION ALL
        SELECT * FROM dht_results
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
        cr.seeders DESC NULLS LAST,
        cr.created_at DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION search_all_torrents TO anon, authenticated, service_role;
