/**
 * Anonymous viewer identity for VOD access.
 *
 * A viewer gets one high-entropy key in an httpOnly cookie (`vod_viewer_<slug>`)
 * at their first checkout. Every grant they buy — a weekly pass and/or per-title
 * purchases — is tagged with `viewer_key_hash = sha256(key)`, so a single cookie
 * ties all of a viewer's grants together (a per-grant cookie couldn't). The key
 * never reaches client JS (httpOnly) and is only ever compared as a hash.
 */

import { createHash, randomBytes } from 'node:crypto';

export function vodViewerCookieName(slug: string): string {
  return `vod_viewer_${slug}`;
}

export function generateViewerKey(): string {
  return randomBytes(24).toString('base64url');
}

export function hashViewerKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateProviderSlug(): string {
  return randomBytes(9).toString('base64url'); // 12 chars
}
