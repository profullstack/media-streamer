/**
 * Seedbox credential encryption.
 *
 * Per-account seedbox connections store secrets (HTTP/files API tokens, the SSH
 * private key, and any basic-auth password) in `account_seedbox_configs`. Those
 * secrets are encrypted at rest with the platform's AES-256-GCM scheme (same
 * `ENCRYPTION_KEY` as SMTP/email + broker credentials) and NEVER returned to the
 * client. Envelope format: `senc:v1:<iv>:<tag>:<ciphertext>` (base64url).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'senc:v1';
const IV_BYTES = 12;

function getKey(): Buffer {
  // Tolerate the historical `ENCYRPTION_KEY` misspelling used elsewhere in the app.
  const secret = process.env.ENCRYPTION_KEY ?? process.env.ENCYRPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is required to store seedbox credentials');
  }
  return createHash('sha256').update(secret).digest();
}

/** True for a value produced by {@link encryptSecret}. */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

/** Encrypt a plaintext secret string for storage. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/** Decrypt a value produced by {@link encryptSecret}. */
export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) {
    throw new Error('Invalid encrypted seedbox credential format');
  }
  const [, , ivPart, tagPart, ciphertextPart] = value.split(':');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Invalid encrypted seedbox credential format');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Encrypt when a non-empty secret is present; pass through null/empty. */
export function encryptOptional(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  const trimmed = plaintext.trim();
  return trimmed.length > 0 ? encryptSecret(trimmed) : null;
}

/** Decrypt when a stored secret is present; null otherwise. */
export function decryptOptional(value: string | null | undefined): string | null {
  if (value == null || value.length === 0) return null;
  return decryptSecret(value);
}
