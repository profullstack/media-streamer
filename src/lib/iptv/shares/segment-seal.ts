/**
 * Seal upstream segment URLs inside rewritten IPTV manifests.
 *
 * The key is random per process and never stored: a segment URL only has to
 * survive until the player fetches it (seconds), and a restart simply makes the
 * player reload the manifest. This used to borrow the user-secret ENCRYPTION_KEY;
 * it no longer touches any long-lived key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'seg1';
const KEY = Symbol.for('bittorrented.iptv.segmentKey');

function key(): Buffer {
  const g = globalThis as typeof globalThis & { [KEY]?: Buffer };
  if (!g[KEY]) g[KEY] = randomBytes(32);
  return g[KEY]!;
}

export function sealSegmentUrl(url: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

/** Throws on anything this process did not seal. */
export function openSegmentUrl(value: string): string {
  const [prefix, iv, tag, ct] = value.split(':');
  if (prefix !== PREFIX || !iv || !tag || !ct) throw new Error('invalid segment token');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
