-- Pin the seedbox-rental trigger function's search_path (advisor lint 0011,
-- "Function Search Path Mutable"). The function only calls NOW() (pg_catalog),
-- so an empty search_path is safe. Applied to prod 2026-07-20.
ALTER FUNCTION public.update_seedbox_share_updated_at() SET search_path = '';
