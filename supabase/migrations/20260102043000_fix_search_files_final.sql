-- Migration: Fix the remaining search_files function with different signature
-- The original search_files has 5 parameters (TEXT, VARCHAR, UUID, INTEGER, INTEGER)
-- which is different from our 4-parameter version

-- Drop the original 5-parameter search_files function
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR(20), UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, VARCHAR, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING(20), UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_files(TEXT, CHARACTER VARYING, UUID, INTEGER, INTEGER);

-- Also drop the search_torrents_by_name and search_all with original signatures
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, VARCHAR(20), INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING(20), INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_torrents_by_name(TEXT, CHARACTER VARYING, INTEGER, INTEGER);

DROP FUNCTION IF EXISTS public.search_all(TEXT, VARCHAR(20), INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING(20), INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.search_all(TEXT, CHARACTER VARYING, INTEGER, INTEGER);

-- Recreate search_files with the original 5-parameter signature but with search_path set
CREATE OR REPLACE FUNCTION public.search_files(
    search_query TEXT,
    media_type VARCHAR(20) DEFAULT NULL,
    torrent_uuid UUID DEFAULT NULL,
    result_limit INTEGER DEFAULT 20,
    result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    file_id UUID,
    file_name TEXT,
    file_path TEXT,
    file_size BIGINT,
    file_media_category VARCHAR(20),
    file_index INTEGER,
    torrent_id UUID,
    torrent_name TEXT,
    torrent_infohash VARCHAR(40),
    rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tf.id AS file_id,
        tf.name AS file_name,
        tf.path AS file_path,
        tf.size AS file_size,
        tf.media_category AS file_media_category,
        tf.file_index,
        t.id AS torrent_id,
        t.name AS torrent_name,
        t.infohash AS torrent_infohash,
        ts_rank(tf.search_vector, plainto_tsquery('english', search_query)) AS rank
    FROM public.torrent_files tf
    JOIN public.torrents t ON tf.torrent_id = t.id
    WHERE 
        tf.search_vector @@ plainto_tsquery('english', search_query)
        AND (media_type IS NULL OR tf.media_category = media_type)
        AND (torrent_uuid IS NULL OR tf.torrent_id = torrent_uuid)
    ORDER BY rank DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;

-- Recreate search_torrents_by_name with original signature but with search_path set
CREATE OR REPLACE FUNCTION public.search_torrents_by_name(
    search_query TEXT,
    media_type VARCHAR(20) DEFAULT NULL,
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    torrent_id UUID,
    torrent_name TEXT,
    torrent_infohash VARCHAR(40),
    torrent_total_size BIGINT,
    torrent_file_count INTEGER,
    torrent_seeders INTEGER,
    torrent_leechers INTEGER,
    torrent_created_at TIMESTAMPTZ,
    rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id AS torrent_id,
        t.name AS torrent_name,
        t.infohash AS torrent_infohash,
        t.total_size AS torrent_total_size,
        t.file_count AS torrent_file_count,
        t.seeders AS torrent_seeders,
        t.leechers AS torrent_leechers,
        t.created_at AS torrent_created_at,
        ts_rank(to_tsvector('english', t.name), plainto_tsquery('english', search_query)) AS rank
    FROM public.torrents t
    WHERE 
        to_tsvector('english', t.name) @@ plainto_tsquery('english', search_query)
        AND (media_type IS NULL OR EXISTS (
            SELECT 1 FROM public.torrent_files tf 
            WHERE tf.torrent_id = t.id 
            AND tf.media_category = media_type
            LIMIT 1
        ))
    ORDER BY rank DESC, t.seeders DESC NULLS LAST
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;

-- Recreate search_all with original signature but with search_path set
CREATE OR REPLACE FUNCTION public.search_all(
    search_query TEXT,
    media_type VARCHAR(20) DEFAULT NULL,
    result_limit INTEGER DEFAULT 50,
    result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    torrent_id UUID,
    torrent_name TEXT,
    torrent_infohash VARCHAR(40),
    torrent_total_size BIGINT,
    torrent_file_count INTEGER,
    torrent_seeders INTEGER,
    torrent_leechers INTEGER,
    torrent_created_at TIMESTAMPTZ,
    match_type TEXT,
    rank REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    -- Search torrent names
    SELECT DISTINCT ON (t.id)
        t.id AS torrent_id,
        t.name AS torrent_name,
        t.infohash AS torrent_infohash,
        t.total_size AS torrent_total_size,
        t.file_count AS torrent_file_count,
        t.seeders AS torrent_seeders,
        t.leechers AS torrent_leechers,
        t.created_at AS torrent_created_at,
        'torrent_name'::TEXT AS match_type,
        ts_rank(to_tsvector('english', t.name), plainto_tsquery('english', search_query)) AS rank
    FROM public.torrents t
    WHERE 
        to_tsvector('english', t.name) @@ plainto_tsquery('english', search_query)
        AND (media_type IS NULL OR EXISTS (
            SELECT 1 FROM public.torrent_files tf 
            WHERE tf.torrent_id = t.id 
            AND tf.media_category = media_type
            LIMIT 1
        ))
    
    UNION ALL
    
    -- Search file names (return parent torrent)
    SELECT DISTINCT ON (t.id)
        t.id AS torrent_id,
        t.name AS torrent_name,
        t.infohash AS torrent_infohash,
        t.total_size AS torrent_total_size,
        t.file_count AS torrent_file_count,
        t.seeders AS torrent_seeders,
        t.leechers AS torrent_leechers,
        t.created_at AS torrent_created_at,
        'file_name'::TEXT AS match_type,
        MAX(ts_rank(tf.search_vector, plainto_tsquery('english', search_query))) AS rank
    FROM public.torrent_files tf
    JOIN public.torrents t ON tf.torrent_id = t.id
    WHERE 
        tf.search_vector @@ plainto_tsquery('english', search_query)
        AND (media_type IS NULL OR tf.media_category = media_type)
        -- Exclude torrents already matched by name
        AND NOT to_tsvector('english', t.name) @@ plainto_tsquery('english', search_query)
    GROUP BY t.id, t.name, t.infohash, t.total_size, t.file_count, t.seeders, t.leechers, t.created_at
    
    ORDER BY rank DESC, torrent_seeders DESC NULLS LAST
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;
