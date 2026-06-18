-- Finance — multiple named watchlists per profile.
--
-- Introduces `finance_watchlists` (named lists) and points each
-- `finance_watchlist` item row at a list via `watchlist_id`. Existing items are
-- preserved: every profile that already has items gets a default "Watchlist"
-- list and its items are backfilled onto it. The per-list uniqueness moves from
-- (profile_id, symbol) to (watchlist_id, symbol) so the same symbol can live in
-- more than one list.
--
-- RLS mirrors the rest of finance: rows are visible only when the owning
-- profile's account_id = auth.uid().

-- ============================================
-- FINANCE WATCHLISTS (named lists, profile-scoped)
-- ============================================

CREATE TABLE IF NOT EXISTS finance_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_watchlists_profile ON finance_watchlists(profile_id, created_at);

ALTER TABLE finance_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own finance watchlists"
  ON finance_watchlists FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = finance_watchlists.profile_id AND p.account_id = auth.uid()));

CREATE POLICY "Users can insert own finance watchlists"
  ON finance_watchlists FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = finance_watchlists.profile_id AND p.account_id = auth.uid()));

CREATE POLICY "Users can update own finance watchlists"
  ON finance_watchlists FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = finance_watchlists.profile_id AND p.account_id = auth.uid()));

CREATE POLICY "Users can delete own finance watchlists"
  ON finance_watchlists FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = finance_watchlists.profile_id AND p.account_id = auth.uid()));

-- ============================================
-- LINK ITEMS TO A LIST + BACKFILL
-- ============================================

ALTER TABLE finance_watchlist
  ADD COLUMN IF NOT EXISTS watchlist_id UUID REFERENCES finance_watchlists(id) ON DELETE CASCADE;

-- One default list per profile that already has items.
INSERT INTO finance_watchlists (profile_id, name)
SELECT DISTINCT w.profile_id, 'Watchlist'
FROM finance_watchlist w
WHERE NOT EXISTS (SELECT 1 FROM finance_watchlists l WHERE l.profile_id = w.profile_id);

-- Point existing items at their profile's (oldest) list.
UPDATE finance_watchlist w
SET watchlist_id = (
  SELECT l.id FROM finance_watchlists l
  WHERE l.profile_id = w.profile_id
  ORDER BY l.created_at ASC, l.id ASC
  LIMIT 1
)
WHERE w.watchlist_id IS NULL;

-- Now every item must belong to a list, and symbols are unique per-list.
ALTER TABLE finance_watchlist ALTER COLUMN watchlist_id SET NOT NULL;
ALTER TABLE finance_watchlist DROP CONSTRAINT IF EXISTS finance_watchlist_profile_id_symbol_key;
ALTER TABLE finance_watchlist
  ADD CONSTRAINT finance_watchlist_watchlist_id_symbol_key UNIQUE (watchlist_id, symbol);

CREATE INDEX IF NOT EXISTS idx_finance_watchlist_watchlist ON finance_watchlist(watchlist_id);
