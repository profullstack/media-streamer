-- Fix browse_dht_torrents: add missing sort cases (size, name, leechers asc)
-- and use CTE subqueries to avoid expensive LEFT JOINs on 6.4M row table
CREATE OR REPLACE FUNCTION public.browse_dht_torrents(
    result_limit integer DEFAULT 50,
    result_offset integer DEFAULT 0,
    sort_by text DEFAULT 'seeders',
    sort_order text DEFAULT 'desc',
    filter_category text DEFAULT NULL
)
RETURNS TABLE(
    id text, infohash text, name text, magnet_uri text,
    size bigint, files_count integer, seeders integer, leechers integer,
    created_at timestamptz, content_type text, source text
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    -- SEEDERS DESC (most common)
    IF sort_by = 'seeders' AND sort_order = 'desc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            WHERE tts.seeders > 0
            ORDER BY tts.seeders DESC NULLS LAST
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.s DESC NULLS LAST
        LIMIT result_limit OFFSET result_offset;

    -- SEEDERS ASC
    ELSIF sort_by = 'seeders' AND sort_order = 'asc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            ORDER BY tts.seeders ASC NULLS LAST
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.s ASC NULLS LAST
        LIMIT result_limit OFFSET result_offset;

    -- LEECHERS DESC
    ELSIF sort_by = 'leechers' AND sort_order = 'desc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            ORDER BY tts.leechers DESC NULLS LAST
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.l DESC NULLS LAST
        LIMIT result_limit OFFSET result_offset;

    -- LEECHERS ASC
    ELSIF sort_by = 'leechers' AND sort_order = 'asc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            ORDER BY tts.leechers ASC NULLS LAST
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.l ASC NULLS LAST
        LIMIT result_limit OFFSET result_offset;

    -- SIZE/DATE/NAME: subquery on torrents table, then join metadata
    ELSIF sort_by IN ('size', 'date', 'name') THEN
        RETURN QUERY
        WITH sorted AS (
            SELECT t.info_hash, t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles, t.created_at AS tcreated
            FROM torrents t
            ORDER BY
                CASE WHEN sort_by = 'size' AND sort_order = 'desc' THEN t.size END DESC NULLS LAST,
                CASE WHEN sort_by = 'size' AND sort_order = 'asc'  THEN t.size END ASC NULLS LAST,
                CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN t.created_at END DESC NULLS LAST,
                CASE WHEN sort_by = 'date' AND sort_order = 'asc'  THEN t.created_at END ASC NULLS LAST,
                CASE WHEN sort_by = 'name' AND sort_order = 'asc'  THEN t.name END ASC NULLS LAST,
                CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN t.name END DESC NULLS LAST
            LIMIT result_limit + result_offset
        )
        SELECT encode(s.info_hash,'hex')::TEXT, encode(s.info_hash,'hex')::TEXT, s.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(s.info_hash,'hex')||'&dn='||encode(s.tname::bytea,'escape'))::TEXT,
            s.tsize, s.tfiles, COALESCE(tts.seeders,0), COALESCE(tts.leechers,0),
            s.tcreated::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM sorted s
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = s.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = s.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY
            CASE WHEN sort_by = 'size' AND sort_order = 'desc' THEN s.tsize END DESC NULLS LAST,
            CASE WHEN sort_by = 'size' AND sort_order = 'asc'  THEN s.tsize END ASC NULLS LAST,
            CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN s.tcreated END DESC NULLS LAST,
            CASE WHEN sort_by = 'date' AND sort_order = 'asc'  THEN s.tcreated END ASC NULLS LAST,
            CASE WHEN sort_by = 'name' AND sort_order = 'asc'  THEN s.tname END ASC NULLS LAST,
            CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN s.tname END DESC NULLS LAST
        LIMIT result_limit OFFSET result_offset;

    ELSE
        -- Default: seeders desc
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            WHERE tts.seeders > 0
            ORDER BY tts.seeders DESC NULLS LAST
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.s DESC NULLS LAST
        LIMIT result_limit OFFSET result_offset;
    END IF;
END;
$$;
