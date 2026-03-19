-- Fix filtered browse_dht_torrents performance.
-- The filtered path was starting from torrents (9.4M rows) with LATERAL join,
-- which is too slow even with filters. Strategy: use a two-phase approach:
-- 1. Pre-filter using indexes on torrents_torrent_sources (for seeders/leechers)
--    and torrents (for size/date) to get a small candidate set
-- 2. Join and sort the candidates

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
DECLARE
    has_filters boolean;
BEGIN
    has_filters := (min_seeders IS NOT NULL OR max_seeders IS NOT NULL
        OR min_leechers IS NOT NULL OR max_leechers IS NOT NULL
        OR min_size IS NOT NULL OR max_size IS NOT NULL
        OR date_from IS NOT NULL OR date_to IS NOT NULL
        OR filter_category IS NOT NULL);

    -- =========================================================================
    -- FILTERED PATH: Start from torrents_torrent_sources to leverage indexes,
    -- pre-filter candidates, then join for remaining fields.
    -- Cap candidate scan at 10000 to prevent full table scans.
    -- =========================================================================
    IF has_filters THEN
        RETURN QUERY
        WITH seed_candidates AS (
            -- Start from the indexed seeder/leecher table
            SELECT tts.info_hash,
                   tts.seeders AS s,
                   tts.leechers AS l
            FROM torrents_torrent_sources tts
            WHERE (min_seeders IS NULL OR tts.seeders >= min_seeders)
              AND (max_seeders IS NULL OR tts.seeders <= max_seeders)
              AND (min_leechers IS NULL OR tts.leechers >= min_leechers)
              AND (max_leechers IS NULL OR tts.leechers <= max_leechers)
            ORDER BY tts.seeders DESC
            LIMIT 10000
        ),
        filtered AS (
            SELECT sc.info_hash, sc.s, sc.l,
                   t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles,
                   t.created_at AS tcreated
            FROM seed_candidates sc
            JOIN torrents t ON t.info_hash = sc.info_hash
            WHERE (min_size IS NULL OR t.size >= min_size)
              AND (max_size IS NULL OR t.size <= max_size)
              AND (date_from IS NULL OR t.created_at >= date_from)
              AND (date_to IS NULL OR t.created_at <= date_to)
        ),
        with_category AS (
            SELECT f.*,
                   tc.content_type AS ctype
            FROM filtered f
            LEFT JOIN torrent_contents tc ON tc.info_hash = f.info_hash
            WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        )
        SELECT
            encode(wc.info_hash,'hex')::TEXT,
            encode(wc.info_hash,'hex')::TEXT,
            wc.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(wc.info_hash,'hex')||'&dn='||encode(wc.tname::bytea,'escape'))::TEXT,
            wc.tsize,
            wc.tfiles,
            COALESCE(wc.s, 0)::INTEGER,
            COALESCE(wc.l, 0)::INTEGER,
            wc.tcreated::TIMESTAMPTZ,
            wc.ctype::TEXT,
            'dht'::TEXT
        FROM with_category wc
        ORDER BY
            CASE WHEN sort_by = 'seeders' AND sort_order = 'desc' THEN wc.s END DESC NULLS LAST,
            CASE WHEN sort_by = 'seeders' AND sort_order = 'asc' THEN wc.s END ASC NULLS LAST,
            CASE WHEN sort_by = 'leechers' AND sort_order = 'desc' THEN wc.l END DESC NULLS LAST,
            CASE WHEN sort_by = 'leechers' AND sort_order = 'asc' THEN wc.l END ASC NULLS LAST,
            CASE WHEN sort_by = 'size' AND sort_order = 'desc' THEN wc.tsize END DESC NULLS LAST,
            CASE WHEN sort_by = 'size' AND sort_order = 'asc' THEN wc.tsize END ASC NULLS LAST,
            CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN wc.tcreated END DESC NULLS LAST,
            CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN wc.tcreated END ASC NULLS LAST,
            CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN wc.tname END ASC NULLS LAST,
            CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN wc.tname END DESC NULLS LAST,
            wc.s DESC NULLS LAST
        LIMIT result_limit
        OFFSET result_offset;
        RETURN;
    END IF;

    -- =========================================================================
    -- FAST PATH: No filters — use per-branch queries for index scans.
    -- =========================================================================

    IF sort_by = 'seeders' AND sort_order = 'desc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            WHERE tts.seeders > 0
            ORDER BY tts.seeders DESC
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        ORDER BY top.s DESC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'seeders' AND sort_order = 'asc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            ORDER BY tts.seeders ASC
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        ORDER BY top.s ASC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'leechers' AND sort_order = 'desc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            WHERE tts.leechers > 0
            ORDER BY tts.leechers DESC
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        ORDER BY top.l DESC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'leechers' AND sort_order = 'asc' THEN
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            ORDER BY tts.leechers ASC
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        ORDER BY top.l ASC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'date' AND sort_order = 'desc' THEN
        RETURN QUERY
        WITH sorted AS (
            SELECT t.info_hash, t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles, t.created_at AS tcreated
            FROM torrents t
            ORDER BY t.created_at DESC
            LIMIT result_limit + result_offset
        )
        SELECT encode(s.info_hash,'hex')::TEXT, encode(s.info_hash,'hex')::TEXT, s.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(s.info_hash,'hex')||'&dn='||encode(s.tname::bytea,'escape'))::TEXT,
            s.tsize, s.tfiles, COALESCE(tts.seeders,0), COALESCE(tts.leechers,0),
            s.tcreated::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM sorted s
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = s.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = s.info_hash
        ORDER BY s.tcreated DESC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'date' AND sort_order = 'asc' THEN
        RETURN QUERY
        WITH sorted AS (
            SELECT t.info_hash, t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles, t.created_at AS tcreated
            FROM torrents t
            ORDER BY t.created_at ASC
            LIMIT result_limit + result_offset
        )
        SELECT encode(s.info_hash,'hex')::TEXT, encode(s.info_hash,'hex')::TEXT, s.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(s.info_hash,'hex')||'&dn='||encode(s.tname::bytea,'escape'))::TEXT,
            s.tsize, s.tfiles, COALESCE(tts.seeders,0), COALESCE(tts.leechers,0),
            s.tcreated::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM sorted s
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = s.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = s.info_hash
        ORDER BY s.tcreated ASC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'size' AND sort_order = 'desc' THEN
        RETURN QUERY
        WITH sorted AS (
            SELECT t.info_hash, t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles, t.created_at AS tcreated
            FROM torrents t
            ORDER BY t.size DESC
            LIMIT result_limit + result_offset
        )
        SELECT encode(s.info_hash,'hex')::TEXT, encode(s.info_hash,'hex')::TEXT, s.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(s.info_hash,'hex')||'&dn='||encode(s.tname::bytea,'escape'))::TEXT,
            s.tsize, s.tfiles, COALESCE(tts.seeders,0), COALESCE(tts.leechers,0),
            s.tcreated::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM sorted s
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = s.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = s.info_hash
        ORDER BY s.tsize DESC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'size' AND sort_order = 'asc' THEN
        RETURN QUERY
        WITH sorted AS (
            SELECT t.info_hash, t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles, t.created_at AS tcreated
            FROM torrents t
            ORDER BY t.size ASC
            LIMIT result_limit + result_offset
        )
        SELECT encode(s.info_hash,'hex')::TEXT, encode(s.info_hash,'hex')::TEXT, s.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(s.info_hash,'hex')||'&dn='||encode(s.tname::bytea,'escape'))::TEXT,
            s.tsize, s.tfiles, COALESCE(tts.seeders,0), COALESCE(tts.leechers,0),
            s.tcreated::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM sorted s
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = s.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = s.info_hash
        ORDER BY s.tsize ASC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'name' AND sort_order = 'asc' THEN
        RETURN QUERY
        WITH sorted AS (
            SELECT t.info_hash, t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles, t.created_at AS tcreated
            FROM torrents t
            ORDER BY t.name ASC
            LIMIT result_limit + result_offset
        )
        SELECT encode(s.info_hash,'hex')::TEXT, encode(s.info_hash,'hex')::TEXT, s.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(s.info_hash,'hex')||'&dn='||encode(s.tname::bytea,'escape'))::TEXT,
            s.tsize, s.tfiles, COALESCE(tts.seeders,0), COALESCE(tts.leechers,0),
            s.tcreated::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM sorted s
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = s.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = s.info_hash
        ORDER BY s.tname ASC
        LIMIT result_limit OFFSET result_offset;

    ELSIF sort_by = 'name' AND sort_order = 'desc' THEN
        RETURN QUERY
        WITH sorted AS (
            SELECT t.info_hash, t.name AS tname, t.size AS tsize,
                   COALESCE(t.files_count, 0) AS tfiles, t.created_at AS tcreated
            FROM torrents t
            ORDER BY t.name DESC
            LIMIT result_limit + result_offset
        )
        SELECT encode(s.info_hash,'hex')::TEXT, encode(s.info_hash,'hex')::TEXT, s.tname::TEXT,
            ('magnet:?xt=urn:btih:'||encode(s.info_hash,'hex')||'&dn='||encode(s.tname::bytea,'escape'))::TEXT,
            s.tsize, s.tfiles, COALESCE(tts.seeders,0), COALESCE(tts.leechers,0),
            s.tcreated::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM sorted s
        LEFT JOIN torrents_torrent_sources tts ON tts.info_hash = s.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = s.info_hash
        ORDER BY s.tname DESC
        LIMIT result_limit OFFSET result_offset;

    ELSE
        RETURN QUERY
        WITH top AS (
            SELECT tts.info_hash, tts.seeders AS s, tts.leechers AS l
            FROM torrents_torrent_sources tts
            WHERE tts.seeders > 0
            ORDER BY tts.seeders DESC
            LIMIT result_limit + result_offset
        )
        SELECT encode(t.info_hash,'hex')::TEXT, encode(t.info_hash,'hex')::TEXT, t.name::TEXT,
            ('magnet:?xt=urn:btih:'||encode(t.info_hash,'hex')||'&dn='||encode(t.name::bytea,'escape'))::TEXT,
            t.size, COALESCE(t.files_count,0), COALESCE(top.s,0)::INTEGER, COALESCE(top.l,0)::INTEGER,
            t.created_at::TIMESTAMPTZ, tc.content_type::TEXT, 'dht'::TEXT
        FROM top
        JOIN torrents t ON t.info_hash = top.info_hash
        LEFT JOIN torrent_contents tc ON tc.info_hash = t.info_hash
        ORDER BY top.s DESC
        LIMIT result_limit OFFSET result_offset;
    END IF;
END;
$$;
