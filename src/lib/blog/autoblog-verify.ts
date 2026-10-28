/**
 * Verify a signed autoblog delivery (crawlproof / outrank -> /api/webhooks/autoblog).
 *
 * The signature is checked with @profullstack/webhooks' verifyAndParse. The
 * autoblog sender keys its HMAC with the token's UTF-8 bytes (the whole
 * string, even one shaped like `whsec_...`), while the webhooks package
 * base64-decodes anything after `whsec_`. So the key is passed as bytes,
 * which verifies every token exactly as the autoblog receiver did.
 */

import { verifyAndParse } from '@profullstack/webhooks';
import type { Post as AutoblogPost } from '@profullstack/autoblog';

export type { AutoblogPost };

function isValidPost(p: unknown): p is AutoblogPost {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.slug === 'string' &&
    typeof o.html === 'string' &&
    typeof o.status === 'string' &&
    typeof o.published_at === 'string' &&
    Array.isArray(o.tags) &&
    Array.isArray(o.categories)
  );
}

/**
 * Verify a signed autoblog delivery and pull out its post. Same checks and
 * answers as @profullstack/autoblog's verifyAndParse: 401 on a bad signature
 * or stale timestamp, 400 on bad JSON or a malformed CloudEvent envelope.
 */
export function verifyAutoblogDelivery(
  headers: Record<string, string> | Headers,
  body: string,
  token: string,
): { ok: true; post: AutoblogPost } | { ok: false; status: number; reason: string } {
  const r = verifyAndParse<Record<string, unknown>>({ headers, body, secret: Buffer.from(token, 'utf8') });
  if (!r.ok) return { ok: false, status: r.status, reason: r.reason };
  const e = r.event;
  const data = e.data as Record<string, unknown> | undefined;
  if (
    e.specversion !== '1.0' ||
    typeof e.id !== 'string' ||
    typeof e.type !== 'string' ||
    typeof e.source !== 'string' ||
    !data ||
    typeof data !== 'object' ||
    !isValidPost(data.post)
  ) {
    return { ok: false, status: 400, reason: 'invalid event envelope' };
  }
  return { ok: true, post: data.post };
}

