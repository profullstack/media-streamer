/**
 * Key vault: the one sealer every user secret on bittorrented goes through.
 *
 * Secrets a user gives us (seedbox SSH keys and tokens, SMTP/IMAP passwords,
 * broker API keys, Spotify credentials, VOD source logins) are sealed under a
 * data key that only the user's passphrase or recovery key can unwrap
 * (@profullstack/sealed-secrets: PBKDF2-SHA256 600k -> HKDF -> AES-256-GCM).
 * Nothing on the server can open them. Runs in the browser and on the server.
 */

import { createSealer } from '@profullstack/sealed-secrets';

export const VAULT_APP = 'bittorrented';
export const VAULT_SCOPE = 'user_secrets';

export const sealer = createSealer({ app: VAULT_APP, scope: VAULT_SCOPE });

/** Copy for every place a user can create or unlock their vault. */
export const LOST_PASSPHRASE_COPY =
  'If you lose both your passphrase and your recovery key, the secrets in your vault are gone for good: ' +
  'nobody at bittorrented can open them. You would have to re-enter your keys and passwords.';
