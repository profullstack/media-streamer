-- YouTube Integration: connected Google/YouTube accounts
-- Users can connect one or more Google accounts to access YouTube on our platform.
-- One row per (user_id, google_sub) so the same user can connect multiple accounts
-- but cannot duplicate the same underlying Google account.

CREATE TABLE IF NOT EXISTS bt_youtube_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_sub TEXT NOT NULL,                 -- stable Google account identifier
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  access_token TEXT NOT NULL,               -- TODO: encrypt at rest
  refresh_token TEXT NOT NULL,              -- TODO: encrypt at rest
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, google_sub)
);

CREATE INDEX IF NOT EXISTS idx_bt_youtube_accounts_user_id
  ON bt_youtube_accounts(user_id);

-- Only one default per user (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bt_youtube_accounts_one_default_per_user
  ON bt_youtube_accounts(user_id) WHERE is_default = TRUE;

-- updated_at trigger
CREATE OR REPLACE FUNCTION bt_youtube_accounts_set_updated_at()
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

DROP TRIGGER IF EXISTS trg_bt_youtube_accounts_updated_at ON bt_youtube_accounts;
CREATE TRIGGER trg_bt_youtube_accounts_updated_at
  BEFORE UPDATE ON bt_youtube_accounts
  FOR EACH ROW
  EXECUTE FUNCTION bt_youtube_accounts_set_updated_at();

-- RLS: users can only see/modify their own rows. Server uses service role and bypasses.
ALTER TABLE bt_youtube_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own youtube accounts"
  ON bt_youtube_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own youtube accounts"
  ON bt_youtube_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own youtube accounts"
  ON bt_youtube_accounts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own youtube accounts"
  ON bt_youtube_accounts FOR DELETE
  USING (auth.uid() = user_id);
