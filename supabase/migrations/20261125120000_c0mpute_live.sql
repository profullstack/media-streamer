-- c0mpute Live: a member broadcasts their own camera or screen through the
-- c0mpute network (/live, src/lib/c0mpute-live).
--
-- The c0mpute OAuth token is NEVER stored. It is used once, at connect time, to
-- create one c0mpute stream for the member. What stays is that stream's id, its
-- watch link and its stream key, sealed with AES-256-GCM by the app
-- (stream_key_enc); the database never sees the key in the clear.
--
-- Idempotent (IF NOT EXISTS throughout): safe to apply by hand more than once.

CREATE TABLE IF NOT EXISTS public.c0mpute_live_streams (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stream_id text NOT NULL,
  watch_url text,
  playback_url text,
  account_label text,
  visibility text NOT NULL DEFAULT 'unlisted' CHECK (visibility IN ('public', 'unlisted')),
  stream_key_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE public.c0mpute_live_streams ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.
REVOKE ALL ON public.c0mpute_live_streams FROM anon, authenticated;

-- One-row cache of BitTorrented's dynamically registered c0mpute OAuth client (a
-- public client: there is no secret, only the id and the redirect it is for).
CREATE TABLE IF NOT EXISTS public.c0mpute_oauth_client (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE public.c0mpute_oauth_client ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.
REVOKE ALL ON public.c0mpute_oauth_client FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
