-- SiriusXM Authenticated Sessions (per user)
-- Stores the AUTH_TOKEN.session.accessToken and the cookie jar from the
-- /session/v1/sessions/authenticated response so the server can refresh
-- the session via /session/v1/sessions/refresh on the user's behalf.

CREATE TABLE IF NOT EXISTS bt_siriusxm_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,                                   -- captured at login for display
  access_token TEXT NOT NULL,                   -- TODO: encrypt at rest
  session_cookies TEXT NOT NULL DEFAULT '',     -- joined Cookie-header string
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bt_siriusxm_sessions_user_id
  ON bt_siriusxm_sessions(user_id);

CREATE OR REPLACE FUNCTION bt_siriusxm_sessions_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bt_siriusxm_sessions_updated_at ON bt_siriusxm_sessions;
CREATE TRIGGER trg_bt_siriusxm_sessions_updated_at
  BEFORE UPDATE ON bt_siriusxm_sessions
  FOR EACH ROW
  EXECUTE FUNCTION bt_siriusxm_sessions_set_updated_at();

ALTER TABLE bt_siriusxm_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own siriusxm session"
  ON bt_siriusxm_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own siriusxm session"
  ON bt_siriusxm_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own siriusxm session"
  ON bt_siriusxm_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own siriusxm session"
  ON bt_siriusxm_sessions FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE bt_siriusxm_sessions IS 'Per-user SiriusXM authenticated session tokens + cookie jar for refresh.';
COMMENT ON COLUMN bt_siriusxm_sessions.session_cookies IS 'Cookie-header string ("k1=v1; k2=v2") replayed against /session/v1/sessions/refresh.';
