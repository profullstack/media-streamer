-- Add filter parameters to browse_dht_torrents:
--   min_seeders, max_seeders, min_leechers, max_leechers,
--   min_size, max_size (bytes), date_from, date_to (timestamptz)
--
-- Filters are applied in the WHERE clause after joining tables.
-- NULL means "no filter" for that parameter.

CREATE OR REPLACE FUNCTION public.browse_dht_torrents(
    result_limit integer DEFAULT 50,
    result_offset integer DEFAULT 0,
    sort_by text DEFAULT 'seeders',
    sort_order text DEFAULT 'desc',
    filter_category text DEFAULT NULL,
    min_seeders integer DEFAULT NULL,
    max_seeders integer DEFAULT NULL,
    min_leechers integer DEFAULT NULL,
    max_leechers integer DEFAULT NULL,
    min_size bigint DEFAULT NULL,
    max_size bigint DEFAULT NULL,
    date_from timestamptz DEFAULT NULL,
    date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
    id text, infohash text, name text, magnet_uri text,
    size bigint, files_count integer, seeders integer, leechers integer,
    created_at timestamptz, content_type text, source text
)
LANGUAGE plpgsql STABLE
SET statement_timeout = '15s'
AS $$
BEGIN
    -- Use a single query with CASE-based ORDER BY for simplicity with filters.
    -- The filters make it hard to use the branched approach since we need to
    -- filter on fields from multiple tables simultaneously.
    RETURN QUERY
    SELECT
        encode(t.info_hash,'hex')::TEXT,
        encode(t.info_hash,'hex')::TEXT,
        t.name::TEXT,
        ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
        t.size,
        COALESCE(t.files_count,0),
        COALESCE(tts.seeders,0)::INTEGER,
        COALESCE(tts.leechers,0)::INTEGER,
        t.created_at::TIMESTAMPTZ,
        tc.content_type::TEXT,
        'dht'::TEXT
    FROM torrents t
    LEFT JOIN LATERAL (
        SELECT tts_inner.seeders, tts_inner.leechers
        FROM torrents_torrent_sources tts_inner
        WHERE tts_inner.info_hash = t.info_hash
        ORDER BY tts_inner.seeders DESC NULLS LAST
        LIMIT 1
    ) tts ON true
    LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
    WHERE
        -- Category filter
        (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        -- Seeders filters
        AND (min_seeders IS NULL OR COALESCE(tts.seeders, 0) >= min_seeders)
        AND (max_seeders IS NULL OR COALESCE(tts.seeders, 0) <= max_seeders)
        -- Leechers filters
        AND (min_leechers IS NULL OR COALESCE(tts.leechers, 0) >= min_leechers)
        AND (max_leechers IS NULL OR COALESCE(tts.leechers, 0) <= max_leechers)
        -- Size filters
        AND (min_size IS NULL OR t.size >= min_size)
        AND (max_size IS NULL OR t.size <= max_size)
        -- Date filters
        AND (date_from IS NULL OR t.created_at >= date_from)
        AND (date_to IS NULL OR t.created_at <= date_to)
    ORDER BY
        CASE WHEN sort_by = 'seeders' AND sort_order = 'desc' THEN COALESCE(tts.seeders, 0) END DESC NULLS LAST,
        CASE WHEN sort_by = 'seeders' AND sort_order = 'asc' THEN COALESCE(tts.seeders, 0) END ASC NULLS LAST,
        CASE WHEN sort_by = 'leechers' AND sort_order = 'desc' THEN COALESCE(tts.leechers, 0) END DESC NULLS LAST,
        CASE WHEN sort_by = 'leechers' AND sort_order = 'asc' THEN COALESCE(tts.leechers, 0) END ASC NULLS LAST,
        CASE WHEN sort_by = 'size' AND sort_order = 'desc' THEN t.size END DESC NULLS LAST,
        CASE WHEN sort_by = 'size' AND sort_order = 'asc' THEN t.size END ASC NULLS LAST,
        CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN t.created_at END DESC NULLS LAST,
        CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN t.created_at END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN t.name END ASC NULLS LAST,
        CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN t.name END DESC NULLS LAST,
        COALESCE(tts.seeders, 0) DESC NULLS LAST
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;
