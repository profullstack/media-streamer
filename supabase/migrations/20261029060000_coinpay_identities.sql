-- Sign in with CoinPay: the CoinPay account a bittorrented user has connected.
--
-- CoinPay (coinpayportal.com) is the fleet's master account and an OIDC
-- provider; we are a confidential client. The binding is keyed by CoinPay's
-- `sub` and is the whole identity: "Sign in with CoinPay" signs in only the
-- account that connected that sub, never one whose address matches the email
-- CoinPay reports (CoinPay does not verify addresses; email_verified is always
-- false). One CoinPay account per account here, and one account per sub.
--
-- Only the server writes it (the OAuth callback and Disconnect, both with the
-- service role): a signed-in user able to INSERT here could bind somebody
-- else's CoinPay sub to their own account. Reading your own row is allowed.
CREATE TABLE IF NOT EXISTS bt_coinpay_identities (
  sub TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,           -- contact information only, never an account key
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

ALTER TABLE bt_coinpay_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own CoinPay identity" ON bt_coinpay_identities;
CREATE POLICY "Users can view own CoinPay identity"
  ON bt_coinpay_identities FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON bt_coinpay_identities FROM anon, authenticated;
