-- DHT Torrents Tables
-- This migration creates tables for storing DHT-discovered torrents
-- These tables are populated by the Bitmagnet crawler

-- ============================================
-- DHT TORRENTS TABLE
-- ============================================
-- Main table for torrents discovered via DHT
CREATE TABLE IF NOT EXISTS dht_torrents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    info_hash BYTEA NOT NULL UNIQUE,      -- 20 bytes infohash
    name TEXT NOT NULL,
    size BIGINT,                          -- Total size in bytes
    files_count INT DEFAULT 0,

    -- Categorization (inferred from files)
    category TEXT CHECK (category IN ('video', 'audio', 'software', 'ebook', 'other')),

    -- Timestamps
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Full-text search
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(name, ''))
    ) STORED
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dht_torrents_info_hash ON dht_torrents(info_hash);
CREATE INDEX IF NOT EXISTS idx_dht_torrents_name ON dht_torrents(name);
CREATE INDEX IF NOT EXISTS idx_dht_torrents_category ON dht_torrents(category);
CREATE INDEX IF NOT EXISTS idx_dht_torrents_discovered_at ON dht_torrents(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_dht_torrents_size ON dht_torrents(size);
CREATE INDEX IF NOT EXISTS idx_dht_torrents_search ON dht_torrents USING GIN(search_vector);

-- ============================================
-- DHT TORRENT FILES TABLE
-- ============================================
-- Files within each torrent
CREATE TABLE IF NOT EXISTS dht_torrent_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    torrent_id UUID REFERENCES dht_torrents(id) ON DELETE CASCADE NOT NULL,
    file_index INT NOT NULL,
    path TEXT NOT NULL,
    size BIGINT NOT NULL,

    UNIQUE(torrent_id, file_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dht_torrent_files_torrent_id ON dht_torrent_files(torrent_id);

-- ============================================
-- DHT TORRENT SOURCES TABLE
-- ============================================
-- DHT scrape data (seeders/leechers)
CREATE TABLE IF NOT EXISTS dht_torrent_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    torrent_id UUID REFERENCES dht_torrents(id) ON DELETE CASCADE NOT NULL,
    seeders INT DEFAULT 0,
    leechers INT DEFAULT 0,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),

    -- Only keep latest scrape per torrent
    UNIQUE(torrent_id)
);

-- Index for scrape freshness
CREATE INDEX IF NOT EXISTS idx_dht_torrent_sources_scraped_at ON dht_torrent_sources(scraped_at DESC);

-- ============================================
-- VIEWS FOR API
-- ============================================

-- Main search view with aggregated data
CREATE OR REPLACE VIEW v_dht_torrents AS
SELECT
    encode(t.info_hash, 'hex') as infohash,
    t.name,
    t.size,
    t.files_count,
    t.category,
    t.discovered_at,
    t.updated_at,
    t.search_vector,
    COALESCE(s.seeders, 0) as seeders,
    COALESCE(s.leechers, 0) as leechers,
    s.scraped_at as last_scraped,
    -- Build magnet URI
    'magnet:?xt=urn:btih:' || encode(t.info_hash, 'hex') || '&dn=' ||
        replace(replace(t.name, ' ', '+'), '''', '%27') as magnet
FROM dht_torrents t
LEFT JOIN dht_torrent_sources s ON s.torrent_id = t.id;

-- Statistics view
CREATE OR REPLACE VIEW v_dht_stats AS
SELECT
    COUNT(*) as total_torrents,
    SUM(size) as total_size_bytes,
    COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '24 hours') as torrents_24h,
    COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '7 days') as torrents_7d,
    COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '30 days') as torrents_30d,
    MAX(discovered_at) as last_indexed_at
FROM dht_torrents;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Insert or update torrent (upsert)
CREATE OR REPLACE FUNCTION dht_upsert_torrent(
    p_info_hash BYTEA,
    p_name TEXT,
    p_size BIGINT DEFAULT NULL,
    p_files_count INT DEFAULT 0,
    p_category TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO dht_torrents (info_hash, name, size, files_count, category)
    VALUES (p_info_hash, p_name, p_size, p_files_count, p_category)
    ON CONFLICT (info_hash) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, dht_torrents.name),
        size = COALESCE(EXCLUDED.size, dht_torrents.size),
        files_count = COALESCE(EXCLUDED.files_count, dht_torrents.files_count),
        category = COALESCE(EXCLUDED.category, dht_torrents.category),
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Update seeders/leechers count
CREATE OR REPLACE FUNCTION dht_update_sources(
    p_torrent_id UUID,
    p_seeders INT,
    p_leechers INT
) RETURNS void AS $$
BEGIN
    INSERT INTO dht_torrent_sources (torrent_id, seeders, leechers, scraped_at)
    VALUES (p_torrent_id, p_seeders, p_leechers, NOW())
    ON CONFLICT (torrent_id) DO UPDATE SET
        seeders = EXCLUDED.seeders,
        leechers = EXCLUDED.leechers,
        scraped_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Search function using full-text search
CREATE OR REPLACE FUNCTION dht_search_torrents(
    p_query TEXT,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0,
    p_category TEXT DEFAULT NULL,
    p_min_size BIGINT DEFAULT NULL,
    p_max_size BIGINT DEFAULT NULL,
    p_sort TEXT DEFAULT 'date',
    p_order TEXT DEFAULT 'desc'
) RETURNS TABLE (
    infohash TEXT,
    name TEXT,
    size BIGINT,
    size_formatted TEXT,
    files_count INT,
    category TEXT,
    seeders INT,
    leechers INT,
    discovered_at TIMESTAMPTZ,
    magnet TEXT,
    relevance REAL
) AS $$
DECLARE
    v_tsquery TSQUERY;
BEGIN
    -- Parse search query
    v_tsquery := plainto_tsquery('english', p_query);

    RETURN QUERY
    SELECT
        v.infohash,
        v.name,
        v.size,
        CASE
            WHEN v.size IS NULL THEN 'Unknown'
            WHEN v.size < 1024 THEN v.size || ' B'
            WHEN v.size < 1024*1024 THEN ROUND(v.size/1024.0, 2) || ' KB'
            WHEN v.size < 1024*1024*1024 THEN ROUND(v.size/1024.0/1024.0, 2) || ' MB'
            ELSE ROUND(v.size/1024.0/1024.0/1024.0, 2) || ' GB'
        END as size_formatted,
        v.files_count,
        v.category,
        v.seeders,
        v.leechers,
        v.discovered_at,
        v.magnet,
        ts_rank(v.search_vector, v_tsquery) as relevance
    FROM v_dht_torrents v
    WHERE v.search_vector @@ v_tsquery
        AND (p_category IS NULL OR v.category = p_category)
        AND (p_min_size IS NULL OR v.size >= p_min_size)
        AND (p_max_size IS NULL OR v.size <= p_max_size)
    ORDER BY
        CASE WHEN p_sort = 'date' AND p_order = 'desc' THEN v.discovered_at END DESC,
        CASE WHEN p_sort = 'date' AND p_order = 'asc' THEN v.discovered_at END ASC,
        CASE WHEN p_sort = 'size' AND p_order = 'desc' THEN v.size END DESC,
        CASE WHEN p_sort = 'size' AND p_order = 'asc' THEN v.size END ASC,
        CASE WHEN p_sort = 'seeders' AND p_order = 'desc' THEN v.seeders END DESC,
        CASE WHEN p_sort = 'seeders' AND p_order = 'asc' THEN v.seeders END ASC,
        CASE WHEN p_sort = 'relevance' AND p_order = 'desc' THEN ts_rank(v.search_vector, v_tsquery) END DESC,
        CASE WHEN p_sort = 'relevance' AND p_order = 'asc' THEN ts_rank(v.search_vector, v_tsquery) END ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- Count search results
CREATE OR REPLACE FUNCTION dht_count_search_results(
    p_query TEXT,
    p_category TEXT DEFAULT NULL,
    p_min_size BIGINT DEFAULT NULL,
    p_max_size BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
    SELECT COUNT(*)
    FROM v_dht_torrents v
    WHERE v.search_vector @@ plainto_tsquery('english', p_query)
        AND (p_category IS NULL OR v.category = p_category)
        AND (p_min_size IS NULL OR v.size >= p_min_size)
        AND (p_max_size IS NULL OR v.size <= p_max_size);
$$ LANGUAGE sql STABLE;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at on torrent changes
CREATE OR REPLACE FUNCTION dht_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dht_torrents_updated_at
    BEFORE UPDATE ON dht_torrents
    FOR EACH ROW
    EXECUTE FUNCTION dht_update_timestamp();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE dht_torrents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dht_torrent_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE dht_torrent_sources ENABLE ROW LEVEL SECURITY;

-- Allow public read access (API will filter)
CREATE POLICY "Public read access to dht_torrents" ON dht_torrents
    FOR SELECT USING (true);

CREATE POLICY "Service role full access to dht_torrents" ON dht_torrents
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read access to dht_torrent_files" ON dht_torrent_files
    FOR SELECT USING (true);

CREATE POLICY "Service role full access to dht_torrent_files" ON dht_torrent_files
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read access to dht_torrent_sources" ON dht_torrent_sources
    FOR SELECT USING (true);

CREATE POLICY "Service role full access to dht_torrent_sources" ON dht_torrent_sources
    FOR ALL USING (true) WITH CHECK (true);
