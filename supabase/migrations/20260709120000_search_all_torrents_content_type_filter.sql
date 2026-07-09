-- Add a content-category filter (p_content_type) to search_all_torrents.
--
-- The ?type= search param was validated but never applied on the unified
-- (user + DHT) path. This adds a real filter that maps an API content category
-- to the two underlying taxonomies:
--   - DHT torrents  -> bitmagnet torrent_contents.content_type
--     (movie, tv_show, xxx, ebook, software, audiobook, comic, music)
--   - user torrents -> bt_torrents.content_type (movie, tvshow, music, book, other)
--
-- Mapping (API category -> dht types / user types):
--   video -> {movie, tv_show}   / {movie, tvshow}
--   audio -> {music, audiobook} / {music}
--   ebook -> {ebook, comic}     / {book}
--   xxx   -> {xxx}              / {}
--   other -> {software}         / {other}
--   (anything else passes through as-is, matching nothing => empty)
--
-- The filter is applied to the already-name-matched candidates (<= 5000), so it
-- adds no full-table scan. NOTE: this migration mirrors a change already applied
-- to the live database via the Supabase API on 2026-07-09.

DROP FUNCTION IF EXISTS search_all_torrents(text,integer,integer,text,text,integer,integer,integer,integer,bigint,bigint,timestamptz,timestamptz);

CREATE OR REPLACE FUNCTION public.search_all_torrents(
    search_query text,
    result_limit integer DEFAULT 50,
    result_offset integer DEFAULT 0,
    sort_by text DEFAULT 'seeders'::text,
    sort_order text DEFAULT 'desc'::text,
    min_seeders integer DEFAULT NULL::integer,
    max_seeders integer DEFAULT NULL::integer,
    min_leechers integer DEFAULT NULL::integer,
    max_leechers integer DEFAULT NULL::integer,
    min_size bigint DEFAULT NULL::bigint,
    max_size bigint DEFAULT NULL::bigint,
    date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_content_type text DEFAULT NULL::text
)
 RETURNS TABLE(id text, infohash text, name text, magnet_uri text, size bigint, files_count integer, seeders integer, leechers integer, created_at timestamp with time zone, poster_url text, cover_url text, content_type text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
    normalized_query TEXT;
    include_phrases TEXT[];
    include_words TEXT[];
    exclude_words TEXT[];
    remaining TEXT;
    phrase TEXT;
    word TEXT;
    token TEXT;
    longest_term TEXT;
    longest_tsq TSQUERY;
    dht_types TEXT[];
    user_types TEXT[];
BEGIN
    normalized_query := LOWER(TRIM(search_query));

    IF LENGTH(normalized_query) < 2 THEN
        RETURN;
    END IF;

    include_phrases := ARRAY[]::TEXT[];
    include_words := ARRAY[]::TEXT[];
    exclude_words := ARRAY[]::TEXT[];

    remaining := normalized_query;

    WHILE remaining ~ '"[^"]+"' LOOP
        phrase := (regexp_match(remaining, '"([^"]+)"'))[1];
        IF phrase IS NOT NULL AND LENGTH(TRIM(phrase)) > 0 THEN
            include_phrases := array_append(include_phrases, TRIM(phrase));
        END IF;
        remaining := regexp_replace(remaining, '"[^"]+"', ' ', 'i');
    END LOOP;

    FOREACH token IN ARRAY string_to_array(TRIM(remaining), ' ') LOOP
        token := TRIM(token);
        IF LENGTH(token) = 0 THEN
            CONTINUE;
        END IF;

        IF LEFT(token, 1) = '-' AND LENGTH(token) > 1 THEN
            exclude_words := array_append(exclude_words, SUBSTRING(token FROM 2));
        ELSE
            include_words := array_append(include_words, token);
        END IF;
    END LOOP;

    longest_term := '';

    FOREACH phrase IN ARRAY include_phrases LOOP
        FOREACH word IN ARRAY string_to_array(phrase, ' ') LOOP
            IF LENGTH(word) > LENGTH(longest_term) THEN
                longest_term := word;
            END IF;
        END LOOP;
    END LOOP;

    FOREACH word IN ARRAY include_words LOOP
        IF LENGTH(word) > LENGTH(longest_term) THEN
            longest_term := word;
        END IF;
    END LOOP;

    IF LENGTH(longest_term) = 0 AND array_length(include_phrases, 1) IS NULL THEN
        RETURN;
    END IF;

    IF LENGTH(longest_term) > 0 THEN
        longest_tsq := plainto_tsquery('simple', longest_term);
    ELSE
        longest_term := (string_to_array(include_phrases[1], ' '))[1];
        longest_tsq := plainto_tsquery('simple', longest_term);
    END IF;

    -- Resolve the content category into per-source content_type lists.
    IF p_content_type IS NOT NULL THEN
        CASE LOWER(p_content_type)
            WHEN 'video' THEN dht_types := ARRAY['movie','tv_show']; user_types := ARRAY['movie','tvshow'];
            WHEN 'audio' THEN dht_types := ARRAY['music','audiobook']; user_types := ARRAY['music'];
            WHEN 'ebook' THEN dht_types := ARRAY['ebook','comic']; user_types := ARRAY['book'];
            WHEN 'xxx'   THEN dht_types := ARRAY['xxx']; user_types := ARRAY[]::TEXT[];
            WHEN 'other' THEN dht_types := ARRAY['software']; user_types := ARRAY['other'];
            ELSE dht_types := ARRAY[LOWER(p_content_type)]; user_types := ARRAY[LOWER(p_content_type)];
        END CASE;
    END IF;

    RETURN QUERY
    WITH
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
          bt.name ILIKE '%' || longest_term || '%'
          AND NOT EXISTS (
              SELECT 1 FROM unnest(include_words) AS iw
              WHERE bt.name NOT ILIKE '%' || iw || '%'
          )
          AND NOT EXISTS (
              SELECT 1 FROM unnest(include_phrases) AS ip
              WHERE bt.name NOT ILIKE '%' || ip || '%'
          )
          AND NOT EXISTS (
              SELECT 1 FROM unnest(exclude_words) AS ew
              WHERE bt.name ILIKE '%' || ew || '%'
          )
          AND (min_seeders IS NULL OR COALESCE(bt.seeders, 0) >= min_seeders)
          AND (max_seeders IS NULL OR COALESCE(bt.seeders, 0) <= max_seeders)
          AND (min_leechers IS NULL OR COALESCE(bt.leechers, 0) >= min_leechers)
          AND (max_leechers IS NULL OR COALESCE(bt.leechers, 0) <= max_leechers)
          AND (min_size IS NULL OR bt.total_size >= min_size)
          AND (max_size IS NULL OR bt.total_size <= max_size)
          AND (date_from IS NULL OR bt.created_at >= date_from)
          AND (date_to IS NULL OR bt.created_at <= date_to)
          AND (p_content_type IS NULL OR bt.content_type = ANY(user_types))
    ),
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
          NOT EXISTS (
              SELECT 1 FROM unnest(include_words) AS iw
              WHERE dc.name NOT ILIKE '%' || iw || '%'
          )
          AND NOT EXISTS (
              SELECT 1 FROM unnest(include_phrases) AS ip
              WHERE dc.name NOT ILIKE '%' || ip || '%'
          )
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
        AND (p_content_type IS NULL OR tc.content_type = ANY(dht_types))
    ),
    combined_results AS (
        SELECT * FROM user_results
        UNION ALL
        SELECT * FROM dht_results
    )
    SELECT * FROM combined_results cr
    ORDER BY
        CASE WHEN sort_by = 'seeders' AND sort_order = 'desc' THEN cr.seeders END DESC NULLS LAST,
        CASE WHEN sort_by = 'seeders' AND sort_order = 'asc' THEN cr.seeders END ASC NULLS LAST,
        CASE WHEN sort_by = 'leechers' AND sort_order = 'desc' THEN cr.leechers END DESC NULLS LAST,
        CASE WHEN sort_by = 'leechers' AND sort_order = 'asc' THEN cr.leechers END ASC NULLS LAST,
        CASE WHEN sort_by = 'size' AND sort_order = 'desc' THEN cr.size END DESC NULLS LAST,
        CASE WHEN sort_by = 'size' AND sort_order = 'asc' THEN cr.size END ASC NULLS LAST,
        CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN cr.created_at END DESC NULLS LAST,
        CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN cr.created_at END ASC NULLS LAST,
        cr.seeders DESC NULLS LAST,
        cr.created_at DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION search_all_torrents TO anon, authenticated, service_role;
