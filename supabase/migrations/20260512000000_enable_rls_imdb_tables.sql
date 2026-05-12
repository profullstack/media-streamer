-- Enable RLS on IMDb reference tables and dht_imdb_matches.
-- These tables are populated server-side (service role) and read either via
-- service role or SECURITY DEFINER RPCs (lookup_dht_imdb_match[es]) — both
-- bypass RLS, so behavior is unchanged. Public SELECT policies are added so
-- the data remains queryable if a future caller uses an anon/auth client.
-- Writes are not permitted to anon/authenticated; only service_role (which
-- bypasses RLS) may write.

ALTER TABLE public.imdb_title_basics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imdb_title_ratings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imdb_title_crew       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imdb_title_episode    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imdb_name_basics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imdb_title_akas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imdb_title_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dht_imdb_matches      ENABLE ROW LEVEL SECURITY;

CREATE POLICY imdb_title_basics_public_read
  ON public.imdb_title_basics FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY imdb_title_ratings_public_read
  ON public.imdb_title_ratings FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY imdb_title_crew_public_read
  ON public.imdb_title_crew FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY imdb_title_episode_public_read
  ON public.imdb_title_episode FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY imdb_name_basics_public_read
  ON public.imdb_name_basics FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY imdb_title_akas_public_read
  ON public.imdb_title_akas FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY imdb_title_principals_public_read
  ON public.imdb_title_principals FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY dht_imdb_matches_public_read
  ON public.dht_imdb_matches FOR SELECT TO anon, authenticated USING (true);
