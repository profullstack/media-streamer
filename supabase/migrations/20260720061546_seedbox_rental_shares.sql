-- Seedbox Rental (pay-per-watch) — public, temporary rental of an owner's seedbox.
--
-- A visitor pays $0.25 via CoinPayPortal for a time-boxed "session pass", then
-- submits their own magnet to the owner's seedbox (torlink), which downloads it,
-- and streams the completed files back through the platform. Access is
-- payer-scoped: a pass may only stream torrents it added.
--
-- Three tables:
--   seedbox_shares          — the owner's public rental offer (temporary, priced)
--   seedbox_share_grants    — a paid session pass (doubles as the payment ledger)
--   seedbox_share_downloads — torrents a pass added (the dynamic streaming scope)
--
-- See docs/prds/seedbox-pay-per-watch.md.

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function (self-contained; safe to CREATE OR REPLACE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_seedbox_share_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ---------------------------------------------------------------------------
-- seedbox_shares
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seedbox_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  owner_account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Rent my seedbox',
  description TEXT,
  price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.25,
  pass_window_minutes INTEGER NOT NULL DEFAULT 1440,
  max_downloads_per_pass INTEGER NOT NULL DEFAULT 2,
  max_download_size_gb NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  payout_wallet_address TEXT,
  payout_blockchain TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  earnings_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT seedbox_shares_status_check
    CHECK (status IN ('active', 'paused', 'expired', 'closed')),
  CONSTRAINT seedbox_shares_price_check CHECK (price_usd >= 0),
  CONSTRAINT seedbox_shares_window_check CHECK (pass_window_minutes > 0),
  CONSTRAINT seedbox_shares_downloads_check CHECK (max_downloads_per_pass > 0)
);

CREATE INDEX IF NOT EXISTS idx_seedbox_shares_owner ON seedbox_shares(owner_account_id);
CREATE INDEX IF NOT EXISTS idx_seedbox_shares_status ON seedbox_shares(status);
-- slug already has a UNIQUE index from the column constraint.

ALTER TABLE seedbox_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own seedbox shares"
  ON seedbox_shares FOR SELECT
  USING (auth.uid() = owner_account_id);

CREATE POLICY "Owners can update own seedbox shares"
  ON seedbox_shares FOR UPDATE
  USING (auth.uid() = owner_account_id);

CREATE POLICY "Owners can delete own seedbox shares"
  ON seedbox_shares FOR DELETE
  USING (auth.uid() = owner_account_id);

CREATE POLICY "Service role can manage seedbox shares"
  ON seedbox_shares FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_seedbox_shares_updated_at
  BEFORE UPDATE ON seedbox_shares
  FOR EACH ROW EXECUTE FUNCTION update_seedbox_share_updated_at();

-- ---------------------------------------------------------------------------
-- seedbox_share_grants — a paid session pass + per-payment ledger row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seedbox_share_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES seedbox_shares(id) ON DELETE CASCADE,
  coinpayportal_payment_id TEXT UNIQUE,
  grant_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_usd NUMERIC(10, 2) NOT NULL,
  amount_crypto TEXT,
  crypto_currency TEXT,
  blockchain TEXT,
  tx_hash TEXT,
  viewer_fingerprint TEXT,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  webhook_event_type TEXT,
  webhook_received_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT seedbox_share_grants_status_check
    CHECK (status IN ('pending', 'paid', 'expired', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_seedbox_share_grants_share ON seedbox_share_grants(share_id);
CREATE INDEX IF NOT EXISTS idx_seedbox_share_grants_payment
  ON seedbox_share_grants(coinpayportal_payment_id);
CREATE INDEX IF NOT EXISTS idx_seedbox_share_grants_token
  ON seedbox_share_grants(grant_token_hash);

ALTER TABLE seedbox_share_grants ENABLE ROW LEVEL SECURITY;

-- Renters are anonymous; access is via the signed cookie/token, not Supabase
-- auth. Only the service role touches grants.
CREATE POLICY "Service role can manage seedbox share grants"
  ON seedbox_share_grants FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_seedbox_share_grants_updated_at
  BEFORE UPDATE ON seedbox_share_grants
  FOR EACH ROW EXECUTE FUNCTION update_seedbox_share_updated_at();

-- ---------------------------------------------------------------------------
-- seedbox_share_downloads — torrents added under a pass (dynamic access scope)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seedbox_share_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES seedbox_share_grants(id) ON DELETE CASCADE,
  share_id UUID NOT NULL REFERENCES seedbox_shares(id) ON DELETE CASCADE,
  infohash TEXT NOT NULL,
  name TEXT,
  magnet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'added',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT seedbox_share_downloads_status_check
    CHECK (status IN ('added', 'downloading', 'complete', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_seedbox_share_downloads_grant
  ON seedbox_share_downloads(grant_id);
CREATE INDEX IF NOT EXISTS idx_seedbox_share_downloads_share
  ON seedbox_share_downloads(share_id);
-- One torrent per grant (a re-add is idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_seedbox_share_downloads_grant_infohash
  ON seedbox_share_downloads(grant_id, infohash);

ALTER TABLE seedbox_share_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage seedbox share downloads"
  ON seedbox_share_downloads FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_seedbox_share_downloads_updated_at
  BEFORE UPDATE ON seedbox_share_downloads
  FOR EACH ROW EXECUTE FUNCTION update_seedbox_share_updated_at();

COMMENT ON TABLE seedbox_shares IS 'Public, temporary rentals of an owner''s seedbox (pay-per-watch).';
COMMENT ON TABLE seedbox_share_grants IS 'Paid session passes for a seedbox rental; also the per-payment ledger.';
COMMENT ON TABLE seedbox_share_downloads IS 'Torrents added under a session pass; scopes what that pass may stream.';
