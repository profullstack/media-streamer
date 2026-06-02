-- Referral program: 60% affiliate commission, 20% customer discount
CREATE TABLE IF NOT EXISTS referral_codes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code        text        NOT NULL UNIQUE,
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

CREATE TABLE IF NOT EXISTS referral_usages (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code             text        NOT NULL,
  affiliate_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  new_user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents     integer     NOT NULL,
  commission_cents integer     NOT NULL,
  discount_cents   integer     NOT NULL,
  applied_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_codes_owner_idx   ON referral_codes(owner_id);
CREATE INDEX IF NOT EXISTS referral_usages_aff_idx    ON referral_usages(affiliate_id);
CREATE INDEX IF NOT EXISTS referral_usages_new_idx    ON referral_usages(new_user_id);

ALTER TABLE referral_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_usages  ENABLE ROW LEVEL SECURITY;

-- Codes are publicly readable so anyone can validate them
CREATE POLICY "referral_codes_public_read"    ON referral_codes  FOR SELECT USING (true);
-- Only the owner can insert their own code (service-role bypasses this)
CREATE POLICY "referral_codes_owner_insert"   ON referral_codes  FOR INSERT WITH CHECK (owner_id = auth.uid());
-- Affiliate and new user can read their own usages
CREATE POLICY "referral_usages_participant"   ON referral_usages FOR SELECT
  USING (affiliate_id = auth.uid() OR new_user_id = auth.uid());

