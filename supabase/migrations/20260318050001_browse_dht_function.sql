-- Rewrite browse_dht_torrents: separate branch per sort+order combo
-- so Postgres can use btree indexes for ORDER BY + LIMIT.
--
-- The old version used CASE-based ORDER BY which prevents index usage.
-- Each branch now has a plain ORDER BY that the planner can match to an index.

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
LANGUAGE plpgsql STABLE
SET statement_timeout = '15s'
AS $$
BEGIN
    -- SEEDERS DESC (most common — default)
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.s DESC
        LIMIT result_limit OFFSET result_offset;

    -- SEEDERS ASC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.s ASC
        LIMIT result_limit OFFSET result_offset;

    -- LEECHERS DESC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.l DESC
        LIMIT result_limit OFFSET result_offset;

    -- LEECHERS ASC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.l ASC
        LIMIT result_limit OFFSET result_offset;

    -- DATE DESC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY s.tcreated DESC
        LIMIT result_limit OFFSET result_offset;

    -- DATE ASC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY s.tcreated ASC
        LIMIT result_limit OFFSET result_offset;

    -- SIZE DESC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY s.tsize DESC
        LIMIT result_limit OFFSET result_offset;

    -- SIZE ASC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY s.tsize ASC
        LIMIT result_limit OFFSET result_offset;

    -- NAME ASC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY s.tname ASC
        LIMIT result_limit OFFSET result_offset;

    -- NAME DESC
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY s.tname DESC
        LIMIT result_limit OFFSET result_offset;

    ELSE
        -- Default fallback: seeders desc
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
        WHERE (filter_category IS NULL OR tc.content_type::TEXT = filter_category)
        ORDER BY top.s DESC
        LIMIT result_limit OFFSET result_offset;
    END IF;
END;
$$;
