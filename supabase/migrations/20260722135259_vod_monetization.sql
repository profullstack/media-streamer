-- VOD Monetization — providers connect a media server and charge for access.
--
-- A VOD provider (Xtream / M3U / HTTP media library / JSON manifest) connects
-- their existing catalog and monetizes public access: a $1 one-time 7-day pass
-- (whole catalog) or $1 per title (stream-unlock or file download, provider's
-- choice). No torrenting. Reuses the CoinPay checkout/pass/webhook spine from
-- the seedbox rental. See docs/prds/vod-monetization.md.
--
--   vod_providers — an owner's connected VOD source + pricing (secrets encrypted)
--   vod_titles    — synced catalog cache (browse/search)
--   vod_grants    — paid access (weekly pass or per-title) + payment ledger

CREATE OR REPLACE FUNCTION update_vod_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ---------------------------------------------------------------------------
-- vod_providers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vod_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  owner_account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'My VOD library',
  description TEXT,
  source_kind TEXT NOT NULL,
  -- Source connection (secrets AES-256-GCM encrypted at rest).
  source_url TEXT,
  source_username TEXT,
  source_password_encrypted TEXT,
  source_auth TEXT NOT NULL DEFAULT 'none',
  source_token_encrypted TEXT,
  source_header_name TEXT,
  -- Pricing (NULL price = that model not offered).
  weekly_price_usd NUMERIC(10, 2) DEFAULT 1.00,
  per_title_price_usd NUMERIC(10, 2) DEFAULT 1.00,
  pass_window_minutes INTEGER NOT NULL DEFAULT 10080, -- 7 days
  default_access_mode TEXT NOT NULL DEFAULT 'stream',
  payout_wallet_address TEXT,
  payout_blockchain TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  catalog_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  session_count INTEGER NOT NULL DEFAULT 0,
  earnings_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vod_providers_source_kind_check
    CHECK (source_kind IN ('xtream', 'm3u', 'http_library', 'manifest')),
  CONSTRAINT vod_providers_source_auth_check
    CHECK (source_auth IN ('none', 'bearer', 'basic', 'header')),
  CONSTRAINT vod_providers_access_mode_check
    CHECK (default_access_mode IN ('stream', 'download')),
  CONSTRAINT vod_providers_status_check
    CHECK (status IN ('active', 'paused', 'closed')),
  CONSTRAINT vod_providers_window_check CHECK (pass_window_minutes > 0)
);

CREATE INDEX IF NOT EXISTS idx_vod_providers_owner ON vod_providers(owner_account_id);
CREATE INDEX IF NOT EXISTS idx_vod_providers_status ON vod_providers(status);

ALTER TABLE vod_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own vod providers"
  ON vod_providers FOR SELECT USING (auth.uid() = owner_account_id);
CREATE POLICY "Owners can update own vod providers"
  ON vod_providers FOR UPDATE USING (auth.uid() = owner_account_id);
CREATE POLICY "Owners can delete own vod providers"
  ON vod_providers FOR DELETE USING (auth.uid() = owner_account_id);
CREATE POLICY "Service role can manage vod providers"
  ON vod_providers FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_vod_providers_updated_at
  BEFORE UPDATE ON vod_providers
  FOR EACH ROW EXECUTE FUNCTION update_vod_updated_at();

-- ---------------------------------------------------------------------------
-- vod_titles — synced catalog cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vod_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES vod_providers(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  poster_url TEXT,
  plot TEXT,
  rating TEXT,
  category TEXT,
  stream_ref TEXT NOT NULL,
  extension TEXT,
  access_mode TEXT,
  price_usd NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vod_titles_kind_check CHECK (kind IN ('movie', 'series', 'live', 'other')),
  CONSTRAINT vod_titles_access_mode_check
    CHECK (access_mode IS NULL OR access_mode IN ('stream', 'download'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vod_titles_provider_external
  ON vod_titles(provider_id, external_id);
CREATE INDEX IF NOT EXISTS idx_vod_titles_provider ON vod_titles(provider_id);
CREATE INDEX IF NOT EXISTS idx_vod_titles_title ON vod_titles(provider_id, title);

ALTER TABLE vod_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage vod titles"
  ON vod_titles FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_vod_titles_updated_at
  BEFORE UPDATE ON vod_titles
  FOR EACH ROW EXECUTE FUNCTION update_vod_updated_at();

-- ---------------------------------------------------------------------------
-- vod_grants — paid access + payment ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vod_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES vod_providers(id) ON DELETE CASCADE,
  grant_kind TEXT NOT NULL,
  title_id UUID REFERENCES vod_titles(id) ON DELETE CASCADE,
  access_mode TEXT NOT NULL DEFAULT 'stream',
  coinpayportal_payment_id TEXT UNIQUE,
  viewer_key_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_usd NUMERIC(10, 2) NOT NULL,
  amount_crypto TEXT,
  crypto_currency TEXT,
  blockchain TEXT,
  tx_hash TEXT,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  webhook_event_type TEXT,
  webhook_received_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vod_grants_kind_check CHECK (grant_kind IN ('weekly', 'title')),
  CONSTRAINT vod_grants_access_mode_check CHECK (access_mode IN ('stream', 'download')),
  CONSTRAINT vod_grants_status_check CHECK (status IN ('pending', 'paid', 'expired', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_vod_grants_provider ON vod_grants(provider_id);
CREATE INDEX IF NOT EXISTS idx_vod_grants_payment ON vod_grants(coinpayportal_payment_id);
CREATE INDEX IF NOT EXISTS idx_vod_grants_viewer ON vod_grants(provider_id, viewer_key_hash);

ALTER TABLE vod_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage vod grants"
  ON vod_grants FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_vod_grants_updated_at
  BEFORE UPDATE ON vod_grants
  FOR EACH ROW EXECUTE FUNCTION update_vod_updated_at();

COMMENT ON TABLE vod_providers IS 'Third-party VOD providers monetizing a connected media catalog.';
COMMENT ON TABLE vod_titles IS 'Synced catalog cache for a VOD provider (browse/search).';
COMMENT ON TABLE vod_grants IS 'Paid VOD access (weekly pass or per-title) + payment ledger.';
