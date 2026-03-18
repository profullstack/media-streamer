-- Fix sorting indexes for /search and /dht pages
-- Must NOT run inside a transaction (CONCURRENTLY requires it)
--
-- Root cause: indexes with wrong NULLS ordering didn't match ORDER BY clauses,
-- causing full seq scans on 9.4M rows. Also duplicate indexes wasting space.

-- ============================================================
-- bt_torrents indexes (for /search user source sorting)
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bt_torrents_leechers
ON bt_torrents (leechers DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bt_torrents_total_size
ON bt_torrents (total_size DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bt_torrents_name
ON bt_torrents (name);

-- ============================================================
-- torrents: fix size index to match ORDER BY t.size DESC (default NULLS FIRST)
-- ============================================================
DROP INDEX CONCURRENTLY IF EXISTS idx_torrents_size_desc_nulls_last;
DROP INDEX CONCURRENTLY IF EXISTS torrents_size_idx;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_torrents_size
ON torrents (size DESC);

-- created_at: torrents_created_at_idx (ASC) handles both directions via backward scan
DROP INDEX CONCURRENTLY IF EXISTS idx_torrents_created_at_desc_nulls_last;

-- name: keep idx_torrents_name, drop duplicates
DROP INDEX CONCURRENTLY IF EXISTS idx_torrents_name_asc_nulls_last;
DROP INDEX CONCURRENTLY IF EXISTS torrents_name_idx;

-- ============================================================
-- torrents_torrent_sources
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tts_leechers_desc
ON torrents_torrent_sources (leechers DESC NULLS LAST) WHERE leechers > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tts_seeders_asc
ON torrents_torrent_sources (seeders ASC NULLS LAST);

-- Drop duplicates
DROP INDEX CONCURRENTLY IF EXISTS torrents_torrent_sources_seeders_idx;
DROP INDEX CONCURRENTLY IF EXISTS torrents_torrent_sources_info_hash_idx;
