/**
 * Sign in with CoinPay.
 *
 * CoinPay (coinpayportal.com) is the fleet's master account and an OIDC
 * provider; bittorrented.com is a confidential client. The flow is the
 * authorization code grant with PKCE (S256), `state` and `nonce`, done with
 * @profullstack/coinpay-onboard: the code exchange sends the client secret and
 * the verifier, the id_token's issuer, audience, expiry and nonce are checked,
 * and userinfo must name the same `sub`.
 *
 * STANDING rule: the account here is found by the CoinPay `sub` bound in
 * bt_coinpay_identities, and only by that. The email CoinPay reports is
 * unverified, so it never finds an account, is never used as an account
 * address and grants nothing. A CoinPay account is bound while signed in
 * (Settings > Connections > Connect CoinPay). Sign-up here is invite-only and
 * its trial bookkeeping lives on /api/auth/signup, so an unbound CoinPay
 * sign-in is refused with directions rather than making an account.
 *
 * Configuration is read at runtime (runtimeEnv below), never at build time.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authorizeUrl,
  finishSignIn,
  pkce,
  randomToken,
  sameState,
  SIGN_IN_SCOPES,
} from '@profullstack/coinpay-onboard/oauth';
import { createServerClient } from '@/lib/supabase';
import { getAppOrigin } from '@/lib/nixamp/config';

export const COINPAY_PENDING_COOKIE = 'coinpay_oauth';
export const COINPAY_PENDING_MAX_AGE_SECONDS = 10 * 60;
export const COINPAY_CALLBACK_PATH = '/api/v1/coinpay/oauth/callback';

export interface CoinpaySigninConfig {
  clientId: string;
  clientSecret: string;
  /** The authorization server, which is also the id_token issuer. */
  base: string;
  redirectUri: string;
}

/**
 * A runtime read. A non-literal key defeats Next's build-time substitution of
 * `process.env.NAME`, which would otherwise compile a secret set only on the
 * host in as undefined.
 */
function runtimeEnv(name: string): string {
  const key = String(name);
  return process.env[key] || '';
}

export function getCoinpaySigninConfig(fallbackOrigin = ''): CoinpaySigninConfig | null {
  const clientId = runtimeEnv('COINPAY_OAUTH_CLIENT_ID');
  const clientSecret = runtimeEnv('COINPAY_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  const base = (runtimeEnv('COINPAY_OAUTH_ISSUER') || 'https://coinpayportal.com').replace(/\/+$/, '');
  const origin = getAppOrigin(fallbackOrigin);
  const redirectUri = runtimeEnv('COINPAY_OAUTH_REDIRECT_URI') || `${origin}${COINPAY_CALLBACK_PATH}`;
  return { clientId, clientSecret, base, redirectUri };
}

export const isCoinpaySigninConfigured = (): boolean => getCoinpaySigninConfig('http://localhost') !== null;

/* ------------------------------------------------------------ pending cookie -- */

export type CoinpayMode = 'signin' | 'link';

export interface CoinpayPending {
  state: string;
  verifier: string;
  nonce: string;
  mode: CoinpayMode;
  /** The account that asked to link, for mode "link". */
  userId?: string;
  redirect: string;
  /** Unix seconds. */
  exp: number;
}

function pendingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('bittorrented coinpay pending v1').digest();
}

/** The pending request, HMAC-signed so the browser can hold it but not edit it. */
export function sealPending(pending: CoinpayPending, secret: string): string {
  const body = Buffer.from(JSON.stringify(pending)).toString('base64url');
  const mac = createHmac('sha256', pendingKey(secret)).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function openPending(value: string | undefined | null, secret: string, now = Date.now()): CoinpayPending | null {
  if (!value) return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', pendingKey(secret)).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const pending = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CoinpayPending;
    if (typeof pending.exp !== 'number' || pending.exp * 1000 < now) return null;
    return pending;
  } catch {
    return null;
  }
}

/** Begin a request: the CoinPay URL and the sealed cookie value. */
export function startCoinpaySignin(
  config: CoinpaySigninConfig,
  input: { mode: CoinpayMode; userId?: string; redirect: string; now?: number }
): { url: string; cookie: string } {
  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = pkce();
  const pending: CoinpayPending = {
    state,
    verifier,
    nonce,
    mode: input.mode,
    ...(input.mode === 'link' && input.userId ? { userId: input.userId } : {}),
    redirect: input.redirect,
    exp: Math.floor((input.now ?? Date.now()) / 1000) + COINPAY_PENDING_MAX_AGE_SECONDS,
  };
  const url = authorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    challenge,
    nonce,
    scopes: SIGN_IN_SCOPES,
    base: config.base,
  });
  return { url, cookie: sealPending(pending, config.clientSecret) };
}

/* ---------------------------------------------------------------- the store -- */

export interface CoinpayIdentityRow {
  sub: string;
  user_id: string;
  email: string | null;
  name: string | null;
}

/** What the callback needs from the database and auth, injectable for tests. */
export interface CoinpayStore {
  bySub(sub: string): Promise<CoinpayIdentityRow | null>;
  byUser(userId: string): Promise<CoinpayIdentityRow | null>;
  link(row: CoinpayIdentityRow): Promise<void>;
  touch(sub: string, email: string | null, name: string | null): Promise<void>;
  unlink(userId: string): Promise<boolean>;
  mintSession(userId: string): Promise<{ accessToken: string; refreshToken: string }>;
}

function sb(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

export function supabaseCoinpayStore(client: SupabaseClient = sb()): CoinpayStore {
  const table = () => client.from('bt_coinpay_identities');
  return {
    async bySub(sub) {
      const { data, error } = await table().select('sub, user_id, email, name').eq('sub', sub).maybeSingle();
      if (error) throw new CoinpaySigninError(`lookup failed: ${error.message}`, 'lookup_failed');
      return (data as CoinpayIdentityRow | null) ?? null;
    },
    async byUser(userId) {
      const { data, error } = await table().select('sub, user_id, email, name').eq('user_id', userId).maybeSingle();
      if (error) throw new CoinpaySigninError(`lookup failed: ${error.message}`, 'lookup_failed');
      return (data as CoinpayIdentityRow | null) ?? null;
    },
    async link(row) {
      const { error } = await table().insert({ ...row, last_login_at: new Date().toISOString() });
      if (error) throw new CoinpaySigninError(`could not link: ${error.message}`, 'link_failed');
    },
    async touch(sub, email, name) {
      await table()
        .update({ last_login_at: new Date().toISOString(), ...(email ? { email } : {}), ...(name ? { name } : {}) })
        .eq('sub', sub);
    },
    async unlink(userId) {
      const { data, error } = await table().delete().eq('user_id', userId).select('sub');
      if (error) throw new CoinpaySigninError(`could not unlink: ${error.message}`, 'unlink_failed');
      return (data ?? []).length > 0;
    },
    async mintSession(userId) {
      // The same way Sign in with nixamp does it: a magic link for the BOUND
      // account's own address, generated and spent here, never sent anywhere.
      const found = await client.auth.admin.getUserById(userId);
      const email = found.data?.user?.email;
      if (found.error || !email) throw new CoinpaySigninError('could not find the connected account', 'not_connected');
      const link = await client.auth.admin.generateLink({ type: 'magiclink', email });
      const hashed = link.data?.properties?.hashed_token;
      if (link.error || !hashed) throw new CoinpaySigninError('could not sign that account in', 'link_failed');
      const verified = await client.auth.verifyOtp({ type: 'magiclink', token_hash: hashed });
      if (verified.error || !verified.data.session || verified.data.user?.id !== userId) {
        throw new CoinpaySigninError('could not sign that account in', 'verify_failed');
      }
      return { accessToken: verified.data.session.access_token, refreshToken: verified.data.session.refresh_token };
    },
  };
}

export class CoinpaySigninError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'CoinpaySigninError';
  }
}

/* ----------------------------------------------------------------- callback -- */

export interface CoinpayCallbackResult {
  mode: CoinpayMode;
  userId: string;
  session: { accessToken: string; refreshToken: string } | null;
  redirect: string;
}

/**
 * Finish a request. Throws CoinpaySigninError with a `reason` the pages know
 * how to say.
 */
export async function finishCoinpaySignin(input: {
  config: CoinpaySigninConfig;
  cookie: string | undefined | null;
  state: string | null;
  code: string | null;
  sessionUserId: string | null;
  store?: CoinpayStore;
  fetch?: typeof fetch;
  now?: number;
}): Promise<CoinpayCallbackResult> {
  const pending = openPending(input.cookie, input.config.clientSecret, input.now);
  if (!pending || !sameState(pending.state, input.state)) {
    throw new CoinpaySigninError('state mismatch', 'state_mismatch');
  }
  if (!input.code) throw new CoinpaySigninError('no code', 'missing_code_or_state');
  // A link finishes only in the account that started it.
  if (pending.mode === 'link' && (!input.sessionUserId || input.sessionUserId !== pending.userId)) {
    throw new CoinpaySigninError('linking needs the same signed-in account', 'not_authenticated');
  }

  let who: { sub: string; email: string | null; name: string | null };
  try {
    who = await finishSignIn({
      code: input.code,
      verifier: pending.verifier,
      nonce: pending.nonce,
      clientId: input.config.clientId,
      clientSecret: input.config.clientSecret,
      redirectUri: input.config.redirectUri,
      base: input.config.base,
      ...(input.fetch ? { fetch: input.fetch } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
  } catch (err) {
    throw new CoinpaySigninError(`CoinPay did not finish: ${(err as Error)?.message ?? err}`, 'exchange_failed');
  }

  const store = input.store ?? supabaseCoinpayStore();
  const bound = await store.bySub(who.sub);

  if (pending.mode === 'link') {
    const userId = pending.userId!;
    if (bound && bound.user_id !== userId) throw new CoinpaySigninError('sub bound elsewhere', 'sub_taken');
    const mine = await store.byUser(userId);
    if (mine && mine.sub !== who.sub) throw new CoinpaySigninError('another CoinPay is linked', 'already_linked');
    if (bound) await store.touch(who.sub, who.email, who.name);
    else await store.link({ sub: who.sub, user_id: userId, email: who.email, name: who.name });
    return { mode: 'link', userId, session: null, redirect: pending.redirect };
  }

  // Sign in: by sub, and only by sub.
  if (!bound) throw new CoinpaySigninError('no account here has connected that CoinPay account', 'not_connected');
  await store.touch(who.sub, who.email, who.name);
  const session = await store.mintSession(bound.user_id);
  return { mode: 'signin', userId: bound.user_id, session, redirect: pending.redirect };
}
