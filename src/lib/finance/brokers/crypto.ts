/**
 * Finance — broker credential encryption (PRD §3.4, §8).
 *
 * Reuses the platform's AES-256-GCM scheme (same `ENCRYPTION_KEY` as SMTP/email
 * credentials). Credentials are JSON blobs encrypted at rest and NEVER returned
 * to the client. Format: `fenc:v1:<iv>:<tag>:<ciphertext>` (base64url).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'fenc:v1';
const IV_BYTES = 12;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.ENCYRPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is required to store broker credentials');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptJson(value: unknown): string {
  const plaintext = JSON.stringify(value);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptJson<T = unknown>(value: string): T {
  if (!value.startsWith(`${PREFIX}:`)) {
    throw new Error('Invalid encrypted broker credential format');
  }
  const [, , ivPart, tagPart, ciphertextPart] = value.split(':');
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Invalid encrypted broker credential format');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as T;
}
