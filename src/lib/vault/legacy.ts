/**
 * Legacy server-key ciphertext (seal_version 1), readable ONLY by the one-shot
 * migration that re-seals a user's rows under their own vault.
 *
 * Before 2026-10-28 every user secret was AES-256-GCM under sha256(ENCRYPTION_KEY),
 * a key the app held 24/7, so root on the box could read them all. Formats:
 *   fenc:v1:<iv>:<tag>:<ct>  broker credentials
 *   senc:v1:<iv>:<tag>:<ct>  seedbox, Spotify, VOD source secrets
 *   enc:v1:<iv>:<tag>:<ct>   SMTP/IMAP credentials (unprefixed values were plaintext)
 *
 * Nothing here encrypts. LEGACY_KEY_MIGRATION=off is the cutoff switch: after it
 * the legacy rows are unreadable even to the migration, and the env key can go.
 */

import { createDecipheriv, createHash } from 'node:crypto';

import { SEALED_PREFIX } from './fields';

const LEGACY_PREFIXES = ['fenc:v1:', 'senc:v1:', 'enc:v1:'] as const;

export function legacyMigrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LEGACY_KEY_MIGRATION ?? 'on').trim().toLowerCase() !== 'off';
}

/** True for any stored non-empty value that is not a vault seal (old ciphertext or plaintext). */
export function isLegacyValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith(SEALED_PREFIX);
}

function legacyKey(env: NodeJS.ProcessEnv): Buffer {
  const secret = env.ENCRYPTION_KEY ?? env.ENCYRPTION_KEY ?? env.EMAIL_ACCOUNTS_ENCRYPTION_KEY;
  if (!secret) throw new Error('legacy secret cannot be migrated: ENCRYPTION_KEY is not set');
  return createHash('sha256').update(secret).digest();
}

/**
 * Open one legacy value for migration. Unprefixed values were stored as
 * plaintext and are returned unchanged. Throws when migration is switched off.
 */
export function openLegacyValue(value: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!legacyMigrationEnabled(env)) {
    throw new Error('legacy secret migration is switched off (LEGACY_KEY_MIGRATION=off)');
  }
  const prefix = LEGACY_PREFIXES.find((p) => value.startsWith(p));
  if (!prefix) return value; // stored in plaintext before encryption existed
  const [ivPart, tagPart, ctPart] = value.slice(prefix.length).split(':');
  if (!ivPart || !tagPart || !ctPart) throw new Error('invalid legacy ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', legacyKey(env), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctPart, 'base64url')), decipher.final()]).toString('utf8');
}
