/**
 * Who is asking: a signed-in member, and whether that member is an admin.
 *
 * The site is invite only (site-offline.ts): any verified account gets in, and since an
 * account can only be created with an invite, that is the invitation check. Anthony,
 * 2026-10-12: "its all live its just invite only". Admins (checkUserAdmin:
 * user_profiles.is_admin, or the legacy admin_users table) are also exempt from legal mode.
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

export interface Access {
  /** A real, verified account. */
  member: boolean;
  admin: boolean;
}

const NOBODY: Access = { member: false, admin: false };

const cache = new Map<string, Access & { until: number }>();

function remember(key: string, access: Access, until = Date.now() + CACHE_MS): Access {
  if (cache.size > 1000) cache.clear();
  cache.set(key, { ...access, until });
  return access;
}

/**
 * Sign-in pages stay reachable so a member can log in. Signup is open only with an invite (site-offline.ts).
 * The OAuth round trips of Sign in with CoinPay and Sign in with nixamp too: they start and
 * end without a session, because getting one is what they are for. Both sign in only an
 * account that already bound that identity (never by email), so they open nothing new.
 */
const SIGN_IN = ['/login', '/forgot-password', '/reset-password', '/api/auth', '/api/v1/coinpay/oauth', '/api/v1/nixamp/oauth'];

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

export async function requestAccess(
  cookies: CookieReader,
  authorization: string | null,
  check: (userId: string) => Promise<{ isAdmin: boolean }> = checkUserAdmin
): Promise<Access> {
  const token = accessTokenOf(cookies, authorization);
  if (!token) return NOBODY;
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return { member: hit.member, admin: hit.admin };
  let access = NOBODY;
  try {
    const userId = await verifiedUserId(token);
    if (userId) access = { member: true, admin: (await check(userId)).isAdmin };
  } catch {
    access = NOBODY;
  }
  return remember(token, access);
}

export async function isAdminRequest(
  cookies: CookieReader,
  authorization: string | null,
  check: (userId: string) => Promise<{ isAdmin: boolean }> = checkUserAdmin
): Promise<boolean> {
  return (await requestAccess(cookies, authorization, check)).admin;
}

/**
 * A Chromecast fetching what a member cast: no cookie, only the signed `ct`
 * (src/lib/cast/token.ts), and only on the media routes a cast token opens.
 * The token's user counts as a member, and as an admin by the same check as a
 * session; it fails closed the same way.
 */
export async function castAccess(
  requestUrl: string,
  check: (userId: string) => Promise<{ isAdmin: boolean }> = checkUserAdmin
): Promise<Access> {
  const { CAST_TOKEN_PARAM, isCastablePath, verifyCastToken } = await import('@/lib/cast/token');
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return NOBODY;
  }
  if (!isCastablePath(url.pathname)) return NOBODY;
  const token = url.searchParams.get(CAST_TOKEN_PARAM);
  if (!token) return NOBODY;
  const key = `cast:${token}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return { member: hit.member, admin: hit.admin };
  let access = NOBODY;
  // Never remember a yes past the token's own expiry.
  let until = Date.now() + CACHE_MS;
  try {
    const claims = await verifyCastToken(token);
    if (claims) {
      access = { member: true, admin: (await check(claims.userId)).isAdmin };
      until = Math.min(until, claims.expiresAt * 1000);
    }
  } catch {
    access = NOBODY;
  }
  return remember(key, access, until);
}

export async function isAdminCastRequest(
  requestUrl: string,
  check: (userId: string) => Promise<{ isAdmin: boolean }> = checkUserAdmin
): Promise<boolean> {
  return (await castAccess(requestUrl, check)).admin;
}
