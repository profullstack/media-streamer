-- Support quoted phrase search and -keyword exclusions in search_all_torrents
--
-- Examples:
--   "self custody"         → matches 'self custody' as exact phrase
--   "self custody" -webdl  → matches 'self custody' but excludes 'webdl'
--   bitcoin "cold storage" -scam → matches 'bitcoin' AND 'cold storage' phrase, excludes 'scam'

DROP FUNCTION IF EXISTS search_all_torrents(TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, BIGINT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION search_all_torrents(
    search_query TEXT,
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0,
    sort_by TEXT DEFAULT 'seeders',
    sort_order TEXT DEFAULT 'desc',
    min_seeders INTEGER DEFAULT NULL,
    max_seeders INTEGER DEFAULT NULL,
    min_leechers INTEGER DEFAULT NULL,
    max_leechers INTEGER DEFAULT NULL,
    min_size BIGINT DEFAULT NULL,
    max_size BIGINT DEFAULT NULL,
    date_from TIMESTAMPTZ DEFAULT NULL,
    date_to TIMESTAMPTZ DEFAULT NULL
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
    -- Parsed search components
    include_phrases TEXT[];  -- quoted phrases: "self custody" → 'self custody'
    include_words TEXT[];    -- unquoted words: bitcoin → 'bitcoin'
    exclude_words TEXT[];    -- exclusion terms: -webdl → 'webdl'
    -- For iteration
    remaining TEXT;
    phrase TEXT;
    word TEXT;
    token TEXT;
    -- For FTS index lookup
    longest_term TEXT;
    longest_tsq TSQUERY;
BEGIN
    -- Normalize the search query
    normalized_query := LOWER(TRIM(search_query));

    -- Require minimum 2 characters to search
    IF LENGTH(normalized_query) < 2 THEN
        RETURN;
    END IF;

    -- Initialize arrays
    include_phrases := ARRAY[]::TEXT[];
    include_words := ARRAY[]::TEXT[];
    exclude_words := ARRAY[]::TEXT[];

    -- Parse the query:
    -- 1. Extract quoted phrases: "exact phrase"
    -- 2. Extract exclusion terms: -keyword
    -- 3. Remaining tokens are include words
    remaining := normalized_query;

    -- Extract quoted phrases (both "..." and '...' styles)
    WHILE remaining ~ '"[^"]+"' LOOP
        phrase := (regexp_match(remaining, '"([^"]+)"'))[1];
        IF phrase IS NOT NULL AND LENGTH(TRIM(phrase)) > 0 THEN
            include_phrases := array_append(include_phrases, TRIM(phrase));
        END IF;
        remaining := regexp_replace(remaining, '"[^"]+"', ' ', 'i');
    END LOOP;

    -- Now parse remaining tokens for -exclusions and include words
    FOREACH token IN ARRAY string_to_array(TRIM(remaining), ' ') LOOP
        token := TRIM(token);
        IF LENGTH(token) = 0 THEN
            CONTINUE;
        END IF;

        IF LEFT(token, 1) = '-' AND LENGTH(token) > 1 THEN
            -- Exclusion term
            exclude_words := array_append(exclude_words, SUBSTRING(token FROM 2));
        ELSE
            -- Regular include word
            include_words := array_append(include_words, token);
        END IF;
    END LOOP;

    -- Find the longest term for FTS index scan (from phrases first, then words)
    longest_term := '';

    -- Check phrases for longest single word (for GIN index)
    FOREACH phrase IN ARRAY include_phrases LOOP
        FOREACH word IN ARRAY string_to_array(phrase, ' ') LOOP
            IF LENGTH(word) > LENGTH(longest_term) THEN
                longest_term := word;
            END IF;
        END LOOP;
    END LOOP;

    -- Check include words
    FOREACH word IN ARRAY include_words LOOP
        IF LENGTH(word) > LENGTH(longest_term) THEN
            longest_term := word;
        END IF;
    END LOOP;

    -- If no include terms at all, return empty
    IF LENGTH(longest_term) = 0 AND array_length(include_phrases, 1) IS NULL THEN
        RETURN;
    END IF;

    -- Build tsquery for GIN index scan
    IF LENGTH(longest_term) > 0 THEN
        longest_tsq := plainto_tsquery('simple', longest_term);
    ELSE
        -- Fallback: use first word of first phrase
        longest_term := (string_to_array(include_phrases[1], ' '))[1];
        longest_tsq := plainto_tsquery('simple', longest_term);
    END IF;

    RETURN QUERY
    WITH
    -- User-submitted torrents
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
        WHERE
          -- Must contain longest term (fast ILIKE filter)
          bt.name ILIKE '%' || longest_term || '%'
          -- Must contain ALL include words
          AND NOT EXISTS (
              SELECT 1 FROM unnest(include_words) AS iw
              WHERE bt.name NOT ILIKE '%' || iw || '%'
          )
          -- Must contain ALL quoted phrases (exact phrase match)
          AND NOT EXISTS (
              SELECT 1 FROM unnest(include_phrases) AS ip
              WHERE bt.name NOT ILIKE '%' || ip || '%'
          )
          -- Must NOT contain any exclusion words
          AND NOT EXISTS (
              SELECT 1 FROM unnest(exclude_words) AS ew
              WHERE bt.name ILIKE '%' || ew || '%'
          )
          -- Apply numeric/date filters
          AND (min_seeders IS NULL OR COALESCE(bt.seeders, 0) >= min_seeders)
          AND (max_seeders IS NULL OR COALESCE(bt.seeders, 0) <= max_seeders)
          AND (min_leechers IS NULL OR COALESCE(bt.leechers, 0) >= min_leechers)
          AND (max_leechers IS NULL OR COALESCE(bt.leechers, 0) <= max_leechers)
          AND (min_size IS NULL OR bt.total_size >= min_size)
          AND (max_size IS NULL OR bt.total_size <= max_size)
          AND (date_from IS NULL OR bt.created_at >= date_from)
          AND (date_to IS NULL OR bt.created_at <= date_to)
    ),
    -- DHT torrents: two-phase search
    dht_candidates AS (
        SELECT
            t.info_hash,
            t.name,
            t.size,
            t.files_count,
            t.created_at
        FROM torrents t
        WHERE to_tsvector('simple', t.name) @@ longest_tsq
          AND (min_size IS NULL OR t.size >= min_size)
          AND (max_size IS NULL OR t.size <= max_size)
          AND (date_from IS NULL OR t.created_at >= date_from)
          AND (date_to IS NULL OR t.created_at <= date_to)
        LIMIT 5000
    ),
    dht_filtered AS (
        SELECT dc.*
        FROM dht_candidates dc
        WHERE
          -- Must contain ALL include words
          NOT EXISTS (
              SELECT 1 FROM unnest(include_words) AS iw
              WHERE dc.name NOT ILIKE '%' || iw || '%'
          )
          -- Must contain ALL quoted phrases (exact phrase match)
          AND NOT EXISTS (
              SELECT 1 FROM unnest(include_phrases) AS ip
              WHERE dc.name NOT ILIKE '%' || ip || '%'
          )
          -- Must NOT contain any exclusion words
          AND NOT EXISTS (
              SELECT 1 FROM unnest(exclude_words) AS ew
              WHERE dc.name ILIKE '%' || ew || '%'
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
        AND (min_seeders IS NULL OR COALESCE(tts.seeders, 0) >= min_seeders)
        AND (max_seeders IS NULL OR COALESCE(tts.seeders, 0) <= max_seeders)
        AND (min_leechers IS NULL OR COALESCE(tts.leechers, 0) >= min_leechers)
        AND (max_leechers IS NULL OR COALESCE(tts.leechers, 0) <= max_leechers)
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
