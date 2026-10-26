-- @profullstack/redeem-credits: Supabase schema (table prefix "credit_")
-- Apply as a migration (supabase/migrations/<timestamp>_redeem_credits.sql).
-- Tables have RLS enabled and NO policies: only the service role (which
-- bypasses RLS) can read or write them. The functions are SECURITY DEFINER
-- with a pinned search_path, and only service_role may execute them.

CREATE TABLE IF NOT EXISTS public.credit_codes (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  recur TEXT,
  months INTEGER,
  max_redemptions INTEGER NOT NULL,
  redemptions INTEGER NOT NULL DEFAULT 0,
  expires_at BIGINT,
  created_at BIGINT NOT NULL,
  revoked_at BIGINT,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS public.credit_redemptions (
  code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (code_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  kind TEXT NOT NULL,
  recur TEXT,
  months INTEGER,
  source TEXT NOT NULL,
  at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_unit ON public.credit_ledger (user_id, unit, at);

CREATE TABLE IF NOT EXISTS public.credit_accounts (
  user_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, unit)
);

ALTER TABLE public.credit_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;

-- Redeem a code (by sha256 hash) for a user, atomically. The row lock on the
-- code serializes concurrent redeemers, so max_redemptions and one redemption
-- per (code, user) hold. Returns {"ok":true,"code":{...}} or {"ok":false,"reason":"..."}.
CREATE OR REPLACE FUNCTION public.credit_redeem(p_hash text, p_user_id text, p_at bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  c public.credit_codes%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.credit_codes WHERE hash = p_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF c.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  IF c.expires_at IS NOT NULL AND p_at >= c.expires_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_redemptions r WHERE r.code_id = c.id AND r.user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_redeemed');
  END IF;
  IF c.redemptions >= c.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'used_up');
  END IF;
  UPDATE public.credit_codes SET redemptions = redemptions + 1 WHERE id = c.id;
  INSERT INTO public.credit_redemptions (code_id, user_id, at) VALUES (c.id, p_user_id, p_at);
  INSERT INTO public.credit_ledger (user_id, unit, amount, kind, recur, months, source, at)
    VALUES (p_user_id, c.unit, c.amount, 'grant', c.recur, c.months, 'code:' || c.id, p_at);
  c.redemptions := c.redemptions + 1;
  RETURN jsonb_build_object('ok', true, 'code', to_jsonb(c));
END;
$fn$;

-- Compare-and-swap append: bump the (user, unit) version and append the entry
-- only if the version still equals p_version. Spends go through this, so two
-- concurrent spends can never both pass the balance check.
CREATE OR REPLACE FUNCTION public.credit_append_if_version(
  p_user_id text, p_unit text, p_amount double precision, p_kind text, p_recur text,
  p_months integer, p_source text, p_at bigint, p_version integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO public.credit_accounts (user_id, unit, version) VALUES (p_user_id, p_unit, 0) ON CONFLICT DO NOTHING;
  UPDATE public.credit_accounts SET version = version + 1
    WHERE user_id = p_user_id AND unit = p_unit AND version = p_version;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO public.credit_ledger (user_id, unit, amount, kind, recur, months, source, at)
    VALUES (p_user_id, p_unit, p_amount, p_kind, p_recur, p_months, p_source, p_at);
  RETURN true;
END;
$fn$;

-- One user's version and ledger for one unit, from a single snapshot, as one
-- JSON value (so PostgREST's max-rows never truncates it).
CREATE OR REPLACE FUNCTION public.credit_account(p_user_id text, p_unit text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'version', COALESCE((SELECT a.version FROM public.credit_accounts a WHERE a.user_id = p_user_id AND a.unit = p_unit), 0),
    'entries', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.at, l.id) FROM public.credit_ledger l
                         WHERE l.user_id = p_user_id AND l.unit = p_unit), '[]'::jsonb)
  );
$fn$;

-- A user's ledger, optionally for one unit (p_unit null = all units).
CREATE OR REPLACE FUNCTION public.credit_history(p_user_id text, p_unit text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.at, l.id), '[]'::jsonb)
  FROM public.credit_ledger l
  WHERE l.user_id = p_user_id AND (p_unit IS NULL OR l.unit = p_unit);
$fn$;

-- Revoke a code by id (idempotent: keeps the first revoked_at). False if no such id.
CREATE OR REPLACE FUNCTION public.credit_revoke(p_id text, p_at bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH u AS (
    UPDATE public.credit_codes SET revoked_at = COALESCE(revoked_at, p_at) WHERE id = p_id RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$fn$;

REVOKE ALL ON FUNCTION public.credit_redeem(text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_append_if_version(text, text, double precision, text, text, integer, text, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_account(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_history(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_revoke(text, bigint) FROM PUBLIC;

-- Supabase roles: anon and authenticated get nothing (Supabase's default
-- privileges would otherwise grant them table and function access);
-- service_role gets what supabaseStore needs. Skipped on plain Postgres.
DO $grants$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.credit_codes FROM %I', r);
      EXECUTE format('REVOKE ALL ON TABLE public.credit_redemptions FROM %I', r);
      EXECUTE format('REVOKE ALL ON TABLE public.credit_ledger FROM %I', r);
      EXECUTE format('REVOKE ALL ON TABLE public.credit_accounts FROM %I', r);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.credit_ledger_id_seq FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.credit_redeem(text, text, bigint) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.credit_append_if_version(text, text, double precision, text, text, integer, text, bigint, integer) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.credit_account(text, text) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.credit_history(text, text) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.credit_revoke(text, bigint) FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_codes TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_redemptions TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_ledger TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_accounts TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE public.credit_ledger_id_seq TO service_role;
    GRANT EXECUTE ON FUNCTION public.credit_redeem(text, text, bigint) TO service_role;
    GRANT EXECUTE ON FUNCTION public.credit_append_if_version(text, text, double precision, text, text, integer, text, bigint, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.credit_account(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.credit_history(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.credit_revoke(text, bigint) TO service_role;
  END IF;
END
$grants$;
