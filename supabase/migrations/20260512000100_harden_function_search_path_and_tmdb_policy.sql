-- Address Supabase linter findings (2026-05-12):
--   * function_search_path_mutable — pin search_path on flagged public funcs
--   * rls_policy_always_true     — drop permissive tmdb_data write policy
--                                  and restore the service-role-scoped one
--
-- A mutable search_path on a SECURITY DEFINER function (or any function
-- callable from less-trusted roles) lets a caller shadow built-in objects
-- via a temp schema and hijack the function's behavior. Pinning to
-- (public, pg_temp) closes that vector.

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on flagged functions. Iterate by name so this handles
--    overloads (browse_dht_torrents has two registered signatures) without
--    needing exact argument lists.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT
            n.nspname AS schema_name,
            p.proname AS func_name,
            pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'list_torrents_page',
              'list_torrents_month_page',
              'browse_dht_torrents',
              'lookup_dht_imdb_match',
              'lookup_dht_imdb_matches',
              'expire_stale_subscriptions',
              'clean_torrent_title'
          )
    LOOP
        EXECUTE format(
            'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
            r.schema_name, r.func_name, r.args
        );
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Replace the permissive ALL-policy on tmdb_data with a service-role
--    scoped one. The live DB has a policy `tmdb_cache_service_write` with
--    USING(true) WITH CHECK(true) — that effectively disables RLS for the
--    table's write surface. Drop it (and any earlier-named variant) and
--    recreate the scoped policy from the original migration intent.
--    The pre-existing `tmdb_data_public_read` (FOR SELECT USING (true)) is
--    intentional and is left in place.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tmdb_cache_service_write ON public.tmdb_data;
DROP POLICY IF EXISTS tmdb_data_service_write  ON public.tmdb_data;

CREATE POLICY tmdb_data_service_write ON public.tmdb_data
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
