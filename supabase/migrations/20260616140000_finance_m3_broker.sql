-- Finance M3 — Read-only brokerage connection (Alpaca)
-- Profile-scoped broker links with ENCRYPTED credentials, and synced holdings.
-- v1 is strictly READ-ONLY: we never store trade/withdraw scope and never take
-- custody. Secrets are encrypted at rest and never returned to the client.

-- ============================================
-- FINANCE BROKER CONNECTIONS (profile-scoped)
-- ============================================

CREATE TABLE IF NOT EXISTS finance_broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                 -- e.g. 'alpaca'
  -- Encrypted credential blob (AES-256-GCM, iv:tag:ciphertext). Never plaintext.
  encrypted_credentials TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read-only',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked')),
  label TEXT,                             -- e.g. 'Paper' / 'Live' (non-secret)
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_finance_broker_connections_profile ON finance_broker_connections(profile_id);

ALTER TABLE finance_broker_connections ENABLE ROW LEVEL SECURITY;

-- Users may see that a connection exists (status/last_sync), but the route layer
-- strips `encrypted_credentials` before responding. Writes are service-role only
-- (no INSERT/UPDATE policy) so secrets are only ever written server-side.
CREATE POLICY "Users can view own broker connections"
  ON finance_broker_connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = finance_broker_connections.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own broker connections"
  ON finance_broker_connections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = finance_broker_connections.profile_id
      AND p.account_id = auth.uid()
    )
  );

-- ============================================
-- FINANCE HOLDINGS (profile-scoped, synced positions)
-- ============================================

CREATE TABLE IF NOT EXISTS finance_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES finance_broker_connections(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  quantity NUMERIC(20, 8) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(20, 8),
  market_value NUMERIC(20, 8),
  as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connection_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_finance_holdings_profile ON finance_holdings(profile_id);
CREATE INDEX IF NOT EXISTS idx_finance_holdings_symbol ON finance_holdings(profile_id, symbol);

ALTER TABLE finance_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own holdings"
  ON finance_holdings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = finance_holdings.profile_id
      AND p.account_id = auth.uid()
    )
  );
