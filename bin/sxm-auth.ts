/**
 * Shared SiriusXM auth helpers for bin/ scripts.
 */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProxyAgent } from 'undici';

export const SXM_API_BASE = 'https://api.edge-gateway.siriusxm.com';

interface ResolvedProxy {
  agent: ProxyAgent;
  puppeteerArg: string;
  username: string;
  password: string;
}

let proxyCache: ResolvedProxy | null | undefined;

function getProxy(): ResolvedProxy | null {
  if (proxyCache !== undefined) return proxyCache;
  const raw = process.env.PROXY_URL?.trim() || loadDotenv()['PROXY_URL']?.trim();
  if (!raw) {
    proxyCache = null;
    return null;
  }
  const url = new URL(raw);
  proxyCache = {
    agent: new ProxyAgent(raw),
    puppeteerArg: `--proxy-server=${url.protocol}//${url.host}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
  return proxyCache;
}

export const SXM_COMMON_HEADERS: Record<string, string> = {
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
  /** Joined Cookie-header string: "k1=v1; k2=v2". Replay this to /sessions/refresh. */
  cookies: string;
}

interface Reply {
  status: number;
  data: unknown;
  raw: string;
  setCookie: string[];
}

interface RequestOpts {
  method: 'GET' | 'POST' | 'PUT';
  bearer?: string;
  body?: unknown;
  query?: Record<string, string>;
  cookies?: string;
}

export function defaultEnvPath(): string {
  return resolve(process.cwd(), '.env');
}

export function loadDotenv(envPath: string = defaultEnvPath()): Record<string, string> {
  const text = readFileSync(envPath, 'utf8');
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function updateDotenv(
  updates: Record<string, string>,
  envPath: string = defaultEnvPath()
): void {
  let text = readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');
    const needsQuote = /\s|"/.test(value);
    const line = needsQuote ? `${key}='${value}'` : `${key}=${value}`;
    if (re.test(text)) {
      text = text.replace(re, line);
    } else {
      if (!text.endsWith('\n')) text += '\n';
      text += `${line}\n`;
    }
  }
  writeFileSync(envPath, text, 'utf8');
}

function parseDeviceGrantString(raw: string): DeviceGrant {
  let str = raw.trim();
  if (str.startsWith('%')) {
    try {
      str = decodeURIComponent(str);
    } catch {
      // continue
    }
  }
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1);
  }
  const parsed = JSON.parse(str) as DeviceGrant;
  if (!parsed.grant) throw new Error('DEVICE_GRANT JSON has no .grant field');
  return parsed;
}

export function loadDeviceGrantFromEnv(envPath?: string): DeviceGrant {
  const env = loadDotenv(envPath);
  const raw = env.SIRIUSXM_DEVICE_GRANT;
  if (!raw) {
    throw new Error(
      'SIRIUSXM_DEVICE_GRANT is not set in .env. Use mintDeviceGrantViaBrowser() or capture the DEVICE_GRANT cookie from siriusxm.com.'
    );
  }
  return parseDeviceGrantString(raw);
}

/**
 * Headless-browser mint: load siriusxm.com, wait for the JS-set DEVICE_GRANT
 * cookie, return the parsed value. Disables CSS / images / fonts / media for
 * speed. Used as the default bootstrap for both the CLI and the web app.
 */
export async function mintDeviceGrantViaBrowser(opts: { debug?: boolean } = {}): Promise<DeviceGrant> {
  const { default: puppeteer } = await import('puppeteer');
  const proxy = getProxy();
  if (opts.debug) {
    console.error(
      `[sxm-auth] launching headless browser to mint DEVICE_GRANT ${proxy ? '(via proxy)' : '(direct)'}`
    );
  }
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
    await page.setUserAgent(SXM_COMMON_HEADERS['User-Agent']);
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    await page.goto('https://www.siriusxm.com/', {
      waitUntil: 'networkidle2',
      timeout: 45_000,
    });

    const deadline = Date.now() + 30_000;
    let lastSnapshot: Array<{ name: string; domain?: string }> = [];
    while (Date.now() < deadline) {
      const cookies = await page.cookies(
        'https://www.siriusxm.com',
        'https://siriusxm.com',
        'https://api.edge-gateway.siriusxm.com'
      );
      lastSnapshot = cookies.map((c) => ({ name: c.name, domain: c.domain }));
      const dg = cookies.find((c) => c.name === 'DEVICE_GRANT' && c.value);
      if (dg) return parseDeviceGrantString(dg.value);
      await new Promise((r) => setTimeout(r, 500));
    }

    const summary = lastSnapshot.map((c) => `${c.name}@${c.domain ?? '?'}`).join(', ');
    throw new Error(
      `puppeteer: DEVICE_GRANT cookie not set within 30s. Cookies seen: [${summary || 'none'}]`
    );
  } finally {
    await browser.close();
  }
}

/**
 * Resolve a device grant: prefer SIRIUSXM_DEVICE_GRANT in .env if set, else
 * mint a fresh one via headless browser.
 */
export async function resolveDeviceGrant(opts: {
  debug?: boolean;
  envPath?: string;
}): Promise<DeviceGrant> {
  const env = loadDotenv(opts.envPath);
  if (env.SIRIUSXM_DEVICE_GRANT) {
    return parseDeviceGrantString(env.SIRIUSXM_DEVICE_GRANT);
  }
  return mintDeviceGrantViaBrowser({ debug: opts.debug });
}

function getSetCookieArray(headers: Headers): string[] {
  const direct = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof direct === 'function') return direct.call(headers);
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

/**
 * Merge an existing cookie jar (Cookie-header string) with new Set-Cookie values.
 * Newer values win on key collision.
 */
export function mergeCookies(existing: string, setCookie: string[]): string {
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

async function sxmRequest(
  path: string,
  opts: RequestOpts,
  debug = false
): Promise<Reply> {
  const url = new URL(`${SXM_API_BASE}/${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  if (debug) console.error(`[${opts.method}] ${url}`);

  const headers: Record<string, string> = { ...SXM_COMMON_HEADERS };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  if (opts.cookies) headers.Cookie = opts.cookies;

  const proxy = getProxy();
  const res = await fetch(url, {
    method: opts.method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    ...(proxy ? { dispatcher: proxy.agent } : {}),
  } as RequestInit);

  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  const setCookie = getSetCookieArray(res.headers);
  if (debug) {
    console.error(`[${opts.method}] -> ${res.status} ${raw.slice(0, 400)}`);
    if (setCookie.length) console.error(`[set-cookie] ${setCookie.length} cookies`);
  }
  return { status: res.status, data, raw, setCookie };
}

class StepError extends Error {
  constructor(public label: string, public reply: Reply) {
    super(`${label} failed (HTTP ${reply.status}): ${reply.raw.slice(0, 500)}`);
    this.name = 'StepError';
  }
}

function extractSession(reply: Reply, jar: string): SessionResult {
  const root = reply.data as Record<string, unknown> | null;
  const nested = (root?.session as Record<string, unknown> | undefined) ?? root ?? {};
  const accessToken =
    (nested.accessToken as string | undefined) ?? (nested.access_token as string | undefined);
  if (!accessToken) {
    throw new Error(`no accessToken in session response: ${reply.raw.slice(0, 500)}`);
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

export interface EmailOtpLoginOptions {
  debug?: boolean;
  promptOtp?: () => Promise<string>;
  onProgress?: (message: string) => void;
}

async function defaultPromptOtp(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question('Enter the OTP from your email: ')).trim();
  } finally {
    rl.close();
  }
}

/**
 * Walk the email-OTP login chain and return the final authenticated session
 * + the cookie jar (so callers can later /session/v1/sessions/refresh).
 *
 *   deviceGrant.grant
 *     -> POST /session/v1/sessions/anonymous          [ANON_ACCESS_TOKEN]
 *     -> GET  /identity/v1/identities/status?handle=  [identityId]
 *     -> POST /otp/v1/otp/initiate                    [204, sends email]
 *     -> [user enters OTP from email]
 *     -> PUT  /otp/v1/otp/redeem                      [OTP_GRANT]
 *     -> POST /identity/v1/identities/authenticate/otp [IDENTITY_GRANT]
 *     -> POST /session/v1/sessions/authenticated      [AUTH_TOKEN.accessToken + Set-Cookie]
 */
export async function emailOtpLogin(
  email: string,
  deviceGrant: DeviceGrant,
  opts: EmailOtpLoginOptions = {}
): Promise<SessionResult> {
  const { debug = false } = opts;
  const onProgress = opts.onProgress ?? ((m: string) => console.log(m));
  const promptOtp = opts.promptOtp ?? defaultPromptOtp;

  let jar = '';

  onProgress('[1/6] creating anonymous session');
  const anon = await sxmRequest(
    'session/v1/sessions/anonymous',
    { method: 'POST', bearer: deviceGrant.grant, cookies: jar },
    debug
  );
  if (anon.status >= 400) throw new StepError('anonymous session', anon);
  jar = mergeCookies(jar, anon.setCookie);
  // Response may be flat ({accessToken: "..."}) or nested ({session: {accessToken: "..."}}).
  const anonRoot = anon.data as Record<string, unknown> | null;
  const anonNested =
    (anonRoot?.session as Record<string, unknown> | undefined) ?? anonRoot ?? {};
  const anonAccessToken =
    (anonNested.accessToken as string | undefined) ??
    (anonNested.access_token as string | undefined);
  if (!anonAccessToken) {
    throw new Error(`no accessToken in anonymous response: ${anon.raw.slice(0, 500)}`);
  }

  onProgress('[2/6] looking up identity by email');
  const status = await sxmRequest(
    'identity/v1/identities/status',
    { method: 'GET', bearer: anonAccessToken, query: { handle: email }, cookies: jar },
    debug
  );
  if (status.status >= 400) throw new StepError('identity status', status);
  jar = mergeCookies(jar, status.setCookie);
  const identityId = (status.data as { identityId?: string } | null)?.identityId;
  if (!identityId) {
    throw new Error(`no identityId in status response: ${status.raw.slice(0, 500)}`);
  }

  onProgress('[3/6] sending OTP email');
  const initiate = await sxmRequest(
    'otp/v1/otp/initiate',
    {
      method: 'POST',
      bearer: anonAccessToken,
      cookies: jar,
      body: {
        identityId,
        otpOption: 'EMAIL',
        otpContext: 'sign-in',
        language: 'en-US',
      },
    },
    debug
  );
  if (initiate.status >= 400) throw new StepError('otp initiate', initiate);
  jar = mergeCookies(jar, initiate.setCookie);

  const code = await promptOtp();
  if (!code) throw new Error('empty OTP');

  onProgress('[4/6] redeeming OTP for OTP grant');
  const redeem = await sxmRequest(
    'otp/v1/otp/redeem',
    {
      method: 'PUT',
      bearer: anonAccessToken,
      cookies: jar,
      body: { identityId, otp: code },
    },
    debug
  );
  if (redeem.status >= 400) throw new StepError('otp redeem', redeem);
  jar = mergeCookies(jar, redeem.setCookie);
  const otpGrant = (redeem.data as { grant?: string } | null)?.grant;
  if (!otpGrant) {
    throw new Error(`no grant in otp redeem response: ${redeem.raw.slice(0, 500)}`);
  }

  onProgress('[5/6] exchanging OTP grant for identity grant');
  const idAuth = await sxmRequest(
    'identity/v1/identities/authenticate/otp',
    { method: 'POST', bearer: otpGrant, cookies: jar },
    debug
  );
  if (idAuth.status >= 400) throw new StepError('identity authenticate otp', idAuth);
  jar = mergeCookies(jar, idAuth.setCookie);
  const identityGrant = (idAuth.data as { grant?: string } | null)?.grant;
  if (!identityGrant) {
    throw new Error(`no grant in identity authenticate response: ${idAuth.raw.slice(0, 500)}`);
  }

  onProgress('[6/6] exchanging identity grant for authenticated session');
  const authed = await sxmRequest(
    'session/v1/sessions/authenticated',
    { method: 'POST', bearer: identityGrant, cookies: jar },
    debug
  );
  if (authed.status >= 400) throw new StepError('sessions/authenticated', authed);

  return extractSession(authed, jar);
}

/**
 * Refresh an authenticated session by replaying the cookie jar against
 * /session/v1/sessions/refresh. Returns the new session + merged cookie jar.
 */
export async function refreshAuthSession(
  cookies: string,
  debug = false
): Promise<SessionResult> {
  const reply = await sxmRequest(
    'session/v1/sessions/refresh',
    { method: 'POST', cookies, body: {} },
    debug
  );
  if (reply.status >= 400) throw new StepError('sessions/refresh', reply);
  return extractSession(reply, cookies);
}
