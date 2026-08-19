-- IPTV Resale (pay-per-game) — resell access to an IPTV playlist you already pay for.
--
-- An owner lists one of their `iptv_playlists` for resale. A visitor pays ~$1 via
-- CoinPayPortal for a time-boxed pass and watches through the platform's proxy; the
-- owner's real M3U credentials are never exposed to the buyer.
--
-- Mirrors the seedbox rental model (20260720061546_seedbox_rental_shares.sql) with one
-- structural difference that matters more here: an IPTV provider caps how many
-- CONCURRENT connections a subscription may open. Overselling a seedbox makes downloads
-- slow; overselling an IPTV line makes every viewer's stream fail and gets the owner's
-- upstream account terminated. So concurrency is enforced continuously by a session
-- table with heartbeats, not just counted at checkout.
--
-- Three tables:
--   iptv_shares         — the owner's public resale offer (priced, time-boxed, capped)
--   iptv_share_grants   — a paid pass (doubles as the payment ledger)
--   iptv_share_sessions — live viewing sessions, which is what enforces the cap

CREATE OR REPLACE FUNCTION update_iptv_share_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ---------------------------------------------------------------------------
-- iptv_shares
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS iptv_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  owner_account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The playlist being resold. Deleting the playlist must not leave a live offer
  -- pointing at nothing, so this cascades.
  playlist_id UUID NOT NULL REFERENCES iptv_playlists(id) ON DELETE CASCADE,

  title TEXT NOT NULL DEFAULT 'Watch on my line',
  description TEXT,
  price_usd NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
  -- Long enough for a game plus overtime and a slow start; deliberately not a day.
  pass_window_minutes INTEGER NOT NULL DEFAULT 240,

  -- The whole safety story. Never set this above what the upstream provider actually
  -- allows, minus the owner's own viewing.
  max_concurrent_streams INTEGER NOT NULL DEFAULT 1,
  -- How many passes may be live at once. Distinct from concurrency: people buy a pass
  -- and do not all watch simultaneously, so this is usually higher.
  max_active_passes INTEGER NOT NULL DEFAULT 3,

  -- NULL means "every channel in the playlist". A non-empty array restricts the pass
  -- to these channel ids, which is how an owner sells one game rather than their
  -- whole subscription.
  allowed_channel_ids TEXT[],

  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  payout_wallet_address TEXT,
  payout_blockchain TEXT,

  view_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  earnings_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT iptv_shares_status_check
    CHECK (status IN ('active', 'paused', 'expired', 'closed')),
  CONSTRAINT iptv_shares_price_check CHECK (price_usd >= 0),
  CONSTRAINT iptv_shares_window_check CHECK (pass_window_minutes > 0),
  CONSTRAINT iptv_shares_concurrency_check CHECK (max_concurrent_streams > 0),
  CONSTRAINT iptv_shares_passes_check CHECK (max_active_passes > 0),
  -- An empty array would read as "no channels allowed" and silently sell nothing.
  CONSTRAINT iptv_shares_channels_check
    CHECK (allowed_channel_ids IS NULL OR array_length(allowed_channel_ids, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_iptv_shares_owner ON iptv_shares(owner_account_id);
CREATE INDEX IF NOT EXISTS idx_iptv_shares_playlist ON iptv_shares(playlist_id);
CREATE INDEX IF NOT EXISTS idx_iptv_shares_status ON iptv_shares(status);

ALTER TABLE iptv_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own IPTV shares"
  ON iptv_shares FOR SELECT USING (auth.uid() = owner_account_id);
CREATE POLICY "Owners can insert own IPTV shares"
  ON iptv_shares FOR INSERT WITH CHECK (auth.uid() = owner_account_id);
CREATE POLICY "Owners can update own IPTV shares"
  ON iptv_shares FOR UPDATE USING (auth.uid() = owner_account_id);
CREATE POLICY "Owners can delete own IPTV shares"
  ON iptv_shares FOR DELETE USING (auth.uid() = owner_account_id);
CREATE POLICY "Service role can manage IPTV shares"
  ON iptv_shares FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_iptv_shares_updated_at
  BEFORE UPDATE ON iptv_shares
  FOR EACH ROW EXECUTE FUNCTION update_iptv_share_updated_at();

-- ---------------------------------------------------------------------------
-- iptv_share_grants — a paid pass + per-payment ledger row
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS iptv_share_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES iptv_shares(id) ON DELETE CASCADE,
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

  CONSTRAINT iptv_share_grants_status_check
    CHECK (status IN ('pending', 'paid', 'expired', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_iptv_share_grants_share ON iptv_share_grants(share_id);
CREATE INDEX IF NOT EXISTS idx_iptv_share_grants_payment
  ON iptv_share_grants(coinpayportal_payment_id);
CREATE INDEX IF NOT EXISTS idx_iptv_share_grants_token
  ON iptv_share_grants(grant_token_hash);
-- Counting live passes for the max_active_passes check.
CREATE INDEX IF NOT EXISTS idx_iptv_share_grants_live
  ON iptv_share_grants(share_id, expires_at) WHERE status = 'paid';

ALTER TABLE iptv_share_grants ENABLE ROW LEVEL SECURITY;

-- Buyers are anonymous; access is the signed cookie, not Supabase auth.
CREATE POLICY "Service role can manage IPTV share grants"
  ON iptv_share_grants FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_iptv_share_grants_updated_at
  BEFORE UPDATE ON iptv_share_grants
  FOR EACH ROW EXECUTE FUNCTION update_iptv_share_updated_at();

-- ---------------------------------------------------------------------------
-- iptv_share_sessions — what actually enforces the concurrency cap
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS iptv_share_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES iptv_share_grants(id) ON DELETE CASCADE,
  share_id UUID NOT NULL REFERENCES iptv_shares(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  -- Bumped by the player. A session with a stale heartbeat is treated as gone:
  -- a viewer who closes the tab never sends a "stop", and without this their slot
  -- would be held until the pass expired.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iptv_share_sessions_grant ON iptv_share_sessions(grant_id);
-- The hot path: how many sessions on this share are still live?
CREATE INDEX IF NOT EXISTS idx_iptv_share_sessions_live
  ON iptv_share_sessions(share_id, last_seen_at) WHERE ended_at IS NULL;
-- One live session per grant per channel, so a viewer reloading the page reuses
-- their slot instead of consuming a second one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_iptv_share_sessions_grant_channel_live
  ON iptv_share_sessions(grant_id, channel_id) WHERE ended_at IS NULL;

ALTER TABLE iptv_share_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage IPTV share sessions"
  ON iptv_share_sessions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trigger_iptv_share_sessions_updated_at
  BEFORE UPDATE ON iptv_share_sessions
  FOR EACH ROW EXECUTE FUNCTION update_iptv_share_updated_at();

COMMENT ON TABLE iptv_shares IS 'Public, priced resale of an owner''s IPTV playlist (pay-per-game).';
COMMENT ON TABLE iptv_share_grants IS 'Paid passes for an IPTV resale; also the per-payment ledger.';
COMMENT ON TABLE iptv_share_sessions IS 'Live viewing sessions; enforces the upstream provider''s concurrency cap.';
COMMENT ON COLUMN iptv_shares.max_concurrent_streams IS 'Never exceed what the upstream provider allows: overselling terminates the owner''s account.';
