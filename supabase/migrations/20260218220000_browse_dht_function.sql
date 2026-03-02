-- Browse DHT torrents without search query
-- Optimized: starts from torrents_torrent_sources (indexed by seeders)
-- Skips expensive content_attributes joins — frontend can lazy-load images
DROP FUNCTION IF EXISTS browse_dht_torrents(integer,integer,text,text,text);

CREATE OR REPLACE FUNCTION browse_dht_torrents(
    result_limit INT DEFAULT 50,
    result_offset INT DEFAULT 0,
    sort_by TEXT DEFAULT 'seeders',
    sort_order TEXT DEFAULT 'desc',
    filter_category TEXT DEFAULT NULL
) RETURNS TABLE (
    id TEXT,
    infohash TEXT,
    name TEXT,
    magnet_uri TEXT,
    size BIGINT,
    files_count INT,
    seeders INT,
    leechers INT,
    created_at TIMESTAMPTZ,
    content_type TEXT,
    source TEXT
) AS $$
BEGIN
    -- Use different queries for different sort columns to leverage indexes
    IF sort_by = 'seeders' AND sort_order = 'desc' THEN
        RETURN QUERY
        SELECT
            encode(t.info_hash, 'hex')::TEXT,
            encode(t.info_hash, 'hex')::TEXT,
            t.name::TEXT,
            ('magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' || encode(t.name::bytea, 'escape'))::TEXT,
            t.size,
            COALESCE(t.files_count, 0),
            COALESCE(tts.seeders, 0),
            COALESCE(tts.leechers, 0),
            t.created_at::TIMESTAMPTZ,
            tc.content_type::TEXT,
            'dht'::TEXT
        FROM torrents_torrent_sources tts
        JOIN torrents t ON t.info_hash = tts.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE tts.seeders > 0
            AND (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY tts.seeders DESC NULLS LAST
        LIMIT result_limit
        OFFSET result_offset;
    ELSIF sort_by = 'seeders' AND sort_order = 'asc' THEN
        RETURN QUERY
        SELECT
            encode(t.info_hash, 'hex')::TEXT,
            encode(t.info_hash, 'hex')::TEXT,
            t.name::TEXT,
            ('magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' || encode(t.name::bytea, 'escape'))::TEXT,
            t.size,
            COALESCE(t.files_count, 0),
            COALESCE(tts.seeders, 0),
            COALESCE(tts.leechers, 0),
            t.created_at::TIMESTAMPTZ,
            tc.content_type::TEXT,
            'dht'::TEXT
        FROM torrents_torrent_sources tts
        JOIN torrents t ON t.info_hash = tts.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY tts.seeders ASC NULLS LAST
        LIMIT result_limit
        OFFSET result_offset;
    ELSIF sort_by = 'leechers' AND sort_order = 'desc' THEN
        RETURN QUERY
        SELECT
            encode(t.info_hash, 'hex')::TEXT,
            encode(t.info_hash, 'hex')::TEXT,
            t.name::TEXT,
            ('magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' || encode(t.name::bytea, 'escape'))::TEXT,
            t.size,
            COALESCE(t.files_count, 0),
            COALESCE(tts.seeders, 0),
            COALESCE(tts.leechers, 0),
            t.created_at::TIMESTAMPTZ,
            tc.content_type::TEXT,
            'dht'::TEXT
        FROM torrents_torrent_sources tts
        JOIN torrents t ON t.info_hash = tts.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY tts.leechers DESC NULLS LAST
        LIMIT result_limit
        OFFSET result_offset;
    ELSIF sort_by = 'date' THEN
        RETURN QUERY
        SELECT
            encode(t.info_hash, 'hex')::TEXT,
            encode(t.info_hash, 'hex')::TEXT,
            t.name::TEXT,
            ('magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' || encode(t.name::bytea, 'escape'))::TEXT,
            t.size,
            COALESCE(t.files_count, 0),
            COALESCE(tts.seeders, 0),
            COALESCE(tts.leechers, 0),
            t.created_at::TIMESTAMPTZ,
            tc.content_type::TEXT,
            'dht'::TEXT
        FROM torrents t
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = t.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY
            CASE WHEN sort_order = 'desc' THEN t.created_at END DESC NULLS LAST,
            CASE WHEN sort_order = 'asc' THEN t.created_at END ASC NULLS LAST
        LIMIT result_limit
        OFFSET result_offset;
    ELSE
        -- Default: seeders desc
        RETURN QUERY
        SELECT
            encode(t.info_hash, 'hex')::TEXT,
            encode(t.info_hash, 'hex')::TEXT,
            t.name::TEXT,
            ('magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' || encode(t.name::bytea, 'escape'))::TEXT,
            t.size,
            COALESCE(t.files_count, 0),
            COALESCE(tts.seeders, 0),
            COALESCE(tts.leechers, 0),
            t.created_at::TIMESTAMPTZ,
            tc.content_type::TEXT,
            'dht'::TEXT
        FROM torrents_torrent_sources tts
        JOIN torrents t ON t.info_hash = tts.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE tts.seeders > 0
            AND (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY tts.seeders DESC NULLS LAST
        LIMIT result_limit
        OFFSET result_offset;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
