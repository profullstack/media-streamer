-- Key vault (2026-10-28): user secrets are sealed under a key only the user holds.
--
-- user_secret_vaults holds each user's seal record: KDF salt/params, the data key
-- wrapped by their passphrase (and by a one-time recovery key), a key-check value
-- and an inbox public key. Nothing in it opens without the passphrase or the
-- recovery key. Service role only: RLS on, no policies, no grants to clients.
--
-- Secret columns (seedbox tokens/SSH key, SMTP/IMAP passwords, broker
-- credentials, Spotify credentials, VOD source secrets) keep their names; a
-- value starting with 'ss2:' is seal_version 2 (vault-sealed). Anything else is
-- legacy (old ENCRYPTION_KEY ciphertext or plaintext) and is re-sealed by the
-- owner's next unlock. Count what is left with scripts/vault-legacy-report.sql.

CREATE TABLE IF NOT EXISTS public.user_secret_vaults (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seal jsonb NOT NULL,
  seal_version smallint NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_secret_vaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_secret_vaults FROM anon, authenticated;
GRANT ALL ON public.user_secret_vaults TO service_role;

COMMENT ON TABLE public.user_secret_vaults IS
  'Per-user seal record for sealed secrets (@profullstack/sealed-secrets, app bittorrented). Ciphertext only.';
