-- Schedule the exact torrent count added in 20260906132610.
--
-- Every 6 hours, offset off the hour so it does not land with everything else.
-- /api/search/stats refuses a cached count older than 24h and falls back to the
-- planner estimate, so a stopped job degrades rather than freezing the number.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule first so re-running this migration is idempotent.
SELECT cron.unschedule('refresh-dht-torrent-count')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-dht-torrent-count');

SELECT cron.schedule(
  'refresh-dht-torrent-count',
  '17 */6 * * *',
  $cron$SELECT public.refresh_dht_torrent_count()$cron$
);

-- Warm the cache immediately so the first page load after deploy gets a real
-- count instead of falling back to the estimate for up to six hours.
SELECT refresh_dht_torrent_count();
