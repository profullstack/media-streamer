/**
 * SiriusXM Auth (server-side, per user).
 *
 * The ensureSiriusXmBearer() entry point reads the current userId from
 * AsyncLocalStorage, loads that user's credentials from Supabase, and refreshes
 * via /session/v1/sessions/refresh (cookie-jar replay) when the access token
 * is near expiry. Refreshed credentials are persisted back to Supabase.
 *
 * Wrap each radio API request with `withSiriusXmUser(userId, () => handler())`
 * so deep call sites (sxmFetch, the proxy route) pick up the right user.
 *
 * The login dance (emailOtpLogin) is also exported here so the
 * /api/radio/auth/login routes can reuse the same HTTP plumbing.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  getCredentials,
  saveCredentials,
  type SiriusXmCredentials,
} from './siriusxm-credentials';

const SXM_API_BASE = 'https://api.edge-gateway.siriusxm.com';

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0',
  Accept: 'application/json; charset=utf-8',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-sxm-clock': '[0,4999]',
  Origin: 'https://www.siriusxm.com',
  Referer: 'https://www.siriusxm.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
};

export class SiriusXmAuthError extends Error {
  readonly status: number;
  readonly data: unknown;
  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.name = 'SiriusXmAuthError';
    this.status = status;
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Async user context
// ---------------------------------------------------------------------------

interface SiriusXmUserContext {
  userId: string;
}

const userContextStorage = new AsyncLocalStorage<SiriusXmUserContext>();

export function withSiriusXmUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return userContextStorage.run({ userId }, fn);
}

export function getCurrentSiriusXmUserId(): string | null {
  return userContextStorage.getStore()?.userId ?? null;
}

function requireUserId(): string {
  const userId = getCurrentSiriusXmUserId();
  if (!userId) {
    throw new SiriusXmAuthError(
      'No SiriusXM user context. Wrap the handler with withSiriusXmUser().',
      401
    );
  }
  return userId;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface SxmRequestOpts {
  method?: 'GET' | 'POST' | 'PUT';
  bearer?: string;
  body?: unknown;
  cookies?: string;
  query?: Record<string, string>;
}

interface SxmReply<T = unknown> {
  status: number;
  data: T;
  raw: string;
  setCookie: string[];
}

function getSetCookieArray(headers: Headers): string[] {
  const direct = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof direct === 'function') return direct.call(headers);
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

async function sxmCall<T>(path: string, opts: SxmRequestOpts = {}): Promise<SxmReply<T>> {
  const method = opts.method ?? 'POST';
  const url = new URL(`${SXM_API_BASE}/${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = { ...COMMON_HEADERS };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  if (opts.cookies) headers.Cookie = opts.cookies;

  const res = await fetch(url, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  return {
    status: res.status,
    data: data as T,
    raw,
    setCookie: getSetCookieArray(res.headers),
  };
}

async function sxmRequest<T>(path: string, opts: SxmRequestOpts = {}): Promise<T> {
  const reply = await sxmCall<T>(path, opts);
  if (reply.status >= 400) {
    throw new SiriusXmAuthError(
      `${opts.method ?? 'POST'} ${path} failed: ${reply.status}`,
      reply.status,
      reply.data
    );
  }
  return reply.data;
}

function mergeCookies(existing: string, setCookie: string[]): string {
  const jar = new Map<string, string>();
  for (const pair of existing.split(';').map((s) => s.trim()).filter(Boolean)) {
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
  for (const cookie of setCookie) {
    const firstSemi = cookie.indexOf(';');
    const kv = firstSemi === -1 ? cookie : cookie.slice(0, firstSemi);
    const eq = kv.indexOf('=');
    if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

const EXPIRY_SAFETY_MS = 30_000;

function jwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OTP login + session refresh (also used by the /api/radio/auth/login routes)
// ---------------------------------------------------------------------------

export interface DeviceGrant {
  grant: string;
  refreshGrant: string;
  grantExpiresAt?: string;
  refreshGrantExpiresAt?: string;
  deviceId?: string;
}

export interface SessionResult {
  accessToken: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  /** Joined Cookie-header string. Replay against /session/v1/sessions/refresh. */
  cookies: string;
}

function parseDeviceGrantCookie(setCookie: string[]): DeviceGrant | null {
  for (const cookie of setCookie) {
    const m = cookie.match(/^DEVICE_GRANT=([^;]+)/);
    if (!m) continue;
    let raw: string;
    try {
      raw = decodeURIComponent(m[1]);
    } catch {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as DeviceGrant;
      if (parsed?.grant) return parsed;
    } catch {
      // continue
    }
  }
  return null;
}

function setCookieNames(setCookie: string[]): string[] {
  return setCookie
    .map((c) => {
      const eq = c.indexOf('=');
      return eq > 0 ? c.slice(0, eq) : c;
    })
    .filter(Boolean);
}

/**
 * Mint a fresh DEVICE_GRANT.
 *
 * Strategy (in order):
 *   1. GET https://www.siriusxm.com/  — what a browser does on first visit;
 *      may set DEVICE_GRANT via Set-Cookie.
 *   2. POST /device/v1/grants  — common REST convention for "create".
 *   3. POST /device/v1/grant   — singular variant.
 *
 * On total failure, surfaces what cookies were returned so we can see the
 * actual bootstrap endpoint name and fix this.
 */
async function bootstrapDeviceGrant(): Promise<DeviceGrant> {
  const attempts: Array<{ label: string; url: string; init: RequestInit }> = [
    {
      label: 'GET siriusxm.com',
      url: 'https://www.siriusxm.com/',
      init: {
        method: 'GET',
        headers: {
          'User-Agent': COMMON_HEADERS['User-Agent'],
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': COMMON_HEADERS['Accept-Language'],
        },
        redirect: 'follow',
      },
    },
    {
      label: 'POST /device/v1/grants',
      url: `${SXM_API_BASE}/device/v1/grants`,
      init: {
        method: 'POST',
        headers: {
          ...COMMON_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: '{}',
      },
    },
    {
      label: 'POST /device/v1/grant',
      url: `${SXM_API_BASE}/device/v1/grant`,
      init: {
        method: 'POST',
        headers: {
          ...COMMON_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: '{}',
      },
    },
  ];

  const failureLog: string[] = [];

  for (const attempt of attempts) {
    let res: Response;
    try {
      res = await fetch(attempt.url, attempt.init);
    } catch (err) {
      failureLog.push(`${attempt.label}: fetch threw ${(err as Error).message}`);
      continue;
    }

    const setCookie = getSetCookieArray(res.headers);
    const fromCookie = parseDeviceGrantCookie(setCookie);
    if (fromCookie) return fromCookie;

    // Some endpoints may return the grant in the JSON body.
    let parsedFromBody: DeviceGrant | null = null;
    try {
      const text = await res.clone().text();
      if (text.startsWith('{')) {
        const json = JSON.parse(text) as Record<string, unknown>;
        const top = json as unknown as DeviceGrant;
        const nested = json.deviceGrant as DeviceGrant | undefined;
        const candidate = top.grant && top.refreshGrant ? top : (nested ?? null);
        if (candidate?.grant) parsedFromBody = candidate;
      }
    } catch {
      // ignore
    }
    if (parsedFromBody) return parsedFromBody;

    failureLog.push(
      `${attempt.label}: HTTP ${res.status}, cookies=[${setCookieNames(setCookie).join(', ')}]`
    );
  }

  throw new SiriusXmAuthError(
    `failed to bootstrap DEVICE_GRANT. Tried: ${failureLog.join(' | ')}`,
    502
  );
}

function extractSession(reply: SxmReply<unknown>, jar: string): SessionResult {
  const root = reply.data as Record<string, unknown> | null;
  const nested = (root?.session as Record<string, unknown> | undefined) ?? root ?? {};
  const accessToken =
    (nested.accessToken as string | undefined) ?? (nested.access_token as string | undefined);
  if (!accessToken) {
    throw new SiriusXmAuthError(
      `no accessToken in session response: ${reply.raw.slice(0, 500)}`,
      500
    );
  }
  return {
    accessToken,
    accessTokenExpiresAt:
      (nested.accessTokenExpiresAt as string | undefined) ??
      (nested.access_token_expires_at as string | undefined),
    refreshTokenExpiresAt:
      (nested.refreshTokenExpiresAt as string | undefined) ??
      (nested.refresh_token_expires_at as string | undefined),
    cookies: mergeCookies(jar, reply.setCookie),
  };
}

/**
 * Stage 1 of OTP login: anonymous session -> identity status -> otp/initiate.
 * Returns the in-flight state callers must keep until the user types the OTP.
 */
export async function startOtpLogin(email: string): Promise<{
  identityId: string;
  anonAccessToken: string;
  cookies: string;
}> {
  const deviceGrant = await bootstrapDeviceGrant();
  let jar = '';

  const anon = await sxmCall<{ session?: Record<string, unknown> }>(
    'session/v1/sessions/anonymous',
    { method: 'POST', bearer: deviceGrant.grant, cookies: jar }
  );
  if (anon.status >= 400) {
    throw new SiriusXmAuthError(`anonymous session failed: ${anon.status}`, anon.status);
  }
  jar = mergeCookies(jar, anon.setCookie);
  const anonAccessToken = anon.data?.session?.accessToken as string | undefined;
  if (!anonAccessToken) {
    throw new SiriusXmAuthError('no session.accessToken in anonymous response', 500);
  }

  const status = await sxmCall<{ identityId?: string }>('identity/v1/identities/status', {
    method: 'GET',
    bearer: anonAccessToken,
    query: { handle: email },
    cookies: jar,
  });
  if (status.status >= 400) {
    throw new SiriusXmAuthError(`identity status failed: ${status.status}`, status.status);
  }
  jar = mergeCookies(jar, status.setCookie);
  const identityId = status.data?.identityId;
  if (!identityId) {
    throw new SiriusXmAuthError('email not recognized by SiriusXM', 404);
  }

  const initiate = await sxmCall('otp/v1/otp/initiate', {
    method: 'POST',
    bearer: anonAccessToken,
    cookies: jar,
    body: {
      identityId,
      otpOption: 'EMAIL',
      otpContext: 'sign-in',
      language: 'en-US',
    },
  });
  if (initiate.status >= 400) {
    throw new SiriusXmAuthError(`otp initiate failed: ${initiate.status}`, initiate.status);
  }
  jar = mergeCookies(jar, initiate.setCookie);

  return { identityId, anonAccessToken, cookies: jar };
}

/**
 * Stage 2 of OTP login: redeem OTP -> identity grant -> authenticated session.
 */
export async function completeOtpLogin(
  state: { identityId: string; anonAccessToken: string; cookies: string },
  otp: string
): Promise<SessionResult> {
  let jar = state.cookies;

  const redeem = await sxmCall<{ grant?: string }>('otp/v1/otp/redeem', {
    method: 'PUT',
    bearer: state.anonAccessToken,
    cookies: jar,
    body: { identityId: state.identityId, otp },
  });
  if (redeem.status >= 400) {
    throw new SiriusXmAuthError(
      redeem.status === 400 || redeem.status === 401 || redeem.status === 403
        ? 'invalid OTP code'
        : `otp redeem failed: ${redeem.status}`,
      redeem.status
    );
  }
  jar = mergeCookies(jar, redeem.setCookie);
  const otpGrant = redeem.data?.grant;
  if (!otpGrant) throw new SiriusXmAuthError('no grant in otp redeem response', 500);

  const idAuth = await sxmCall<{ grant?: string }>(
    'identity/v1/identities/authenticate/otp',
    { method: 'POST', bearer: otpGrant, cookies: jar }
  );
  if (idAuth.status >= 400) {
    throw new SiriusXmAuthError(
      `identity authenticate otp failed: ${idAuth.status}`,
      idAuth.status
    );
  }
  jar = mergeCookies(jar, idAuth.setCookie);
  const identityGrant = idAuth.data?.grant;
  if (!identityGrant) throw new SiriusXmAuthError('no grant in identity authenticate response', 500);

  const authed = await sxmCall<unknown>('session/v1/sessions/authenticated', {
    method: 'POST',
    bearer: identityGrant,
    cookies: jar,
  });
  if (authed.status >= 400) {
    throw new SiriusXmAuthError(`sessions/authenticated failed: ${authed.status}`, authed.status);
  }

  return extractSession(authed, jar);
}

export async function refreshSessionWithCookies(cookies: string): Promise<SessionResult> {
  const reply = await sxmCall<unknown>('session/v1/sessions/refresh', {
    method: 'POST',
    cookies,
    body: {},
  });
  if (reply.status >= 400) {
    throw new SiriusXmAuthError(
      `sessions/refresh failed: ${reply.status} ${reply.raw.slice(0, 200)}`,
      reply.status
    );
  }
  return extractSession(reply, cookies);
}

// Three thin wrappers — kept for tooling. Not used by the per-user runtime.
export function refreshDeviceGrant(refreshGrant: string): Promise<DeviceGrant> {
  return sxmRequest<DeviceGrant>('device/v1/grant/refresh', {
    method: 'POST',
    body: { refreshGrant },
  });
}

export function createAnonymousSession(deviceGrant: string): Promise<unknown> {
  return sxmRequest('session/v1/sessions/anonymous', {
    method: 'POST',
    bearer: deviceGrant,
  });
}

export function refreshSession(refreshToken: string): Promise<unknown> {
  return sxmRequest('session/v1/sessions/refresh', {
    method: 'POST',
    bearer: refreshToken,
  });
}

// ---------------------------------------------------------------------------
// Per-user auth manager
// ---------------------------------------------------------------------------

interface CachedSession {
  accessToken: string;
  expMs: number | null;
  cookies: string;
  email: string | null;
}

class AuthManager {
  private cache = new Map<string, CachedSession>();
  private inflight = new Map<string, Promise<string>>();

  reset(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
      this.inflight.delete(userId);
    } else {
      this.cache.clear();
      this.inflight.clear();
    }
  }

  async getBearer(userId: string): Promise<string> {
    const cached = this.cache.get(userId);
    if (cached && !this.isExpired(cached)) {
      return cached.accessToken;
    }

    const existing = this.inflight.get(userId);
    if (existing) return existing;

    const p = this.loadAndRefresh(userId).finally(() => {
      this.inflight.delete(userId);
    });
    this.inflight.set(userId, p);
    return p;
  }

  private isExpired(c: CachedSession): boolean {
    return c.expMs !== null && Date.now() + EXPIRY_SAFETY_MS >= c.expMs;
  }

  private async loadAndRefresh(userId: string): Promise<string> {
    const stored = await getCredentials(userId);
    if (!stored) {
      throw new SiriusXmAuthError(
        'SiriusXM is not connected for this user. Connect at /radio.',
        401
      );
    }

    const expMs = jwtExpiryMs(stored.accessToken);
    const fresh: CachedSession = {
      accessToken: stored.accessToken,
      expMs,
      cookies: stored.sessionCookies,
      email: stored.email,
    };

    if (this.isExpired(fresh)) {
      const refreshed = await this.runRefresh(userId, stored);
      this.cache.set(userId, refreshed);
      return refreshed.accessToken;
    }

    this.cache.set(userId, fresh);
    return fresh.accessToken;
  }

  private async runRefresh(
    userId: string,
    stored: SiriusXmCredentials
  ): Promise<CachedSession> {
    if (!stored.sessionCookies) {
      throw new SiriusXmAuthError(
        'SiriusXM access token expired and no cookie jar to refresh from. Reconnect at /radio.',
        401
      );
    }
    const refreshed = await refreshSessionWithCookies(stored.sessionCookies);
    await saveCredentials({
      userId,
      email: stored.email,
      accessToken: refreshed.accessToken,
      sessionCookies: refreshed.cookies,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? null,
    });
    return {
      accessToken: refreshed.accessToken,
      expMs: jwtExpiryMs(refreshed.accessToken),
      cookies: refreshed.cookies,
      email: stored.email,
    };
  }
}

let manager: AuthManager | null = null;
function getManager(): AuthManager {
  if (!manager) manager = new AuthManager();
  return manager;
}

export function ensureSiriusXmBearer(): Promise<string> {
  return getManager().getBearer(requireUserId());
}

export function invalidateSiriusXmSession(): void {
  const userId = getCurrentSiriusXmUserId();
  manager?.reset(userId ?? undefined);
}

export function resetSiriusXmAuth(): void {
  manager?.reset();
}
