-- Fix search timeout with three changes:
-- 1. Create a proper full-text search GIN index on torrents.name (the trigram index isn't enough)
-- 2. Increase statement_timeout for this function (Supabase default is 8s, not enough for DHT)
-- 3. Use longest-word-first strategy: index scan on most selective word, then filter remaining
--
-- Using 'simple' text search config (no stemming/stop words) since torrent names aren't
-- natural language - they're things like "Movie.Name.2024.1080p.BluRay.x264"

-- Full-text search GIN index on torrents.name for fast lookups
-- This is the index the @@ operator will actually use
CREATE INDEX IF NOT EXISTS idx_torrents_name_fts
ON torrents USING GIN(to_tsvector('simple', name));

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
SET statement_timeout = '30s'
AS $$
DECLARE
    normalized_query TEXT;
    query_words TEXT[];
    longest_word TEXT;
    word TEXT;
    longest_tsq TSQUERY;
BEGIN
    -- Normalize the search query
    normalized_query := LOWER(TRIM(search_query));

    -- Require minimum 2 characters to search
    IF LENGTH(normalized_query) < 2 THEN
        RETURN;
    END IF;

    -- Split query into words, remove empty strings
    query_words := ARRAY(
        SELECT w FROM unnest(string_to_array(normalized_query, ' ')) AS w
        WHERE LENGTH(TRIM(w)) > 0
    );

    -- Find the longest word (most selective for index lookup)
    longest_word := query_words[1];
    FOREACH word IN ARRAY query_words LOOP
        IF LENGTH(word) > LENGTH(longest_word) THEN
            longest_word := word;
        END IF;
    END LOOP;

    -- Build tsquery from longest word for FTS GIN index scan
    longest_tsq := plainto_tsquery('simple', longest_word);

    RETURN QUERY
    WITH
    -- User-submitted torrents: search name only
    -- bt_torrents is small, so ILIKE with all words is fine
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
        WHERE bt.name ILIKE '%' || longest_word || '%'
          AND NOT EXISTS (
              SELECT 1 FROM unnest(query_words) AS qw
              WHERE bt.name NOT ILIKE '%' || qw || '%'
          )
    ),
    -- DHT torrents: two-phase search on 1.8M rows
    -- Phase 1: Use FTS GIN index (idx_torrents_name_fts) with longest word
    --          to_tsvector('simple', name) @@ tsquery uses the index for fast lookup
    -- Phase 2: Filter candidates with ILIKE for ALL words (exact substring match)
    dht_candidates AS (
        SELECT
            t.info_hash,
            t.name,
            t.size,
            t.files_count,
            t.created_at
        FROM torrents t
        WHERE to_tsvector('simple', t.name) @@ longest_tsq
        LIMIT 5000
    ),
    dht_filtered AS (
        SELECT dc.*
        FROM dht_candidates dc
        WHERE NOT EXISTS (
            SELECT 1 FROM unnest(query_words) AS qw
            WHERE dc.name NOT ILIKE '%' || qw || '%'
        )
    ),
    dht_results AS (
        SELECT
            encode(df.info_hash, 'hex')::TEXT as id,
            encode(df.info_hash, 'hex')::TEXT as infohash,
            df.name::TEXT as name,
            ('magnet:?xt=urn:btih:' || encode(df.info_hash, 'hex') || '&dn=' || encode(df.name::bytea, 'escape'))::TEXT as magnet_uri,
            df.size as size,
            COALESCE(df.files_count, 0) as files_count,
            COALESCE(tts.seeders, 0) as seeders,
            COALESCE(tts.leechers, 0) as leechers,
            df.created_at::TIMESTAMPTZ as created_at,
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
        FROM dht_filtered df
        LEFT JOIN LATERAL (
            SELECT tts_inner.seeders, tts_inner.leechers
            FROM torrents_torrent_sources tts_inner
            WHERE tts_inner.info_hash = df.info_hash
            ORDER BY tts_inner.seeders DESC NULLS LAST
            LIMIT 1
        ) tts ON true
        LEFT JOIN torrent_contents tc ON tc.info_hash = df.info_hash
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
            WHERE bt2.infohash = encode(df.info_hash, 'hex')
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
