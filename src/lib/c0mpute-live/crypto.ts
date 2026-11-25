/**
 * The stream key at rest: AES-256-GCM under a key derived from a server secret.
 *
 * A c0mpute stream key is all it takes to publish as the member, so the database
 * holds only this sealed form. The key is sha256 of ENCRYPTION_KEY, or of the
 * service-role key when that is not set.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { runtimeEnv } from './oauth';

const PREFIX = 'c0k1';

export function streamKeySecret(): string | null {
  return runtimeEnv('ENCRYPTION_KEY') || runtimeEnv('SUPABASE_SERVICE_ROLE_KEY') || null;
}

const derive = (secret: string): Buffer => createHash('sha256').update(`bittorrented-c0mpute-live:${secret}`).digest();

export function sealStreamKey(streamKey: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(secret), iv);
  const ct = Buffer.concat([cipher.update(streamKey, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

/** Throws on anything not sealed under this secret, or edited since. */
export function openStreamKey(sealed: string, secret: string): string {
  const [prefix, iv, tag, ct] = sealed.split(':');
  if (prefix !== PREFIX || !iv || !tag || !ct) throw new Error('invalid sealed stream key');
  const decipher = createDecipheriv('aes-256-gcm', derive(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
