-- Per-account seedbox configuration
--
-- Replaces the old global env-var allowlist (SEEDBOX_ALLOWED_EMAILS + SEEDBOX_*)
-- with per-account connections: any account owner connects their OWN seedbox on
-- the master account, and the "Send to seedbox" / "Play from seedbox" controls
-- then unlock for every Netflix-style profile under that account.
--
-- One row per account (account_id = auth.users.id). All secrets (HTTP/files
-- tokens, SSH private key, basic-auth password) are AES-256-GCM encrypted at
-- rest by the app (senc:v1 envelope) — the plaintext never lives in this table.

CREATE TABLE IF NOT EXISTS account_seedbox_configs (
  account_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- HTTP transport (e.g. torlink `serve`): POST a magnet to the client API.
  http_base_url        TEXT,
  http_token_encrypted TEXT,
  http_add_path        TEXT,
  http_auth            TEXT, -- 'bearer' | 'header:X-Header-Name'
  http_magnet_field    TEXT,

  -- SSH transport: drop a .magnet in a watch dir, or run an add-command.
  ssh_host                  TEXT,
  ssh_port                  INTEGER,
  ssh_user                  TEXT,
  ssh_private_key_encrypted TEXT,
  ssh_watch_dir             TEXT,
  ssh_add_command           TEXT,

  -- Files server (torlink `files`): stream completed files back for playback.
  files_base_url             TEXT,
  files_auth                 TEXT, -- 'none' | 'bearer' | 'basic' | 'header:X-Header-Name'
  files_token_encrypted      TEXT,
  files_basic_user           TEXT,
  files_basic_pass_encrypted TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defense in depth: the app reads/writes this table with the service role (which
-- bypasses RLS), but enable RLS + owner-only policies so a direct anon/authed
-- client can never read another account's encrypted secrets.
ALTER TABLE account_seedbox_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_seedbox_select_own" ON account_seedbox_configs;
CREATE POLICY "account_seedbox_select_own" ON account_seedbox_configs
  FOR SELECT USING (auth.uid() = account_id);

DROP POLICY IF EXISTS "account_seedbox_insert_own" ON account_seedbox_configs;
CREATE POLICY "account_seedbox_insert_own" ON account_seedbox_configs
  FOR INSERT WITH CHECK (auth.uid() = account_id);

DROP POLICY IF EXISTS "account_seedbox_update_own" ON account_seedbox_configs;
CREATE POLICY "account_seedbox_update_own" ON account_seedbox_configs
  FOR UPDATE USING (auth.uid() = account_id) WITH CHECK (auth.uid() = account_id);

DROP POLICY IF EXISTS "account_seedbox_delete_own" ON account_seedbox_configs;
CREATE POLICY "account_seedbox_delete_own" ON account_seedbox_configs
  FOR DELETE USING (auth.uid() = account_id);

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION set_account_seedbox_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_seedbox_configs_updated_at ON account_seedbox_configs;
CREATE TRIGGER trg_account_seedbox_configs_updated_at
  BEFORE UPDATE ON account_seedbox_configs
  FOR EACH ROW EXECUTE FUNCTION set_account_seedbox_configs_updated_at();
