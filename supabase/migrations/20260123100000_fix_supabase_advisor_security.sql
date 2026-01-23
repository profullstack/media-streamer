-- Fix Supabase Advisor Security Issues
-- This migration addresses:
-- 1. Security Definer Views (v_dht_torrents, v_dht_stats)
-- 2. RLS Disabled on Bitmagnet tables
-- 3. Function search_path mutable (11 functions)
-- 4. Extensions in public schema
-- 5. RLS policies always true for write operations
--
-- IMPORTANT: This will NOT break Bitmagnet because:
-- - Bitmagnet connects as postgres (superuser), which bypasses RLS automatically
-- - The postgres role is explicitly granted in write policies
-- - Read access remains public

-- ============================================
-- FIX FUNCTION SEARCH PATH
-- ============================================
-- Set search_path = '' on all functions to prevent SQL injection via search_path manipulation

-- DHT Crawler API functions
ALTER FUNCTION IF EXISTS public.dht_increment_daily_usage(UUID, INT, BOOLEAN) SET search_path = '';
ALTER FUNCTION IF EXISTS public.dht_check_rate_limit(UUID, INT) SET search_path = '';
ALTER FUNCTION IF EXISTS public.dht_get_daily_usage(UUID) SET search_path = '';
ALTER FUNCTION IF EXISTS public.dht_update_key_last_used() SET search_path = '';

-- DHT Torrents functions
ALTER FUNCTION IF EXISTS public.dht_upsert_torrent(BYTEA, TEXT, BIGINT, INT, TEXT) SET search_path = '';
ALTER FUNCTION IF EXISTS public.dht_update_sources(UUID, INT, INT) SET search_path = '';
ALTER FUNCTION IF EXISTS public.dht_search_torrents(TEXT, INT, INT, TEXT, BIGINT, BIGINT, TEXT, TEXT) SET search_path = '';
ALTER FUNCTION IF EXISTS public.dht_count_search_results(TEXT, TEXT, BIGINT, BIGINT) SET search_path = '';
ALTER FUNCTION IF EXISTS public.dht_update_timestamp() SET search_path = '';

-- Bitmagnet functions (created by Bitmagnet, not our migrations)
ALTER FUNCTION IF EXISTS public.queue_announce_job() SET search_path = '';
ALTER FUNCTION IF EXISTS public.budgeted_count(TEXT, INT) SET search_path = '';

-- ============================================
-- MOVE EXTENSIONS TO EXTENSIONS SCHEMA
-- ============================================
-- Supabase recommends extensions be in the 'extensions' schema, not 'public'
-- Note: This drops and recreates the extension, which may briefly affect queries using these functions

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_trgm extension
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Move btree_gin extension
DROP EXTENSION IF EXISTS btree_gin CASCADE;
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;

-- ============================================
-- FIX SECURITY DEFINER VIEWS
-- ============================================
-- Recreate views with security_invoker = true to use the querying user's permissions

DROP VIEW IF EXISTS v_dht_torrents CASCADE;
DROP VIEW IF EXISTS v_dht_stats CASCADE;

-- Main search view with aggregated data
CREATE VIEW v_dht_torrents
WITH (security_invoker = true)
AS
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
CREATE VIEW v_dht_stats
WITH (security_invoker = true)
AS
SELECT
    COUNT(*) as total_torrents,
    SUM(size) as total_size_bytes,
    COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '24 hours') as torrents_24h,
    COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '7 days') as torrents_7d,
    COUNT(*) FILTER (WHERE discovered_at > NOW() - INTERVAL '30 days') as torrents_30d,
    MAX(discovered_at) as last_indexed_at
FROM dht_torrents;

-- ============================================
-- ENABLE RLS ON BITMAGNET TABLES
-- ============================================
-- These tables are created by the Bitmagnet DHT crawler
-- Enable RLS and add policies:
-- - Public read access (SELECT) for anyone
-- - Write access (INSERT/UPDATE/DELETE) only for postgres role
-- Note: postgres superuser bypasses RLS, but this makes the policy explicit

-- goose_db_version (Goose migration tool table)
ALTER TABLE IF EXISTS goose_db_version ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to goose_db_version" ON goose_db_version;
CREATE POLICY "Public read access to goose_db_version" ON goose_db_version
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to goose_db_version" ON goose_db_version;
CREATE POLICY "Postgres write access to goose_db_version" ON goose_db_version
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrents (Bitmagnet main torrents table)
ALTER TABLE IF EXISTS torrents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrents" ON torrents;
CREATE POLICY "Public read access to torrents" ON torrents
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrents" ON torrents;
CREATE POLICY "Postgres write access to torrents" ON torrents
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_sources
ALTER TABLE IF EXISTS torrent_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrent_sources" ON torrent_sources;
CREATE POLICY "Public read access to torrent_sources" ON torrent_sources
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrent_sources" ON torrent_sources;
CREATE POLICY "Postgres write access to torrent_sources" ON torrent_sources
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrents_torrent_sources (junction table)
ALTER TABLE IF EXISTS torrents_torrent_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrents_torrent_sources" ON torrents_torrent_sources;
CREATE POLICY "Public read access to torrents_torrent_sources" ON torrents_torrent_sources
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrents_torrent_sources" ON torrents_torrent_sources;
CREATE POLICY "Postgres write access to torrents_torrent_sources" ON torrents_torrent_sources
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_files
ALTER TABLE IF EXISTS torrent_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrent_files" ON torrent_files;
CREATE POLICY "Public read access to torrent_files" ON torrent_files
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrent_files" ON torrent_files;
CREATE POLICY "Postgres write access to torrent_files" ON torrent_files
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content
ALTER TABLE IF EXISTS content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to content" ON content;
CREATE POLICY "Public read access to content" ON content
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to content" ON content;
CREATE POLICY "Postgres write access to content" ON content
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- metadata_sources
ALTER TABLE IF EXISTS metadata_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to metadata_sources" ON metadata_sources;
CREATE POLICY "Public read access to metadata_sources" ON metadata_sources
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to metadata_sources" ON metadata_sources;
CREATE POLICY "Postgres write access to metadata_sources" ON metadata_sources
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content_attributes
ALTER TABLE IF EXISTS content_attributes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to content_attributes" ON content_attributes;
CREATE POLICY "Public read access to content_attributes" ON content_attributes
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to content_attributes" ON content_attributes;
CREATE POLICY "Postgres write access to content_attributes" ON content_attributes
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content_collections
ALTER TABLE IF EXISTS content_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to content_collections" ON content_collections;
CREATE POLICY "Public read access to content_collections" ON content_collections
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to content_collections" ON content_collections;
CREATE POLICY "Postgres write access to content_collections" ON content_collections
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content_collections_content
ALTER TABLE IF EXISTS content_collections_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to content_collections_content" ON content_collections_content;
CREATE POLICY "Public read access to content_collections_content" ON content_collections_content
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to content_collections_content" ON content_collections_content;
CREATE POLICY "Postgres write access to content_collections_content" ON content_collections_content
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_contents
ALTER TABLE IF EXISTS torrent_contents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrent_contents" ON torrent_contents;
CREATE POLICY "Public read access to torrent_contents" ON torrent_contents
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrent_contents" ON torrent_contents;
CREATE POLICY "Postgres write access to torrent_contents" ON torrent_contents
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_hints
ALTER TABLE IF EXISTS torrent_hints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrent_hints" ON torrent_hints;
CREATE POLICY "Public read access to torrent_hints" ON torrent_hints
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrent_hints" ON torrent_hints;
CREATE POLICY "Postgres write access to torrent_hints" ON torrent_hints
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_tags
ALTER TABLE IF EXISTS torrent_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrent_tags" ON torrent_tags;
CREATE POLICY "Public read access to torrent_tags" ON torrent_tags
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrent_tags" ON torrent_tags;
CREATE POLICY "Postgres write access to torrent_tags" ON torrent_tags
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- bloom_filters
ALTER TABLE IF EXISTS bloom_filters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to bloom_filters" ON bloom_filters;
CREATE POLICY "Public read access to bloom_filters" ON bloom_filters
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to bloom_filters" ON bloom_filters;
CREATE POLICY "Postgres write access to bloom_filters" ON bloom_filters
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- key_values
ALTER TABLE IF EXISTS key_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to key_values" ON key_values;
CREATE POLICY "Public read access to key_values" ON key_values
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to key_values" ON key_values;
CREATE POLICY "Postgres write access to key_values" ON key_values
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- queue_jobs
ALTER TABLE IF EXISTS queue_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to queue_jobs" ON queue_jobs;
CREATE POLICY "Public read access to queue_jobs" ON queue_jobs
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to queue_jobs" ON queue_jobs;
CREATE POLICY "Postgres write access to queue_jobs" ON queue_jobs
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_pieces
ALTER TABLE IF EXISTS torrent_pieces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access to torrent_pieces" ON torrent_pieces;
CREATE POLICY "Public read access to torrent_pieces" ON torrent_pieces
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access to torrent_pieces" ON torrent_pieces;
CREATE POLICY "Postgres write access to torrent_pieces" ON torrent_pieces
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ============================================
-- FIX EXISTING RLS POLICIES (from previous migrations)
-- ============================================
-- Update the existing "Service role full access" policies to use proper role restriction

-- dht_api_keys (from dht_crawler_api_tables.sql)
DROP POLICY IF EXISTS "Service role full access to dht_api_keys" ON dht_api_keys;
CREATE POLICY "Postgres write access to dht_api_keys" ON dht_api_keys
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- dht_usage_logs
DROP POLICY IF EXISTS "Service role full access to dht_usage_logs" ON dht_usage_logs;
CREATE POLICY "Postgres write access to dht_usage_logs" ON dht_usage_logs
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- dht_usage_daily
DROP POLICY IF EXISTS "Service role full access to dht_usage_daily" ON dht_usage_daily;
CREATE POLICY "Postgres write access to dht_usage_daily" ON dht_usage_daily
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- dht_rate_limits
DROP POLICY IF EXISTS "Service role full access to dht_rate_limits" ON dht_rate_limits;
CREATE POLICY "Postgres write access to dht_rate_limits" ON dht_rate_limits
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- dht_torrents (from dht_torrents_tables.sql)
DROP POLICY IF EXISTS "Service role full access to dht_torrents" ON dht_torrents;
CREATE POLICY "Postgres write access to dht_torrents" ON dht_torrents
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- dht_torrent_files
DROP POLICY IF EXISTS "Service role full access to dht_torrent_files" ON dht_torrent_files;
CREATE POLICY "Postgres write access to dht_torrent_files" ON dht_torrent_files
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- dht_torrent_sources
DROP POLICY IF EXISTS "Service role full access to dht_torrent_sources" ON dht_torrent_sources;
CREATE POLICY "Postgres write access to dht_torrent_sources" ON dht_torrent_sources
    FOR ALL TO postgres USING (true) WITH CHECK (true);
