/**
 * Pass tokens & cookies for IPTV resale.
 *
 * The token primitives are imported from the seedbox rental module rather than
 * copied. They carry no seedbox semantics — they are generate/hash/constant-time
 * compare — and duplicating security-critical crypto means two places to fix the
 * next bug in it, with no signal when only one gets fixed.
 *
 * Only the cookie name differs, and it must: a browser holding both a seedbox pass
 * and an IPTV pass for the same slug would otherwise overwrite one with the other.
 */

import { randomBytes } from 'node:crypto';

export {
  buildPassCookieValue,
  generateGrantToken,
  hashGrantToken,
  parsePassCookieValue,
  verifyGrantToken,
} from '@/lib/seedbox/shares/pass';

/** Per-share cookie name, namespaced away from the seedbox rental cookie. */
export function iptvPassCookieName(slug: string): string {
  return `iptv_pass_${slug}`;
}

/** Random URL-safe slug for a public resale link. */
export function generateIptvShareSlug(): string {
  return randomBytes(9).toString('base64url'); // 12 chars, ~72 bits
}
