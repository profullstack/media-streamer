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
 * The SiriusXM protocol itself (the login dance, the device-grant mint, the
 * session refresh, edge-block retries) is @profullstack/stream-providers'
 * SiriusXM adapter, shared with tipoffwatch and watchnews. What stays here is
 * whose account it is: the per-user proxy, the credentials store, the cache.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ProxyAgent } from 'undici';
import * as sxm from '@profullstack/stream-providers/siriusxm';
import {
  getCredentials,
  saveCredentials,
  type SiriusXmCredentials,
} from './siriusxm-credentials';

import { isVaultLockedError, unlockStore } from '@/lib/vault';

import { proxyFetch, type ProxyFetchInit } from './proxy-fetch';
import { withProxyScope } from './proxy-budget';


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
 * through it.
 *
 * Webshare's static-residential-rotate endpoint keeps the same upstream
 * IP for the duration of a single TCP/TLS connection. To get that
 * stickiness we must reuse the same ProxyAgent across calls so undici's
 * connection pool keeps a warm channel. Building a fresh agent per call
 * gave us a different IP every time.
 */
function buildProxy(rawUrl: string, agent: ProxyAgent): ResolvedProxy {
  const url = new URL(rawUrl);
  return {
    url,
    agent,
    puppeteerArg: `--proxy-server=${url.protocol}//${url.host}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

// One ProxyAgent per upstream URL — undici reuses the connection pool, which
// is what gives us a stable upstream IP per user (single-IP static residential
// entries) and keeps a warm channel for sequential calls.
const agentCache = new Map<string, ProxyAgent>();

function getOrCreateAgent(rawUrl: string): ProxyAgent {
  let agent = agentCache.get(rawUrl);
  if (!agent) {
    agent = new ProxyAgent(rawUrl);
    agentCache.set(rawUrl, agent);
  }
  return agent;
}

/**
 * Pinned per-user upstream IPs. Each line of proxies.txt is
 * `host:port:user:pass` (the standard webshare export format). On startup
 * we parse the list once; each userId hashes to a fixed entry, so the
 * same user always exits via the same residential IP — important because
 * SXM ties session continuity (especially the playback key endpoint) to
 * the issuing IP.
 *
 * Falls back to PROXY_URL when proxies.txt is absent or empty.
 */
let proxyListCache: string[] | null = null;

function loadProxyList(): string[] {
  if (proxyListCache !== null) return proxyListCache;
  if (process.env.SKIP_PROXY_LIST === '1') {
    proxyListCache = [];
    return proxyListCache;
  }
  // The runtime cwd in production is .next/standalone, but the deploy
  // ships proxies.txt to the project root. Try both, plus an explicit
  // override env var.
  const candidates = [
    process.env.PROXIES_FILE,
    resolve(process.cwd(), 'proxies.txt'),
    resolve(process.cwd(), '..', '..', 'proxies.txt'),
  ].filter((p): p is string => Boolean(p));

  let raw: string | null = null;
  for (const path of candidates) {
    try {
      raw = readFileSync(path, 'utf8');
      break;
    } catch {
      // try next candidate
    }
  }
  if (!raw) {
    proxyListCache = [];
    return proxyListCache;
  }
  proxyListCache = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split(':');
      if (parts.length !== 4) return '';
      const [host, port, user, pass] = parts;
      return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    })
    .filter(Boolean);
  return proxyListCache;
}

function pickProxyForUser(userId: string, list: string[]): string {
  // Stable hash so the same user always lands on the same proxy.
  const digest = createHash('sha256').update(userId).digest();
  const idx = digest.readUInt32BE(0) % list.length;
  return list[idx];
}

function getProxy(): ResolvedProxy | null {
  // Prefer the per-user pinned proxy from proxies.txt when a user is
  // in scope; fall back to PROXY_URL (rotating) otherwise.
  const list = loadProxyList();
  const userId = getCurrentSiriusXmUserId();
  if (list.length && userId) {
    const url = pickProxyForUser(userId, list);
    return buildProxy(url, getOrCreateAgent(url));
  }
  const envUrl = process.env.PROXY_URL?.trim();
  if (!envUrl) return null;
  return buildProxy(envUrl, getOrCreateAgent(envUrl));
}

/**
 * Public proxy-agent accessor for siriusxm.ts, the HLS proxy route and the
 * restream rail, so every SiriusXM call exits through the same residential
 * proxy as auth. Stream resources go through it too: SXM ties playback and the
 * key endpoint to the IP that authenticated, so the datacenter IP gets 403.
 * That means audio bytes are paid for per GB, which is why every proxied call
 * is metered and capped by proxy-budget.ts.
 */
export function getSiriusXmProxyAgent(): ProxyAgent | null {
  return getProxy()?.agent ?? null;
}

/** The same proxy as a URL, for @profullstack/stream-providers (which maps it back to the agent). */
export function getSiriusXmProxyUrl(): string | null {
  return getProxy()?.url.href ?? null;
}

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

/**
 * Establish the user whose SiriusXM account is in play. This is also the proxy
 * budget scope: everything proxied inside `fn` is metered against this user, and
 * a proxied call made outside any user scope is refused (proxy-budget.ts).
 */
export function withSiriusXmUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return userContextStorage.run({ userId }, () => withProxyScope(`user:${userId}`, fn));
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
// The protocol: @profullstack/stream-providers
// ---------------------------------------------------------------------------

/*
 * Every SiriusXM call the package makes goes out through proxyFetch, so it is
 * admitted against the current user's proxy budget and metered, and the proxy
 * URL it is handed becomes the cached ProxyAgent (one per upstream URL, which
 * is what keeps the exit IP stable). Only network errors are retried: a spent
 * budget throws too, and asking again would not unspend it.
 *
 * puppeteer (with its bundled Chromium) is this app's dependency, so it is
 * loaded from here, with no Chrome channel. A PUPPETEER_EXECUTABLE_PATH still
 * wins when set.
 */
sxm.configure({
  fetch: (url, init) => proxyFetch(url as string | URL, init as ProxyFetchInit),
  proxyInit: (url: string) => ({ dispatcher: getOrCreateAgent(url) }),
  isRetryable: (err: unknown) => isRetryableNetworkError(err),
  loadPuppeteer: () => import('puppeteer'),
  channel: null,
});

/** The proxy URL for the user in scope (pinned from proxies.txt, else PROXY_URL). */
const proxyUrl = getSiriusXmProxyUrl;

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

/** The package's errors as this app's, so routes keep one instanceof check. */
async function asAuthError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof sxm.SiriusXmError && !(err instanceof SiriusXmAuthError)) {
      throw new SiriusXmAuthError(err.message, err.status, err.data);
    }
    throw err;
  }
}

const EXPIRY_SAFETY_MS = 30_000;

function jwtExpiryMs(token: string): number | null {
  return sxm.jwtExpiryMs(token);
}

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

function toSessionResult(s: sxm.SiriusXmSession): SessionResult {
  return {
    accessToken: s.accessToken,
    accessTokenExpiresAt: s.accessTokenExpiresAt ?? undefined,
    refreshTokenExpiresAt: s.refreshTokenExpiresAt ?? undefined,
    cookies: s.cookies,
  };
}

function newProxySessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Stage 1 of OTP login: find the account and have SiriusXM email a code.
 * Returns the in-flight state callers must keep until the user types it.
 */
export async function startOtpLogin(
  email: string,
  pastedDeviceGrant?: string
): Promise<{
  identityId: string;
  anonAccessToken: string;
  cookies: string;
  proxySessionId: string;
}> {
  const state = await asAuthError(() =>
    sxm.startOtpLogin(email, { proxy: proxyUrl(), deviceGrant: pastedDeviceGrant ?? null })
  );
  return { ...state, proxySessionId: newProxySessionId() };
}

/** Stage 2 of OTP login: the emailed code becomes a session. */
export async function completeOtpLogin(
  state: { identityId: string; anonAccessToken: string; cookies: string; proxySessionId?: string },
  otp: string
): Promise<SessionResult> {
  const session = await asAuthError(() =>
    sxm.completeOtpLogin(state, otp, { proxy: proxyUrl() })
  );
  return toSessionResult(session);
}

export async function refreshSessionWithCookies(cookies: string): Promise<SessionResult> {
  const session = await asAuthError(() => sxm.refreshSession(cookies, { proxy: proxyUrl() }));
  return toSessionResult(session);
}

async function sxmRequest<T>(path: string, opts: { bearer?: string; body?: unknown } = {}): Promise<T> {
  const reply = await sxm.sxmCall(path, { ...opts, proxy: proxyUrl() });
  if (reply.status >= 400) {
    throw new SiriusXmAuthError(`POST ${path} failed: ${reply.status}`, reply.status, reply.data);
  }
  return reply.data as T;
}

// Three thin wrappers — kept for tooling. Not used by the per-user runtime.
export function refreshDeviceGrant(refreshGrant: string): Promise<DeviceGrant> {
  return sxmRequest<DeviceGrant>('device/v1/grant/refresh', { body: { refreshGrant } });
}

export function createAnonymousSession(deviceGrant: string): Promise<unknown> {
  return sxmRequest('session/v1/sessions/anonymous', { bearer: deviceGrant });
}

export function refreshSession(refreshToken: string): Promise<unknown> {
  return sxmRequest('session/v1/sessions/refresh', { bearer: refreshToken });
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
    let stored: SiriusXmCredentials | null;
    try {
      stored = await getCredentials(userId);
    } catch (err) {
      // Sealed under the user's key vault: locked pauses playback, never crashes.
      if (isVaultLockedError(err)) throw new SiriusXmAuthError(err.message, 423, { code: err.code, locked: true });
      throw err;
    }
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
  if (!manager) {
    const created = new AuthManager();
    manager = created;
    // The cached bearer is plaintext: drop it when its owner locks or expires.
    unlockStore().onChange((userId, unlocked) => {
      if (!unlocked) created.reset(userId);
    });
  }
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
