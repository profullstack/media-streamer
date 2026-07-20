/**
 * Session-pass tokens & cookies for seedbox rentals.
 *
 * A paid grant is a bearer session pass. At checkout we generate a
 * high-entropy token, store only its SHA-256 hash on the grant row, and set an
 * httpOnly cookie carrying `<grantId>.<token>` for the visitor's browser. The
 * cookie is set at checkout time but is useless until the CoinPayPortal webhook
 * flips the grant to `paid` (the stream/download routes require `paid` +
 * unexpired), so an unpaid cookie grants nothing.
 *
 * The raw token never reaches client JS (httpOnly) and never leaves the server
 * except inside that Set-Cookie. We compare the presented token against the
 * stored hash in constant time.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Per-share cookie name so a browser can hold passes to several rentals. Keyed
 * by the public slug, which the routes have on hand before any DB lookup. */
export function passCookieName(slug: string): string {
  return `share_pass_${slug}`;
}

/** A fresh, unguessable session-pass token. */
export function generateGrantToken(): string {
  return randomBytes(24).toString('base64url');
}

/** SHA-256 hex of a token, for at-rest storage / comparison. */
export function hashGrantToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time check that a presented token matches a stored hash. */
export function verifyGrantToken(token: string, storedHash: string): boolean {
  if (!token || !storedHash) return false;
  const presented = Buffer.from(hashGrantToken(token), 'hex');
  let expected: Buffer;
  try {
    expected = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/** Cookie value carrying the grant id + raw token. */
export function buildPassCookieValue(grantId: string, token: string): string {
  return `${grantId}.${token}`;
}

/** Parse `<grantId>.<token>` back out of a cookie value. */
export function parsePassCookieValue(
  value: string | undefined | null
): { grantId: string; token: string } | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0 || dot >= value.length - 1) return null;
  return { grantId: value.slice(0, dot), token: value.slice(dot + 1) };
}

/** Random URL-safe slug for a public rental link. */
export function generateShareSlug(): string {
  return randomBytes(9).toString('base64url'); // 12 chars, ~72 bits
}
