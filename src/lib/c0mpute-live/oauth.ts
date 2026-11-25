/**
 * c0mpute Live: connecting a member's c0mpute account (OAuth, one time).
 *
 * c0mpute.com is a public-client-only authorization server: BitTorrented
 * registers itself (dynamic registration, token_endpoint_auth_method "none"),
 * keeps the client id in the database and proves possession with PKCE S256.
 * There is no client secret, so the pending-authorization cookie is HMAC-sealed
 * under a server secret instead.
 *
 * The access token (a `c0k_` key limited to the `live:publish` scope) is used
 * once, inside the callback request, to make the member's stream. It is never
 * written to the database, a cookie, a log or a response.
 *
 * Ported from PairUX (pairux.com#205). Everything takes an injected fetch so the
 * tests run in memory.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const C0MPUTE_ORIGIN = 'https://c0mpute.com';
export const C0MPUTE_SCOPE = 'live:publish';
export const C0MPUTE_RTMP_URL = 'rtmp://live.c0mpute.com/live';
export const C0MPUTE_DASHBOARD_URL = 'https://c0mpute.com/dashboard/live';
export const LIVE_PAGE = '/live';
export const START_PATH = '/api/live/oauth/start';
export const CALLBACK_PATH = '/api/live/oauth/callback';
export const PENDING_COOKIE = 'bt_c0_oauth';
export const PENDING_COOKIE_PATH = '/api/live/oauth';
export const PENDING_TTL = 600;

export type Visibility = 'public' | 'unlisted';

export const visibilityOf = (value: unknown): Visibility => (value === 'public' ? 'public' : 'unlisted');

// Read at request time through a variable key: Next inlines `process.env.NAME`
// at build time, server code included, which would bake a missing value in.
export function runtimeEnv(name: string): string {
  const v = (process.env as Record<string, string | undefined>)[name];
  return typeof v === 'string' ? v.trim() : '';
}

export interface C0mputeConfig {
  /** c0mpute.com origin, no trailing slash. */
  origin: string;
  /** Canonical BitTorrented origin, no trailing slash. */
  siteUrl: string;
  /** Seals the pending-authorization cookie. */
  stateSecret: string;
}

/**
 * Null when there is no server secret to seal the pending cookie with. No
 * c0mpute credential is configured anywhere: the client id is registered on
 * first use.
 */
export function c0mputeConfig(): C0mputeConfig | null {
  const stateSecret = runtimeEnv('C0MPUTE_LIVE_STATE_SECRET') || runtimeEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!stateSecret) return null;
  const origin = (runtimeEnv('C0MPUTE_ORIGIN') || C0MPUTE_ORIGIN).replace(/\/+$/, '');
  // The redirect URI must equal the registration, so it is the canonical host,
  // never whatever Host header the request carried (the app sits behind nginx).
  const siteUrl = (runtimeEnv('NEXT_PUBLIC_APP_URL') || 'https://bittorrented.com').replace(/\/+$/, '');
  return { origin, siteUrl, stateSecret };
}

export const redirectUri = (cfg: Pick<C0mputeConfig, 'siteUrl'>): string => cfg.siteUrl + CALLBACK_PATH;

/** Where the member lands after a connect attempt. */
export const livePageUrl = (cfg: Pick<C0mputeConfig, 'siteUrl'>, outcome?: string): string =>
  cfg.siteUrl + LIVE_PAGE + (outcome ? `?c0mpute=${encodeURIComponent(outcome)}` : '');

/** A failure talking to c0mpute. `message` never carries a token or a stream key. */
export class C0mputeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'C0mputeError';
    this.code = code;
    this.status = status;
  }
}

export type FetchLike = typeof fetch;

export const str = (v: unknown, max = 500): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface OAuthEndpoints {
  authorize: string;
  token: string;
  register: string;
}

export function defaultEndpoints(origin: string): OAuthEndpoints {
  return {
    authorize: `${origin}/oauth/authorize`,
    token: `${origin}/api/oauth/token`,
    register: `${origin}/api/oauth/register`,
  };
}

/** A discovered endpoint is used only when it is https on the c0mpute origin itself. */
function onOrigin(value: unknown, origin: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.origin === origin && u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** RFC 8414 metadata, falling back to the known paths when it cannot be read. */
export async function discoverEndpoints(
  cfg: Pick<C0mputeConfig, 'origin'>,
  fetchImpl: FetchLike = fetch
): Promise<OAuthEndpoints> {
  const fallback = defaultEndpoints(cfg.origin);
  try {
    const res = await fetchImpl(`${cfg.origin}/.well-known/oauth-authorization-server`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return fallback;
    const meta = await readJson(res);
    return {
      authorize: onOrigin(meta.authorization_endpoint, cfg.origin) ?? fallback.authorize,
      token: onOrigin(meta.token_endpoint, cfg.origin) ?? fallback.token,
      register: onOrigin(meta.registration_endpoint, cfg.origin) ?? fallback.register,
    };
  } catch {
    return fallback;
  }
}

export interface ClientCache {
  /** The cached client id registered for exactly this redirect URI, or null. */
  getClient(redirectUri: string): Promise<string | null>;
  saveClient(redirectUri: string, clientId: string): Promise<void>;
  clearClient(): Promise<void>;
}

/** Register BitTorrented as a public client (no secret) for the server-side callback. */
export async function registerClient(
  cfg: C0mputeConfig,
  endpoints: OAuthEndpoints,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const res = await fetchImpl(endpoints.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'BitTorrented',
      client_uri: cfg.siteUrl,
      redirect_uris: [redirectUri(cfg)],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: C0MPUTE_SCOPE,
    }),
  });
  const body = await readJson(res);
  const id = str(body.client_id, 200);
  if (!res.ok || !id) {
    throw new C0mputeError(
      str(body.error, 60) ?? 'registration_failed',
      `c0mpute client registration failed (${String(res.status)})`,
      res.status
    );
  }
  return id;
}

/** The cached client id, registering once when there is none for this redirect URI. */
export async function ensureClientId(
  cfg: C0mputeConfig,
  cache: ClientCache,
  endpoints: OAuthEndpoints,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const uri = redirectUri(cfg);
  const cached = await cache.getClient(uri);
  if (cached) return cached;
  const id = await registerClient(cfg, endpoints, fetchImpl);
  await cache.saveClient(uri, id);
  return id;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');
export const randomToken = (bytes = 32): string => b64url(randomBytes(bytes));
export const pkceChallenge = (verifier: string): string => b64url(createHash('sha256').update(verifier).digest());

export interface PendingAuth {
  state: string;
  verifier: string;
  clientId: string;
  /** The member who started; the callback must be the same session. */
  userId: string;
  visibility: Visibility;
  /** True on the one automatic restart after c0mpute answered invalid_client. */
  retried: boolean;
  exp: number;
}

const nowSec = (): number => Math.floor(Date.now() / 1000);

/** A fresh pending authorization plus the authorize URL that starts it. */
export function beginConnect(
  cfg: C0mputeConfig,
  endpoints: OAuthEndpoints,
  input: { clientId: string; userId: string; visibility?: Visibility; retried?: boolean }
): { pending: PendingAuth; url: string } {
  const pending: PendingAuth = {
    state: randomToken(16),
    verifier: randomToken(48),
    clientId: input.clientId,
    userId: input.userId,
    visibility: visibilityOf(input.visibility),
    retried: input.retried === true,
    exp: nowSec() + PENDING_TTL,
  };
  const url = new URL(endpoints.authorize);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', pending.clientId);
  url.searchParams.set('redirect_uri', redirectUri(cfg));
  url.searchParams.set('scope', C0MPUTE_SCOPE);
  url.searchParams.set('state', pending.state);
  url.searchParams.set('code_challenge', pkceChallenge(pending.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return { pending, url: url.toString() };
}

function mac(value: string, key: string): string {
  return createHmac('sha256', `bittorrented-c0mpute-pending:${key}`).update(value).digest('base64url');
}

/** HMAC-sealed under a server secret, so a browser can hold it but not forge or edit it. */
export function encodePending(p: PendingAuth, key: string): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return `${body}.${mac(body, key)}`;
}

export function decodePending(raw: string | null | undefined, key: string): PendingAuth | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(mac(body, key));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<PendingAuth>;
    if (
      typeof o.state !== 'string' ||
      typeof o.verifier !== 'string' ||
      typeof o.clientId !== 'string' ||
      typeof o.userId !== 'string' ||
      !o.state ||
      !o.verifier ||
      !o.clientId ||
      !o.userId
    ) {
      return null;
    }
    if (typeof o.exp !== 'number' || o.exp < nowSec()) return null;
    return {
      state: o.state,
      verifier: o.verifier,
      clientId: o.clientId,
      userId: o.userId,
      visibility: visibilityOf(o.visibility),
      retried: o.retried === true,
      exp: o.exp,
    };
  } catch {
    return null;
  }
}

/** Constant-time compare of the state we issued with the one that came back. */
export function sameState(expected: string, got: string | null | undefined): boolean {
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Trade the authorization code for the access token. Throws C0mputeError; code
 * "invalid_client" means the cached registration is gone and the caller should
 * register again.
 */
export async function exchangeCode(
  cfg: C0mputeConfig,
  endpoints: OAuthEndpoints,
  input: { code: string; verifier: string; clientId: string },
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const res = await fetchImpl(endpoints.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: redirectUri(cfg),
      client_id: input.clientId,
      code_verifier: input.verifier,
    }).toString(),
  });
  const body = await readJson(res);
  const token = str(body.access_token, 4096);
  if (!res.ok || !token) {
    throw new C0mputeError(
      str(body.error, 60) ?? 'token_exchange_failed',
      `c0mpute token exchange failed (${String(res.status)})`,
      res.status
    );
  }
  return token;
}
