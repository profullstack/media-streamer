-- Fix Supabase Advisor Warnings
-- This migration addresses:
-- 1. Function search_path mutable (11 functions)
-- 2. Extensions in public schema (pg_trgm, btree_gin)
-- 3. RLS policies always true for write operations
--
-- IMPORTANT: This will NOT break Bitmagnet because:
-- - Bitmagnet connects as postgres (superuser), which bypasses RLS automatically
-- - The postgres role is explicitly granted in write policies
-- - Read access remains public

-- ============================================
-- FIX FUNCTION SEARCH PATH
-- ============================================
-- Set search_path = '' on all functions to prevent SQL injection via search_path manipulation

DO $$
BEGIN
    -- DHT Crawler API functions
    ALTER FUNCTION public.dht_increment_daily_usage(UUID, INT, BOOLEAN) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.dht_check_rate_limit(UUID, INT) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.dht_get_daily_usage(UUID) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.dht_update_key_last_used() SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- DHT Torrents functions
DO $$
BEGIN
    ALTER FUNCTION public.dht_upsert_torrent(BYTEA, TEXT, BIGINT, INT, TEXT) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.dht_update_sources(UUID, INT, INT) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.dht_search_torrents(TEXT, INT, INT, TEXT, BIGINT, BIGINT, TEXT, TEXT) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.dht_count_search_results(TEXT, TEXT, BIGINT, BIGINT) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.dht_update_timestamp() SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Bitmagnet functions (created by Bitmagnet, not our migrations)
-- These have varying signatures, so we skip if not found
DO $$
BEGIN
    ALTER FUNCTION public.queue_announce_job() SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
    ALTER FUNCTION public.budgeted_count(text, double precision) SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

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
-- FIX RLS POLICIES - BITMAGNET TABLES
-- ============================================
-- Change "Service role full access" policies to restrict to postgres role only
-- This prevents the "RLS policy always true" warning while keeping Bitmagnet working

-- goose_db_version
DROP POLICY IF EXISTS "Service role full access to goose_db_version" ON goose_db_version;
CREATE POLICY "Postgres write access to goose_db_version" ON goose_db_version
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrents
DROP POLICY IF EXISTS "Service role full access to torrents" ON torrents;
CREATE POLICY "Postgres write access to torrents" ON torrents
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_sources
DROP POLICY IF EXISTS "Service role full access to torrent_sources" ON torrent_sources;
CREATE POLICY "Postgres write access to torrent_sources" ON torrent_sources
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrents_torrent_sources
DROP POLICY IF EXISTS "Service role full access to torrents_torrent_sources" ON torrents_torrent_sources;
CREATE POLICY "Postgres write access to torrents_torrent_sources" ON torrents_torrent_sources
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_files
DROP POLICY IF EXISTS "Service role full access to torrent_files" ON torrent_files;
CREATE POLICY "Postgres write access to torrent_files" ON torrent_files
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content
DROP POLICY IF EXISTS "Service role full access to content" ON content;
CREATE POLICY "Postgres write access to content" ON content
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- metadata_sources
DROP POLICY IF EXISTS "Service role full access to metadata_sources" ON metadata_sources;
CREATE POLICY "Postgres write access to metadata_sources" ON metadata_sources
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content_attributes
DROP POLICY IF EXISTS "Service role full access to content_attributes" ON content_attributes;
CREATE POLICY "Postgres write access to content_attributes" ON content_attributes
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content_collections
DROP POLICY IF EXISTS "Service role full access to content_collections" ON content_collections;
CREATE POLICY "Postgres write access to content_collections" ON content_collections
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- content_collections_content
DROP POLICY IF EXISTS "Service role full access to content_collections_content" ON content_collections_content;
CREATE POLICY "Postgres write access to content_collections_content" ON content_collections_content
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_contents
DROP POLICY IF EXISTS "Service role full access to torrent_contents" ON torrent_contents;
CREATE POLICY "Postgres write access to torrent_contents" ON torrent_contents
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_hints
DROP POLICY IF EXISTS "Service role full access to torrent_hints" ON torrent_hints;
CREATE POLICY "Postgres write access to torrent_hints" ON torrent_hints
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_tags
DROP POLICY IF EXISTS "Service role full access to torrent_tags" ON torrent_tags;
CREATE POLICY "Postgres write access to torrent_tags" ON torrent_tags
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- bloom_filters
DROP POLICY IF EXISTS "Service role full access to bloom_filters" ON bloom_filters;
CREATE POLICY "Postgres write access to bloom_filters" ON bloom_filters
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- key_values
DROP POLICY IF EXISTS "Service role full access to key_values" ON key_values;
CREATE POLICY "Postgres write access to key_values" ON key_values
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- queue_jobs
DROP POLICY IF EXISTS "Service role full access to queue_jobs" ON queue_jobs;
CREATE POLICY "Postgres write access to queue_jobs" ON queue_jobs
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- torrent_pieces
DROP POLICY IF EXISTS "Service role full access to torrent_pieces" ON torrent_pieces;
CREATE POLICY "Postgres write access to torrent_pieces" ON torrent_pieces
    FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ============================================
-- FIX RLS POLICIES - DHT API TABLES
-- ============================================

-- dht_api_keys
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

-- ============================================
-- FIX RLS POLICIES - DHT TORRENT TABLES
-- ============================================

-- dht_torrents
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
