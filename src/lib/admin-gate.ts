/**
 * Admins only: while bittorrented.com is offline, an admin account is the one way in.
 *
 * Anthony, 2026-10-05: "it only serves is_admin accounts from now on" and "no way for anyone
 * to access the data even if they pay". A paid membership is not enough; only an account
 * that checkUserAdmin accepts (user_profiles.is_admin, or the legacy admin_users table)
 * gets past the offline notice. Legal mode still applies to admins.
 *
 * The session is verified by Supabase (/auth/v1/user), not by decoding the cookie ourselves,
 * so a forged or expired token is refused. Every failure (no cookie, bad token, Supabase
 * unreachable, query error) answers "not an admin": this gate fails closed.
 */

import { checkUserAdmin } from '@/lib/admin';

const AUTH_COOKIE_NAME = 'sb-auth-token';
const VERIFY_TIMEOUT_MS = 3000;
/** How long one verified answer is reused for the same access token. */
const CACHE_MS = 60_000;

const cache = new Map<string, { admin: boolean; until: number }>();

/** Sign-in pages stay reachable so an admin can log in. Signup is open only with an invite (site-offline.ts). */
const SIGN_IN = ['/login', '/forgot-password', '/reset-password', '/api/auth'];

export function isSignInPath(pathname: string): boolean {
  return SIGN_IN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/** The caller's access token, from the session cookie or an Authorization header. */
export function accessTokenOf(cookies: CookieReader, authorization: string | null): string | null {
  const bearer = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) return bearer;
  const raw = cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const session = JSON.parse(decodeURIComponent(raw)) as { access_token?: unknown };
    return typeof session.access_token === 'string' ? session.access_token : null;
  } catch {
    return null;
  }
}

async function verifiedUserId(token: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: unknown };
  return typeof user.id === 'string' ? user.id : null;
}

export async function isAdminRequest(
  cookies: CookieReader,
  authorization: string | null,
  check: (userId: string) => Promise<{ isAdmin: boolean }> = checkUserAdmin
): Promise<boolean> {
  const token = accessTokenOf(cookies, authorization);
  if (!token) return false;
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.admin;
  let admin = false;
  try {
    const userId = await verifiedUserId(token);
    admin = userId ? (await check(userId)).isAdmin : false;
  } catch {
    admin = false;
  }
  if (cache.size > 1000) cache.clear();
  cache.set(token, { admin, until: Date.now() + CACHE_MS });
  return admin;
}

/**
 * A Chromecast fetching what an admin cast: no cookie, only the signed `ct`
 * (src/lib/cast/token.ts), and only on the media routes a cast token opens.
 * The token's user must be an admin by the same check as a session; it fails
 * closed the same way.
 */
export async function isAdminCastRequest(
  requestUrl: string,
  check: (userId: string) => Promise<{ isAdmin: boolean }> = checkUserAdmin
): Promise<boolean> {
  const { CAST_TOKEN_PARAM, isCastablePath, verifyCastToken } = await import('@/lib/cast/token');
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return false;
  }
  if (!isCastablePath(url.pathname)) return false;
  const token = url.searchParams.get(CAST_TOKEN_PARAM);
  if (!token) return false;
  const key = `cast:${token}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.admin;
  let admin = false;
  // Never remember a yes past the token's own expiry.
  let until = Date.now() + CACHE_MS;
  try {
    const claims = await verifyCastToken(token);
    admin = claims ? (await check(claims.userId)).isAdmin : false;
    if (claims) until = Math.min(until, claims.expiresAt * 1000);
  } catch {
    admin = false;
  }
  if (cache.size > 1000) cache.clear();
  cache.set(key, { admin, until });
  return admin;
}
