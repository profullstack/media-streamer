-- Spotify device credentials (per user)
-- Stores the credentials.json that librespot writes after the user pairs a
-- code at spotify.com/pair. It is a reusable login for the whole account, so
-- it is stored encrypted (senc:v1 envelope from src/lib/seedbox/crypto.ts)
-- and written back to librespot's cache directory when its process starts.

CREATE TABLE IF NOT EXISTS bt_spotify_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,                                -- Spotify username, for display
  credentials_enc TEXT NOT NULL,                -- encrypted credentials.json
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bt_spotify_sessions_user_id
  ON bt_spotify_sessions(user_id);

CREATE OR REPLACE FUNCTION bt_spotify_sessions_set_updated_at()
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

DROP TRIGGER IF EXISTS trg_bt_spotify_sessions_updated_at ON bt_spotify_sessions;
CREATE TRIGGER trg_bt_spotify_sessions_updated_at
  BEFORE UPDATE ON bt_spotify_sessions
  FOR EACH ROW
  EXECUTE FUNCTION bt_spotify_sessions_set_updated_at();

ALTER TABLE bt_spotify_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own spotify session"
  ON bt_spotify_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own spotify session"
  ON bt_spotify_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own spotify session"
  ON bt_spotify_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own spotify session"
  ON bt_spotify_sessions FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE bt_spotify_sessions IS 'Per-user librespot credentials.json (encrypted) from Spotify device pairing.';
COMMENT ON COLUMN bt_spotify_sessions.credentials_enc IS 'senc:v1 AES-256-GCM envelope of the credentials.json librespot caches after pairing.';
