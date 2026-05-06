/**
 * In-memory store of in-flight SiriusXM logins, keyed by userId.
 *
 * Lives on a single Node process. If we ever go multi-instance the start/
 * complete pair must move to Redis or a Supabase row with TTL.
 */

interface PendingLogin {
  email: string;
  identityId: string;
  anonAccessToken: string;
  cookies: string;
  proxySessionId?: string;
  /** Unix ms */
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;

const store = new Map<string, PendingLogin>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

export function putPendingLogin(
  userId: string,
  data: {
    email: string;
    identityId: string;
    anonAccessToken: string;
    cookies: string;
    proxySessionId?: string;
  }
): void {
  purgeExpired();
  store.set(userId, { ...data, expiresAt: Date.now() + TTL_MS });
}

export function takePendingLogin(userId: string): PendingLogin | null {
  purgeExpired();
  const entry = store.get(userId);
  if (!entry) return null;
  store.delete(userId);
  return entry;
}
