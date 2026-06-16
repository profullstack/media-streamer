-- Finance M1 — Charts + paid gating
-- Adds the profile-scoped watchlist and a shared (non-profile-scoped) public
-- market-data cache. AI reports, broker connections and holdings arrive in
-- later milestones (M2/M3) and are intentionally NOT created here.
--
-- RLS model mirrors the rest of the app: profile-scoped rows are visible only
-- when profiles.account_id = auth.uid(). The quotes cache holds only PUBLIC
-- market data (no per-user data), is readable by any authenticated user, and is
-- written exclusively by the service role (which bypasses RLS).

-- ============================================
-- FINANCE WATCHLIST (profile-scoped)
-- ============================================

CREATE TABLE IF NOT EXISTS finance_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  exchange TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_finance_watchlist_profile_id ON finance_watchlist(profile_id);
CREATE INDEX IF NOT EXISTS idx_finance_watchlist_added_at ON finance_watchlist(profile_id, added_at DESC);

ALTER TABLE finance_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own finance watchlist"
  ON finance_watchlist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = finance_watchlist.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own finance watchlist"
  ON finance_watchlist FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = finance_watchlist.profile_id
      AND p.account_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own finance watchlist"
  ON finance_watchlist FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = finance_watchlist.profile_id
      AND p.account_id = auth.uid()
    )
  );

-- ============================================
-- FINANCE QUOTES CACHE (shared, public market data only)
-- ============================================
-- Cuts upstream vendor calls across all users. cache_key distinguishes the
-- payload shape, e.g. 'quote' or 'candles:1Y'. NO per-user data lives here.

CREATE TABLE IF NOT EXISTS finance_quotes_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(symbol, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_finance_quotes_cache_lookup ON finance_quotes_cache(symbol, cache_key);
CREATE INDEX IF NOT EXISTS idx_finance_quotes_cache_expires_at ON finance_quotes_cache(expires_at);

ALTER TABLE finance_quotes_cache ENABLE ROW LEVEL SECURITY;

-- Public market data: any authenticated user may read the cache. Writes are
-- service-role only (service role bypasses RLS; no INSERT/UPDATE policy exists
-- for regular users by design).
CREATE POLICY "Authenticated users can read quotes cache"
  ON finance_quotes_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);
