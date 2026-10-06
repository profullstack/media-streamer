/**
 * Cast tokens
 *
 * A Chromecast fetches the media URL itself, from its own network stack, with
 * none of the viewer's cookies. bittorrented.com is members-only, so without
 * something in the URL every request the receiver makes is answered 401 and
 * the TV shows a spinner and then nothing.
 *
 * A cast token is that something: the viewer's user id and an expiry, signed
 * with a server secret, carried as `?ct=` on the media URL and on every
 * segment URL our playlist rewriters emit. It opens the members gate only for
 * the media routes in CASTABLE_PATH_PREFIXES, and the routes behind it still
 * run their own checks (subscription, SiriusXM account) against the token's
 * user, so a token can never do more than its owner's session could.
 *
 * Web Crypto only, so the same code verifies in the proxy and in routes.
 */

/** Long enough for a film plus pauses; a fresh cast mints a fresh token. */
export const CAST_TOKEN_TTL_SECONDS = 6 * 60 * 60;

/** The query parameter the token travels in. */
export const CAST_TOKEN_PARAM = 'ct';

/** Media routes a receiver may fetch with a cast token instead of a session. */
export const CASTABLE_PATH_PREFIXES = [
  '/api/stream',
  '/api/iptv-proxy',
  '/api/radio/proxy',
  '/api/seedbox/stream',
] as const;

export function isCastablePath(pathname: string): boolean {
  return CASTABLE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export interface CastTokenClaims {
  userId: string;
  /** Unix seconds. */
  expiresAt: number;
}

const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;
let keySecret: string | null = null;

/**
 * CAST_TOKEN_SECRET when set; otherwise derived from the service role key,
 * which every deployment already has, so casting needs no setup step. The
 * label keeps a cast token from ever being mistaken for any other HMAC made
 * from the same key.
 */
function secret(): string | null {
  const explicit = process.env.CAST_TOKEN_SECRET?.trim();
  if (explicit) return explicit;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return base ? `bittorrented-cast-token-v1:${base}` : null;
}

function getKey(): Promise<CryptoKey> | null {
  const s = secret();
  if (!s) return null;
  if (!keyPromise || keySecret !== s) {
    keySecret = s;
    keyPromise = crypto.subtle.importKey(
      'raw',
      encoder.encode(s),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  }
  return keyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Mint a token for `userId`. Throws when no signing secret is configured. */
export async function createCastToken(
  userId: string,
  now: number = Date.now(),
  ttlSeconds: number = CAST_TOKEN_TTL_SECONDS
): Promise<{ token: string; expiresAt: number }> {
  const key = getKey();
  if (!key) throw new Error('Cast tokens need CAST_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY');
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const payload = toBase64Url(encoder.encode(`${userId}.${expiresAt}`));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key, encoder.encode(payload)));
  return { token: `${payload}.${toBase64Url(sig)}`, expiresAt };
}

/** The claims of a valid, unexpired token; null for anything else. */
export async function verifyCastToken(
  token: string | null | undefined,
  now: number = Date.now()
): Promise<CastTokenClaims | null> {
  if (!token || token.length > 512) return null;
  const key = getKey();
  if (!key) return null;

  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const payload = token.slice(0, dot);
  const sig = fromBase64Url(token.slice(dot + 1));
  if (!sig) return null;

  const ok = await crypto.subtle.verify('HMAC', await key, sig, encoder.encode(payload));
  if (!ok) return null;

  const raw = fromBase64Url(payload);
  if (!raw) return null;
  const text = new TextDecoder().decode(raw);
  const sep = text.lastIndexOf('.');
  if (sep <= 0) return null;
  const userId = text.slice(0, sep);
  const expiresAt = Number(text.slice(sep + 1));
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 <= now) return null;
  return { userId, expiresAt };
}

/** The verified claims of the `ct` parameter on a request URL, if any. */
export async function castClaimsFrom(requestUrl: string): Promise<CastTokenClaims | null> {
  let token: string | null = null;
  try {
    token = new URL(requestUrl).searchParams.get(CAST_TOKEN_PARAM);
  } catch {
    return null;
  }
  return token ? verifyCastToken(token) : null;
}
