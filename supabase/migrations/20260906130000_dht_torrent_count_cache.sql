-- Accurate DHT torrent count, and an ANALYZE cadence that keeps the estimate honest.
--
-- The count shown on /search came from PostgREST's `count: 'estimated'`, which is
-- the planner's row estimate: `reltuples` from the last ANALYZE, scaled by how much
-- the table has grown in *pages* since. Two things made that drift badly high:
--
--   1. autovacuum_analyze_scale_factor defaults to 0.1, so on an 18.6M-row table
--      ANALYZE only runs after ~1.86M new rows. At the crawl rate (~250k/week)
--      that is one ANALYZE every seven weeks; the estimate free-runs in between.
--   2. autovacuum had not run since 2026-07-02, so dead tuples inflated relpages
--      faster than live rows grew, and the page-scaled estimate overshot.
--
-- Measured 2026-09-06: the page displayed ~19,000,000 while the table actually
-- held 17,411,578 (9% high). The 2026-08-25 autoanalyze snapped it back down to
-- 18.6M, which read as the index *losing* 400k torrents when it had in fact
-- gained 1.19M that month.
--
-- Fix is two-sided: count for real on a schedule and serve that, and make ANALYZE
-- frequent enough that the fallback estimate stays close when the cache is cold.

-- 1. Cache table ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bt_torrent_count_cache (
  id           TEXT PRIMARY KEY,                    -- 'dht'
  exact_count  BIGINT NOT NULL,
  counted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms  INTEGER                              -- how long the COUNT(*) took
);

COMMENT ON TABLE bt_torrent_count_cache IS
  'Periodic exact COUNT(*) of large tables. Read by /api/search/stats so the site '
  'never has to run an 18M-row count in a request, and never has to show a planner estimate.';

ALTER TABLE bt_torrent_count_cache ENABLE ROW LEVEL SECURITY;

-- The torrent total is public information, already rendered on /search.
DROP POLICY IF EXISTS "Torrent count cache is publicly readable" ON bt_torrent_count_cache;
CREATE POLICY "Torrent count cache is publicly readable"
  ON bt_torrent_count_cache FOR SELECT
  USING (true);

-- 2. Refresh function -------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_dht_torrent_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count   BIGINT;
  v_started TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- The API role's statement_timeout is far below what an 18M-row count needs;
  -- this runs from pg_cron, off the request path, so it can take its time.
  SET LOCAL statement_timeout = '600s';

  SELECT count(*) INTO v_count FROM public.torrents;

  INSERT INTO bt_torrent_count_cache (id, exact_count, counted_at, duration_ms)
  VALUES (
    'dht',
    v_count,
    NOW(),
    (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::INTEGER
  )
  ON CONFLICT (id) DO UPDATE
    SET exact_count = EXCLUDED.exact_count,
        counted_at  = EXCLUDED.counted_at,
        duration_ms = EXCLUDED.duration_ms;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION refresh_dht_torrent_count() IS
  'Counts public.torrents exactly and upserts the result into bt_torrent_count_cache. Scheduled by pg_cron.';

-- 3. ANALYZE cadence on the crawled table -----------------------------------
-- ~0.2% + 20k rows means ANALYZE roughly every 57k inserts (about every 1.5 days
-- at the current crawl rate) instead of every seven weeks. ANALYZE samples 30k
-- rows regardless of table size, so this is cheap.
-- The vacuum floor is loosened too: it keeps relpages (and therefore the scaled
-- estimate, and the visibility map) from drifting the way it did through August.

ALTER TABLE public.torrents SET (
  autovacuum_analyze_scale_factor = 0.002,
  autovacuum_analyze_threshold    = 20000,
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 50000
);

-- 4. Schedule ---------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Every 6 hours. Unschedule first so re-running the migration is idempotent.
SELECT cron.unschedule('refresh-dht-torrent-count')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-dht-torrent-count');

SELECT cron.schedule(
  'refresh-dht-torrent-count',
  '17 */6 * * *',
  $cron$SELECT public.refresh_dht_torrent_count()$cron$
);

-- 5. Seed it now so the cache is warm the moment this lands ------------------

SELECT refresh_dht_torrent_count();
