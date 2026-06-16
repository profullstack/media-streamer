-- Finance M2 — On-demand AI report
-- Cached, structured AI research reports + an audit/rate-limit ledger.
-- Reports are READABLE by paid users (RLS) but WRITTEN only by the service role
-- (the only token-spending path runs server-side). The ledger drives per-user
-- and global daily generation caps and a spend dashboard.

-- ============================================
-- FINANCE REPORTS (cached generated reports)
-- ============================================
-- Cache key is (symbol, model, prompt_version) — bumping the prompt template's
-- version invalidates stale reports automatically (PRD §3.3, §7).

CREATE TABLE IF NOT EXISTS finance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  -- Structured, typed sections rendered by the client.
  sections JSONB NOT NULL,
  -- Rendered markdown fallback / copyable form.
  markdown TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Cost accounting captured on every generation.
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  generated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(symbol, model, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_finance_reports_lookup ON finance_reports(symbol, model, prompt_version);
CREATE INDEX IF NOT EXISTS idx_finance_reports_expires_at ON finance_reports(expires_at);

ALTER TABLE finance_reports ENABLE ROW LEVEL SECURITY;

-- Any authenticated (paid is enforced at the route) user may read cached
-- reports; writes are service-role only (no INSERT/UPDATE policy by design).
CREATE POLICY "Authenticated users can read finance reports"
  ON finance_reports FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- FINANCE REPORT RUNS (audit + rate-limit ledger)
-- ============================================

CREATE TABLE IF NOT EXISTS finance_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'rate_limited')),
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drives per-user/day caps (profile_id + created_at) and global/day caps.
CREATE INDEX IF NOT EXISTS idx_finance_report_runs_profile_day ON finance_report_runs(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_report_runs_created_at ON finance_report_runs(created_at DESC);

ALTER TABLE finance_report_runs ENABLE ROW LEVEL SECURITY;

-- Users may see their own run history; writes are service-role only.
CREATE POLICY "Users can view own finance report runs"
  ON finance_report_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = finance_report_runs.profile_id
      AND p.account_id = auth.uid()
    )
  );
