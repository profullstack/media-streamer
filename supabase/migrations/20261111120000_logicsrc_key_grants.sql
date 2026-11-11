-- Keys from logicsrc (2026-11-11, @profullstack/key-grants 0.1.0).
--
-- A member asks logicsrc (app.logicsrc.com) for API keys by name instead of
-- pasting them. Their browser on logicsrc seals each value to the inbox public
-- key of their bittorrented key vault (user_secret_vaults.seal.inbox_public_key)
-- and logicsrc posts the sealed text to /api/v1/logicsrc/webhook, again on
-- every rotation and once more on revoke.
--
--   logicsrc_grant_requests  one row per "Get from logicsrc": nonce, the
--                            per-request webhook secret, the key names asked for
--   logicsrc_grants          logicsrc grant id -> request + key name
--   user_secret_inbox        a delivered key waiting for its owner's unlock: the
--                            server can store it but never open it. The next
--                            unlock opens it and writes it into the domain column
--                            (sealed with the data key), then deletes the row.
--
-- No key value is ever stored in the clear. Service role only: RLS on, no
-- policies, no grants to clients.

CREATE TABLE IF NOT EXISTS public.logicsrc_grant_requests (
  nonce text PRIMARY KEY,
  user_id text NOT NULL,
  scope text,
  keys text NOT NULL,
  webhook_secret text NOT NULL,
  next_path text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS logicsrc_grant_requests_user ON public.logicsrc_grant_requests (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.logicsrc_grants (
  grant_id text PRIMARY KEY,
  nonce text NOT NULL,
  user_id text NOT NULL,
  scope text,
  key_name text NOT NULL,
  status text NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_secret_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- One pending value per grant: a rotation replaces the one still waiting.
  grant_id text NOT NULL UNIQUE,
  key_name text NOT NULL,
  -- Where it goes (the request scope): a finance profile id for broker keys.
  target text,
  -- `sealed:v2:<inbox entry JSON>` exactly as logicsrc delivered it.
  sealed text NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_secret_inbox_user ON public.user_secret_inbox (user_id);

-- Which logicsrc grants the stored broker credentials came from. NULL = typed in
-- by the member; a revoke only clears credentials that came from that grant.
ALTER TABLE public.finance_broker_connections ADD COLUMN IF NOT EXISTS logicsrc_grant_ids text[];

ALTER TABLE public.logicsrc_grant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logicsrc_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_secret_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.logicsrc_grant_requests, public.logicsrc_grants, public.user_secret_inbox FROM anon, authenticated;
GRANT ALL ON public.logicsrc_grant_requests, public.logicsrc_grants, public.user_secret_inbox TO service_role;

COMMENT ON TABLE public.user_secret_inbox IS
  'Keys from logicsrc sealed to the owner''s vault inbox, waiting for their next unlock. Ciphertext only.';

NOTIFY pgrst, 'reload schema';
