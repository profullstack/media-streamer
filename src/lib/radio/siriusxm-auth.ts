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
import { ProxyAgent } from 'undici';
import {
  getCredentials,
  saveCredentials,
  type SiriusXmCredentials,
} from './siriusxm-credentials';

const SXM_API_BASE = 'https://api.edge-gateway.siriusxm.com';

interface ResolvedProxy {
  url: URL;
  agent: ProxyAgent;
  puppeteerArg: string;
  username: string;
  password: string;
}

/**
 * Outbound HTTP proxy for SXM calls (PROXY_URL env). When set, every
 * api.edge-gateway request and the headless-browser navigation route
 * through it. Webshare's residential rotate endpoint sits at this URL.
 *
 * Username is used verbatim — Webshare's residential-rotate account
 * rejects sticky-session suffixes (returns 407). If we ever need
 * sticky sessions we'll need a Webshare plan that supports them.
 */
function buildProxy(rawUrl: string): ResolvedProxy {
  const url = new URL(rawUrl);
  return {
    url,
    agent: new ProxyAgent(rawUrl),
    puppeteerArg: `--proxy-server=${url.protocol}//${url.host}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function newProxySessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** No-op while sticky sessions are disabled. Kept so callers don't have to change. */
function withProxySession<T>(_sessionId: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}

function getProxy(): ResolvedProxy | null {
  const raw = process.env.PROXY_URL?.trim();
  if (!raw) return null;
  return buildProxy(raw);
}

/**
 * Public proxy-agent accessor for siriusxm.ts to route browse/search/tune
 * calls through the same residential proxy used by auth. Stream resources
 * (HLS playlists/segments) intentionally skip this — they hit SXM's CDN
 * and routing audio bytes through residential IPs would burn budget.
 */
export function getSiriusXmProxyAgent(): ProxyAgent | null {
  return getProxy()?.agent ?? null;
}

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

  const proxy = getProxy();
  const fetchInit = {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    ...(proxy ? { dispatcher: proxy.agent } : {}),
  } as RequestInit;

  // Webshare's residential-rotate gives a different upstream IP per request.
  // Some IPs get RST'd by SXM at TLS handshake time. Retry network failures
  // (NOT HTTP failures) up to 3 times so we don't fail the whole flow on a
  // single bad IP.
  let res: Response;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, fetchInit);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (!isRetryableNetworkError(err)) throw err;
      // brief backoff so we're not hammering on the same bad IP
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  if (lastErr) throw lastErr;

  const raw = await res!.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  return {
    status: res!.status,
    data: data as T,
    raw,
    setCookie: getSetCookieArray(res!.headers),
  };
}

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // undici wraps the real reason in cause; walk both.
  const candidates: unknown[] = [err];
  const cause = (err as { cause?: unknown }).cause;
  if (cause) candidates.push(cause);
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const code = (c as { code?: string }).code;
      if (code && RETRYABLE_CODES.has(code)) return true;
      const msg = (c as { message?: string }).message ?? '';
      if (/ECONNRESET|socket disconnected|TLS connection|Client network/i.test(msg)) {
        return true;
      }
    }
  }
  return false;
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
 * Use a real headless browser to load siriusxm.com and read the DEVICE_GRANT
 * cookie set by client-side JS. Plain `fetch` doesn't run JS, so the cookie
 * never appears on the response.
 *
 * Resources (CSS, images, fonts, media) are blocked to keep the launch fast.
 * Result is cached at the call site (mintedDeviceGrantCache) so consecutive
 * logins reuse the same grant until ~10min before its expiry.
 */
async function mintDeviceGrantViaBrowser(): Promise<DeviceGrant> {
  return withProxySession(newProxySessionId(), () => mintDeviceGrantViaBrowserInner());
}

async function mintDeviceGrantViaBrowserInner(): Promise<DeviceGrant> {
  const { default: puppeteer } = await import('puppeteer');
  const proxy = getProxy();
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      ...(proxy ? [proxy.puppeteerArg] : []),
    ],
  });
  try {
    const page = await browser.newPage();
    if (proxy) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }
    await page.setUserAgent(COMMON_HEADERS['User-Agent']);
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // Capture every api.edge-gateway request/response so we can tell whether
    // the device-grant XHR is firing and how SXM responds. Capture the body
    // on /device/v1/* failures so the 403 reason is visible.
    const apiLog: string[] = [];
    page.on('response', async (res) => {
      const url = res.url();
      if (!url.includes('api.edge-gateway.siriusxm.com')) return;
      const path = url.replace(/^https:\/\/api\.edge-gateway\.siriusxm\.com/, '');
      const status = res.status();
      let extra = '';
      if (status >= 400 && path.startsWith('/device/')) {
        try {
          const body = await res.text();
          extra = ` body=${body.slice(0, 200)}`;
        } catch {
          // ignore
        }
      }
      apiLog.push(`${status} ${path.slice(0, 120)}${extra}`);
    });

    // The web player is the surface that actually requires DEVICE_GRANT;
    // the marketing homepage may not even bootstrap one.
    const candidates = [
      'https://www.siriusxm.com/player/',
      'https://player.siriusxm.com/',
      'https://www.siriusxm.com/listen',
      'https://www.siriusxm.com/',
    ];

    for (const url of candidates) {
      // Don't wait for full page idle — SXM has trackers/ads that never
      // settle, especially through a residential proxy. domcontentloaded
      // fires once the bootstrap scripts can run, which is all we need.
      // Even on timeout, fall through to cookie polling — the cookie may
      // have been set during the partial load.
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      } catch {
        // navigation may have timed out or aborted; try the cookie poll
        // anyway in case JS already wrote DEVICE_GRANT
      }

      const deadline = Date.now() + 25_000;
      while (Date.now() < deadline) {
        const cookies = await page.cookies(
          'https://www.siriusxm.com',
          'https://siriusxm.com',
          'https://player.siriusxm.com',
          'https://api.edge-gateway.siriusxm.com'
        );
        const dg = cookies.find((c) => c.name === 'DEVICE_GRANT' && c.value);
        if (dg) return parseDeviceGrantString(dg.value);
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const cookies = await page.cookies(
      'https://www.siriusxm.com',
      'https://siriusxm.com',
      'https://player.siriusxm.com'
    );
    const cookieSummary = cookies
      .map((c) => `${c.name}@${c.domain ?? '?'}`)
      .join(', ');
    const apiSummary = apiLog.length ? apiLog.slice(0, 12).join(' | ') : 'none';
    throw new SiriusXmAuthError(
      `puppeteer: DEVICE_GRANT not minted across ${candidates.length} pages. ` +
        `api.edge-gateway responses: [${apiSummary}]. Cookies: [${cookieSummary || 'none'}]`,
      502
    );
  } finally {
    await browser.close();
  }
}

interface CachedGrant {
  value: DeviceGrant;
  expiresAtMs: number;
}

const GRANT_REFRESH_BUFFER_MS = 10 * 60 * 1000;

let mintedDeviceGrantCache: CachedGrant | null = null;
let inflightMint: Promise<DeviceGrant> | null = null;

function cachedGrantStillValid(c: CachedGrant): boolean {
  return Date.now() + GRANT_REFRESH_BUFFER_MS < c.expiresAtMs;
}

/**
 * Mint a fresh DEVICE_GRANT.
 *
 * Strategy (in order):
 *   1. Cached grant from a prior browser-mint, if still well within its TTL.
 *   2. Headless browser load of siriusxm.com (JS sets the cookie).
 *   3. Plain GET https://www.siriusxm.com/ as a sanity check (rarely works,
 *      since the cookie comes from JS).
 *   4. POST /device/v1/grants  — REST convention; usually 403 from datacenter.
 *   5. POST /device/v1/grant   — singular variant.
 *
 * On total failure, surfaces what cookies were returned so we can see the
 * actual bootstrap endpoint name and fix this.
 */
async function bootstrapDeviceGrant(): Promise<DeviceGrant> {
  if (mintedDeviceGrantCache && cachedGrantStillValid(mintedDeviceGrantCache)) {
    return mintedDeviceGrantCache.value;
  }

  if (!inflightMint) {
    inflightMint = mintDeviceGrantViaBrowser()
      .then((grant) => {
        const expMs = grant.grantExpiresAt
          ? Date.parse(grant.grantExpiresAt)
          : Date.now() + 24 * 60 * 60 * 1000;
        mintedDeviceGrantCache = { value: grant, expiresAtMs: expMs };
        return grant;
      })
      .finally(() => {
        inflightMint = null;
      });
  }

  try {
    return await inflightMint;
  } catch (browserErr) {
    // Fall back to the original fetch-based attempts so we still surface
    // diagnostic info if puppeteer isn't available.
    return await bootstrapDeviceGrantViaFetch(browserErr as Error);
  }
}

async function bootstrapDeviceGrantViaFetch(browserErr: Error): Promise<DeviceGrant> {
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

  const proxy = getProxy();

  for (const attempt of attempts) {
    let res: Response;
    try {
      res = await fetch(attempt.url, {
        ...attempt.init,
        ...(proxy ? { dispatcher: proxy.agent } : {}),
      } as RequestInit);
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
    `failed to bootstrap DEVICE_GRANT. Browser mint: ${browserErr.message} | Fetch attempts: ${failureLog.join(' | ')}`,
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
function parseDeviceGrantString(raw: string): DeviceGrant {
  let str = raw.trim();
  if (str.startsWith('%')) {
    try {
      str = decodeURIComponent(str);
    } catch {
      // fall through
    }
  }
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }
  let parsed: DeviceGrant;
  try {
    parsed = JSON.parse(str) as DeviceGrant;
  } catch (err) {
    throw new SiriusXmAuthError(
      `DEVICE_GRANT is not valid JSON: ${(err as Error).message}`,
      400
    );
  }
  if (!parsed?.grant) {
    throw new SiriusXmAuthError('DEVICE_GRANT JSON has no .grant field', 400);
  }
  return parsed;
}

/**
 * Try identity-status and otp-initiate without any bearer. SXM's API may
 * not strictly require auth on these "is this email registered / send me a
 * code" calls — only the browser ships a bearer because it has one.
 *
 * Returns null if SXM does require auth (so the caller falls back to the
 * device-grant + anonymous-session bootstrap).
 */
async function tryUnauthenticatedOtpStart(
  email: string
): Promise<{ identityId: string; cookies: string } | null> {
  let jar = '';

  const status = await sxmCall<{ identityId?: string }>('identity/v1/identities/status', {
    method: 'GET',
    query: { handle: email },
    cookies: jar,
  });
  if (status.status === 401 || status.status === 403) return null;
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
    cookies: jar,
    body: {
      identityId,
      otpOption: 'EMAIL',
      otpContext: 'sign-in',
      language: 'en-US',
    },
  });
  if (initiate.status === 401 || initiate.status === 403) return null;
  if (initiate.status >= 400) {
    throw new SiriusXmAuthError(`otp initiate failed: ${initiate.status}`, initiate.status);
  }
  jar = mergeCookies(jar, initiate.setCookie);

  return { identityId, cookies: jar };
}

export async function startOtpLogin(
  email: string,
  pastedDeviceGrant?: string
): Promise<{
  identityId: string;
  anonAccessToken: string;
  cookies: string;
  proxySessionId: string;
}> {
  const proxySessionId = newProxySessionId();
  return withProxySession(proxySessionId, () =>
    startOtpLoginInner(email, pastedDeviceGrant, proxySessionId)
  );
}

async function startOtpLoginInner(
  email: string,
  pastedDeviceGrant: string | undefined,
  proxySessionId: string
): Promise<{
  identityId: string;
  anonAccessToken: string;
  cookies: string;
  proxySessionId: string;
}> {
  // Optimistic: maybe the email-lookup + send-code steps don't need auth.
  if (!pastedDeviceGrant) {
    const unauth = await tryUnauthenticatedOtpStart(email);
    if (unauth) {
      return {
        identityId: unauth.identityId,
        anonAccessToken: '',
        cookies: unauth.cookies,
        proxySessionId,
      };
    }
  }

  const deviceGrant = pastedDeviceGrant
    ? parseDeviceGrantString(pastedDeviceGrant)
    : await bootstrapDeviceGrant();
  let jar = '';

  const anon = await sxmCall<{ session?: Record<string, unknown> }>(
    'session/v1/sessions/anonymous',
    { method: 'POST', bearer: deviceGrant.grant, cookies: jar }
  );
  if (anon.status >= 400) {
    throw new SiriusXmAuthError(`anonymous session failed: ${anon.status}`, anon.status);
  }
  jar = mergeCookies(jar, anon.setCookie);
  // Flat or nested under .session — try both.
  const anonRoot = anon.data as Record<string, unknown> | null;
  const anonNested =
    (anonRoot?.session as Record<string, unknown> | undefined) ?? anonRoot ?? {};
  const anonAccessToken =
    (anonNested.accessToken as string | undefined) ??
    (anonNested.access_token as string | undefined);
  if (!anonAccessToken) {
    throw new SiriusXmAuthError('no accessToken in anonymous response', 500);
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

  return { identityId, anonAccessToken, cookies: jar, proxySessionId };
}

/**
 * Stage 2 of OTP login: redeem OTP -> identity grant -> authenticated session.
 */
export async function completeOtpLogin(
  state: { identityId: string; anonAccessToken: string; cookies: string; proxySessionId?: string },
  otp: string
): Promise<SessionResult> {
  return withProxySession(state.proxySessionId ?? newProxySessionId(), () =>
    completeOtpLoginInner(state, otp)
  );
}

async function completeOtpLoginInner(
  state: { identityId: string; anonAccessToken: string; cookies: string },
  otp: string
): Promise<SessionResult> {
  let jar = state.cookies;

  // Empty string means startOtpLogin succeeded on the unauthenticated path;
  // pass undefined (no Authorization header) instead of "Bearer ".
  const bearer = state.anonAccessToken || undefined;

  const redeem = await sxmCall<{ grant?: string }>('otp/v1/otp/redeem', {
    method: 'PUT',
    bearer,
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
