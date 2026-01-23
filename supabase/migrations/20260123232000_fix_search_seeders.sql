-- Fix search_all_torrents to include seeders/leechers from Bitmagnet's torrents_torrent_sources table

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

    -- DHT torrents from Bitmagnet's torrents table
    -- Join with torrents_torrent_sources to get seeders/leechers
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
        NULL::TEXT as poster_url,
        NULL::TEXT as cover_url,
        NULL::TEXT as content_type,
        'dht'::TEXT as source
    FROM torrents t
    -- Join to get seeders/leechers - use the source with the highest seeders
    LEFT JOIN LATERAL (
        SELECT tts_inner.seeders, tts_inner.leechers
        FROM torrents_torrent_sources tts_inner
        WHERE tts_inner.info_hash = t.info_hash
        ORDER BY tts_inner.seeders DESC NULLS LAST
        LIMIT 1
    ) tts ON true
    WHERE
        t.name ILIKE '%' || search_query || '%'
        AND NOT EXISTS (
            SELECT 1 FROM bt_torrents bt2
            WHERE bt2.infohash = encode(t.info_hash, 'hex')
        )

    ORDER BY seeders DESC NULLS LAST, created_at DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION search_all_torrents TO anon, authenticated, service_role;
