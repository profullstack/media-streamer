-- The pay2seed / paid2seed hub.
--
-- bittorrented.com is the reference hub for the OpenSwarm payment family
-- (logicsrc.com/openswarm). A requester attests what they are putting on a
-- swarm and why they may, escrows a budget for it to be kept alive, and
-- seeders take leases, prove every period that they hold and serve it, and are
-- paid per GiB-month. The hub takes 1 percent of what crosses it and never
-- touches a seeder's floor.
--
-- Every party here is a KEY, and a key is either a human or a bit (an
-- autonomous agent). That is the whole point of the lane column: this layer
-- carries h2h, h2b, b2h and b2b alike, and we want to see which is growing.
--
--   openswarm_parties       — a key, its kind, its payout address, its standing
--   openswarm_attestations  — consent: what this is and why you may share it
--   openswarm_offers        — money escrowed for a swarm to be kept
--   openswarm_leases        — one seeder's slot on an offer
--   openswarm_receipts      — one proven period's earnings
--   openswarm_proofs        — the challenge answer or probe behind a receipt
--   openswarm_notices       — a claim against an attestation
--   openswarm_teams         — who may decrypt a private swarm
--   openswarm_team_members  — the member keys, with roles
--   openswarm_team_invites  — an invitation, until it is redeemed or expires

CREATE OR REPLACE FUNCTION update_openswarm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ---------------------------------------------------------------------------
-- Parties: every key the hub knows, human or bit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS openswarm_parties (
  key TEXT PRIMARY KEY,
  -- 'human' or 'bit'. A bit is an autonomous agent; it sells and earns on the
  -- same terms and under the same consent rules.
  kind TEXT NOT NULL DEFAULT 'human',
  -- An agent names the human answerable for it. Required for a bit's PUBLIC
  -- attestations, so a notice always reaches somebody.
  operator_key TEXT REFERENCES openswarm_parties(key) ON DELETE SET NULL,
  label TEXT,
  -- Linked to a site account when the key was minted here; null for a stranger.
  account_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payout_address TEXT,
  payout_network TEXT,
  balance_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  paid_out_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  -- Standing counters (paid2seed §6.3). Read, never trusted from the client.
  proven INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  abandoned INTEGER NOT NULL DEFAULT 0,
  honoured INTEGER NOT NULL DEFAULT 0,
  voided INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_parties_kind_check CHECK (kind IN ('human', 'bit')),
  CONSTRAINT openswarm_parties_key_check CHECK (key ~ '^ed25519:[0-9a-f]{64}$'),
  -- An address without a network is not a payee (coinpay-payee-always-required).
  CONSTRAINT openswarm_parties_payout_check
    CHECK ((payout_address IS NULL) = (payout_network IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_openswarm_parties_account ON openswarm_parties(account_id);
CREATE INDEX IF NOT EXISTS idx_openswarm_parties_kind ON openswarm_parties(kind);
CREATE INDEX IF NOT EXISTS idx_openswarm_parties_payout ON openswarm_parties(payout_address);

-- ---------------------------------------------------------------------------
-- Attestations: consent, signed, before anything is listed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS openswarm_attestations (
  id TEXT PRIMARY KEY,
  requester_key TEXT NOT NULL REFERENCES openswarm_parties(key) ON DELETE CASCADE,
  visibility TEXT NOT NULL,
  basis TEXT NOT NULL,
  license TEXT,
  description TEXT,
  notice_endpoint TEXT,
  -- Exactly one subject: a v1/v2 infohash (public), a file key (private) or a
  -- channel key (a live stream). Enforced below.
  infohash_v1 TEXT,
  infohash_v2 TEXT,
  file_key TEXT,
  channel_key TEXT,
  -- Every swarm on the market carries a README. No README, no listing.
  readme TEXT NOT NULL,
  readme_sha256 TEXT NOT NULL,
  -- The signed record exactly as received, so anyone can re-verify it.
  record JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed',
  -- A public claim is only listed once this passes (pay2seed §3.3).
  claim_window_ends_at TIMESTAMPTZ,
  honoured_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_attestations_visibility_check CHECK (visibility IN ('public', 'private')),
  CONSTRAINT openswarm_attestations_basis_check
    CHECK (basis IN ('own', 'licensed', 'open-license', 'public-domain', 'personal')),
  CONSTRAINT openswarm_attestations_status_check
    CHECK (status IN ('claimed', 'honoured', 'voided')),
  -- personal is for a private backup nobody else is meant to read.
  CONSTRAINT openswarm_attestations_personal_check
    CHECK (basis <> 'personal' OR visibility = 'private'),
  CONSTRAINT openswarm_attestations_license_check
    CHECK (basis <> 'open-license' OR license IS NOT NULL),
  -- A public swarm must say where a notice goes.
  CONSTRAINT openswarm_attestations_notice_check
    CHECK (visibility = 'private' OR notice_endpoint IS NOT NULL),
  CONSTRAINT openswarm_attestations_readme_check CHECK (length(readme) BETWEEN 1 AND 65536),
  CONSTRAINT openswarm_attestations_subject_check CHECK (
    (CASE WHEN infohash_v1 IS NOT NULL OR infohash_v2 IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN file_key IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN channel_key IS NOT NULL THEN 1 ELSE 0 END) = 1
  ),
  -- An infohash subject is public; a file key is private.
  CONSTRAINT openswarm_attestations_public_check
    CHECK (NOT (infohash_v1 IS NOT NULL OR infohash_v2 IS NOT NULL) OR visibility = 'public'),
  CONSTRAINT openswarm_attestations_private_check
    CHECK (file_key IS NULL OR visibility = 'private')
);

CREATE INDEX IF NOT EXISTS idx_openswarm_attestations_requester ON openswarm_attestations(requester_key);
CREATE INDEX IF NOT EXISTS idx_openswarm_attestations_status ON openswarm_attestations(status);
CREATE INDEX IF NOT EXISTS idx_openswarm_attestations_v1 ON openswarm_attestations(infohash_v1);
CREATE INDEX IF NOT EXISTS idx_openswarm_attestations_file ON openswarm_attestations(file_key);
CREATE INDEX IF NOT EXISTS idx_openswarm_attestations_channel ON openswarm_attestations(channel_key);
-- One honoured claim per public infohash: the second requester is refused
-- unless their basis does not depend on who is asking (pay2seed §3.3).
CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_attestations_one_honoured_v1
  ON openswarm_attestations(infohash_v1)
  WHERE infohash_v1 IS NOT NULL AND status = 'honoured';

DROP TRIGGER IF EXISTS trigger_openswarm_attestations_updated_at ON openswarm_attestations;
CREATE TRIGGER trigger_openswarm_attestations_updated_at
  BEFORE UPDATE ON openswarm_attestations
  FOR EACH ROW EXECUTE FUNCTION update_openswarm_updated_at();

-- ---------------------------------------------------------------------------
-- Offers: a budget escrowed for a swarm to be held.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS openswarm_offers (
  id TEXT PRIMARY KEY,
  attestation_id TEXT NOT NULL REFERENCES openswarm_attestations(id) ON DELETE CASCADE,
  requester_key TEXT NOT NULL REFERENCES openswarm_parties(key) ON DELETE CASCADE,
  visibility TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  days INTEGER NOT NULL,
  seeders_min INTEGER NOT NULL DEFAULT 1,
  seeders_max INTEGER NOT NULL DEFAULT 1,
  price_usd_per_gib_month NUMERIC(12, 6) NOT NULL,
  budget_usd NUMERIC(14, 6) NOT NULL,
  -- What leases have earned so far; the rest is refundable.
  spent_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  -- The hub's 1 percent, charged to the requester on top of the budget.
  fee_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  proof_every_hours INTEGER NOT NULL DEFAULT 6,
  trackers JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- A pass so a leased seeder can pull a paid private swarm as a paying peer.
  pass JSONB,
  record JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_id TEXT,
  paid_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_offers_status_check
    CHECK (status IN ('unpaid', 'pending', 'active', 'settled', 'voided')),
  CONSTRAINT openswarm_offers_visibility_check CHECK (visibility IN ('public', 'private')),
  CONSTRAINT openswarm_offers_seeders_check CHECK (seeders_min >= 1 AND seeders_max >= seeders_min),
  CONSTRAINT openswarm_offers_days_check CHECK (days > 0),
  CONSTRAINT openswarm_offers_size_check CHECK (size_bytes > 0),
  CONSTRAINT openswarm_offers_price_check CHECK (price_usd_per_gib_month >= 0),
  CONSTRAINT openswarm_offers_budget_check CHECK (budget_usd >= 0 AND spent_usd >= 0),
  CONSTRAINT openswarm_offers_proof_check CHECK (proof_every_hours BETWEEN 1 AND 168)
);

CREATE INDEX IF NOT EXISTS idx_openswarm_offers_status ON openswarm_offers(status);
CREATE INDEX IF NOT EXISTS idx_openswarm_offers_requester ON openswarm_offers(requester_key);
CREATE INDEX IF NOT EXISTS idx_openswarm_offers_attestation ON openswarm_offers(attestation_id);
CREATE INDEX IF NOT EXISTS idx_openswarm_offers_expires ON openswarm_offers(expires_at);
-- Unique so a retried webhook cannot pay the same offer twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_offers_payment
  ON openswarm_offers(payment_id) WHERE payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_openswarm_offers_updated_at ON openswarm_offers;
CREATE TRIGGER trigger_openswarm_offers_updated_at
  BEFORE UPDATE ON openswarm_offers
  FOR EACH ROW EXECUTE FUNCTION update_openswarm_updated_at();

-- ---------------------------------------------------------------------------
-- Leases: one seeder's slot on an offer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS openswarm_leases (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES openswarm_offers(id) ON DELETE CASCADE,
  seeder_key TEXT NOT NULL REFERENCES openswarm_parties(key) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  price_usd_per_gib_month NUMERIC(12, 6) NOT NULL,
  -- The payer and payee kinds at lease time, so the lane survives a party
  -- later changing kind. h2h, h2b, b2h or b2b.
  lane TEXT NOT NULL,
  earned_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  periods_proven INTEGER NOT NULL DEFAULT 0,
  periods_failed INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'fetching',
  grace_hours INTEGER NOT NULL DEFAULT 24,
  last_proof_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_leases_status_check
    CHECK (status IN ('fetching', 'proven', 'lapsed', 'abandoned', 'ended', 'voided')),
  CONSTRAINT openswarm_leases_lane_check CHECK (lane IN ('h2h', 'h2b', 'b2h', 'b2b')),
  CONSTRAINT openswarm_leases_slot_check CHECK (slot >= 1)
);

-- One lease per seeder per offer, and one seeder per slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_leases_one_per_seeder
  ON openswarm_leases(offer_id, seeder_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_leases_slot
  ON openswarm_leases(offer_id, slot)
  WHERE status <> 'abandoned' AND status <> 'voided';
CREATE INDEX IF NOT EXISTS idx_openswarm_leases_seeder ON openswarm_leases(seeder_key);
CREATE INDEX IF NOT EXISTS idx_openswarm_leases_status ON openswarm_leases(status);
CREATE INDEX IF NOT EXISTS idx_openswarm_leases_lane ON openswarm_leases(lane);

DROP TRIGGER IF EXISTS trigger_openswarm_leases_updated_at ON openswarm_leases;
CREATE TRIGGER trigger_openswarm_leases_updated_at
  BEFORE UPDATE ON openswarm_leases
  FOR EACH ROW EXECUTE FUNCTION update_openswarm_updated_at();

-- ---------------------------------------------------------------------------
-- Proofs and receipts: what a period was paid for.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS openswarm_proofs (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES openswarm_leases(id) ON DELETE CASCADE,
  period INTEGER NOT NULL,
  kind TEXT NOT NULL,
  verifier_key TEXT,
  passed BOOLEAN NOT NULL,
  detail TEXT,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_proofs_kind_check CHECK (kind IN ('challenge', 'probe')),
  CONSTRAINT openswarm_proofs_period_check CHECK (period >= 0)
);

-- One verdict per period per lease: a retried report updates, never doubles.
CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_proofs_period
  ON openswarm_proofs(lease_id, period);

CREATE TABLE IF NOT EXISTS openswarm_receipts (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES openswarm_leases(id) ON DELETE CASCADE,
  proof_id TEXT REFERENCES openswarm_proofs(id) ON DELETE SET NULL,
  period INTEGER NOT NULL,
  earned_usd NUMERIC(14, 6) NOT NULL,
  balance_usd NUMERIC(14, 6) NOT NULL,
  lane TEXT NOT NULL,
  record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_receipts_lane_check CHECK (lane IN ('h2h', 'h2b', 'b2h', 'b2b')),
  CONSTRAINT openswarm_receipts_earned_check CHECK (earned_usd >= 0)
);

-- A period is paid once. This unique index is the whole of the idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_receipts_period
  ON openswarm_receipts(lease_id, period);
CREATE INDEX IF NOT EXISTS idx_openswarm_receipts_lane ON openswarm_receipts(lane);

-- ---------------------------------------------------------------------------
-- Notices: anyone may claim against an attestation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS openswarm_notices (
  id TEXT PRIMARY KEY,
  attestation_id TEXT NOT NULL REFERENCES openswarm_attestations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  claimant_name TEXT,
  claimant_contact TEXT,
  statement TEXT NOT NULL,
  record JSONB NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'received',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_notices_kind_check
    CHECK (kind IN ('rights', 'illegal', 'personal-data', 'other')),
  CONSTRAINT openswarm_notices_outcome_check
    CHECK (outcome IN ('received', 'voided', 'stands'))
);

CREATE INDEX IF NOT EXISTS idx_openswarm_notices_attestation ON openswarm_notices(attestation_id);
CREATE INDEX IF NOT EXISTS idx_openswarm_notices_outcome ON openswarm_notices(outcome);

-- ---------------------------------------------------------------------------
-- Teams: who may decrypt a private swarm. This is what the hub sells.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS openswarm_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key TEXT NOT NULL REFERENCES openswarm_parties(key) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- File keys or publisher keys members may be granted; ["*"] under the owner.
  scope JSONB NOT NULL DEFAULT '{"files":["*"],"publishers":[]}'::JSONB,
  rotate_on_remove BOOLEAN NOT NULL DEFAULT TRUE,
  seats_paid INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_teams_name_check CHECK (length(name) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_teams_owner_name ON openswarm_teams(owner_key, name);

DROP TRIGGER IF EXISTS trigger_openswarm_teams_updated_at ON openswarm_teams;
CREATE TRIGGER trigger_openswarm_teams_updated_at
  BEFORE UPDATE ON openswarm_teams
  FOR EACH ROW EXECUTE FUNCTION update_openswarm_updated_at();

CREATE TABLE IF NOT EXISTS openswarm_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES openswarm_teams(id) ON DELETE CASCADE,
  member_key TEXT NOT NULL REFERENCES openswarm_parties(key) ON DELETE CASCADE,
  box_key TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_team_members_role_check CHECK (role IN ('admin', 'member', 'readonly'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_team_members_unique
  ON openswarm_team_members(team_id, member_key) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS openswarm_team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES openswarm_teams(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES openswarm_parties(key) ON DELETE CASCADE,
  -- An email, a handle or a key. The invitee brings a key when they redeem.
  invitee TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_by TEXT REFERENCES openswarm_parties(key) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT openswarm_team_invites_role_check CHECK (role IN ('admin', 'member', 'readonly'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_openswarm_team_invites_token ON openswarm_team_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_openswarm_team_invites_team ON openswarm_team_invites(team_id);

-- ---------------------------------------------------------------------------
-- Row level security. Everything here is written by the service role: the
-- records are signed by keys, not by site sessions, so a browser session is
-- never the authority. Reads of the public market go through the API, which
-- decides what a stranger may see.
-- ---------------------------------------------------------------------------
ALTER TABLE openswarm_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE openswarm_team_invites ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'openswarm_parties', 'openswarm_attestations', 'openswarm_offers', 'openswarm_leases',
    'openswarm_proofs', 'openswarm_receipts', 'openswarm_notices', 'openswarm_teams',
    'openswarm_team_members', 'openswarm_team_invites'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role manages %1$s" ON %1$s', t);
    EXECUTE format(
      'CREATE POLICY "Service role manages %1$s" ON %1$s FOR ALL USING (auth.jwt() ->> ''role'' = ''service_role'')',
      t
    );
  END LOOP;
END $$;

-- A signed-in account can read the parties it owns, so the site can show a
-- person their own keys, balance and standing without the service role.
DROP POLICY IF EXISTS "Owners read own parties" ON openswarm_parties;
CREATE POLICY "Owners read own parties"
  ON openswarm_parties FOR SELECT
  USING (auth.uid() = account_id);
