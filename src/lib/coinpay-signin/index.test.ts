/**
 * Sign in with CoinPay: bound by `sub`, never by the (unverified) CoinPay
 * email; a link needs the signed-in account that started it; a forged or
 * replayed state, a wrong nonce or a userinfo sub mismatch is refused.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createServerClient: () => { throw new Error('not in this test'); } }));

const lib = await import('./index');
const { finishCoinpaySignin, startCoinpaySignin, openPending, sealPending } = lib;
type Store = import('./index').CoinpayStore;
type Row = import('./index').CoinpayIdentityRow;

const config = {
  clientId: 'cp_test_client',
  clientSecret: 'test-client-secret-value',
  base: 'https://coinpayportal.com',
  redirectUri: 'https://bittorrented.com/api/v1/coinpay/oauth/callback',
};

function fakeStore(rows: Row[] = []): Store & { rows: Row[]; minted: string[] } {
  const minted: string[] = [];
  return {
    rows,
    minted,
    bySub: async (sub) => rows.find((r) => r.sub === sub) ?? null,
    byUser: async (id) => rows.find((r) => r.user_id === id) ?? null,
    link: async (row) => { rows.push(row); },
    touch: async () => {},
    unlink: async (id) => { const i = rows.findIndex((r) => r.user_id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
    mintSession: async (id) => { minted.push(id); return { accessToken: `at-${id}`, refreshToken: 'rt' }; },
  };
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function fakeCoinpay(opts: { sub: string; email?: string; nonce: string; userinfoSub?: string }) {
  const bodies: string[] = [];
  const fakeFetch = (async (url: URL | string, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/oauth/token') {
      bodies.push(String(init?.body ?? ''));
      const idToken = `${b64({ alg: 'RS256' })}.${b64({
        iss: config.base, aud: config.clientId, sub: opts.sub, nonce: opts.nonce,
        exp: Math.floor(Date.now() / 1000) + 600, email: opts.email,
      })}.sig`;
      return Response.json({ access_token: 'at', token_type: 'Bearer', expires_in: 3600, id_token: idToken });
    }
    if (path === '/api/oauth/userinfo') {
      return Response.json({ sub: opts.userinfoSub ?? opts.sub, email: opts.email, email_verified: false });
    }
    return new Response('no', { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch: fakeFetch, bodies };
}

function begin(mode: 'signin' | 'link' = 'signin', userId?: string) {
  const { url, cookie } = startCoinpaySignin(config, { mode, ...(userId ? { userId } : {}), redirect: '/' });
  const pending = openPending(cookie, config.clientSecret)!;
  return { url: new URL(url), cookie, pending };
}

describe('start', () => {
  it('sends PKCE S256, state and nonce to CoinPay, and keeps the verifier in the signed cookie', () => {
    const { url, pending } = begin();
    expect(url.origin + url.pathname).toBe('https://coinpayportal.com/api/oauth/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('nonce')).toBe(pending.nonce);
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.toString()).not.toContain(pending.verifier);
  });

  it('refuses a cookie that was edited or signed with another key', () => {
    const { cookie, pending } = begin('link', 'victim');
    const forged = sealPending({ ...pending, userId: 'attacker' }, 'some-other-secret');
    expect(openPending(forged, config.clientSecret)).toBeNull();
    const [body] = cookie.split('.');
    expect(openPending(`${body}.AAAA`, config.clientSecret)).toBeNull();
  });
});

describe('callback', () => {
  it('a CoinPay login carrying an existing user\'s email does NOT get that account', async () => {
    const store = fakeStore([{ sub: 'victim-sub', user_id: 'victim', email: 'victim@acme.com', name: null }]);
    const { cookie, pending } = begin();
    const { fetch } = fakeCoinpay({ sub: 'attacker-sub', email: 'victim@acme.com', nonce: pending.nonce });
    await expect(
      finishCoinpaySignin({ config, cookie, state: pending.state, code: 'c', sessionUserId: null, store, fetch })
    ).rejects.toMatchObject({ reason: 'not_connected' });
    expect(store.minted).toEqual([]);
  });

  it('signs in the account bound to the sub, sending the secret and the verifier', async () => {
    const store = fakeStore([{ sub: 'sub-1', user_id: 'u1', email: null, name: null }]);
    const { cookie, pending } = begin();
    const { fetch, bodies } = fakeCoinpay({ sub: 'sub-1', email: 'whoever@x.co', nonce: pending.nonce });
    const out = await finishCoinpaySignin({ config, cookie, state: pending.state, code: 'c', sessionUserId: null, store, fetch });
    expect(out).toMatchObject({ mode: 'signin', userId: 'u1' });
    expect(store.minted).toEqual(['u1']);
    const form = new URLSearchParams(bodies[0]);
    expect(form.get('client_secret')).toBe(config.clientSecret);
    expect(form.get('code_verifier')).toBe(pending.verifier);
  });

  it('refuses a forged state, and a callback with no cookie', async () => {
    const store = fakeStore([{ sub: 'sub-1', user_id: 'u1', email: null, name: null }]);
    const { cookie, pending } = begin();
    const { fetch } = fakeCoinpay({ sub: 'sub-1', nonce: pending.nonce });
    await expect(
      finishCoinpaySignin({ config, cookie, state: 'forged', code: 'c', sessionUserId: null, store, fetch })
    ).rejects.toMatchObject({ reason: 'state_mismatch' });
    await expect(
      finishCoinpaySignin({ config, cookie: undefined, state: pending.state, code: 'c', sessionUserId: null, store, fetch })
    ).rejects.toMatchObject({ reason: 'state_mismatch' });
  });

  it('refuses an expired request', async () => {
    const { cookie, pending } = begin();
    const later = Date.now() + 11 * 60 * 1000;
    await expect(
      finishCoinpaySignin({ config, cookie, state: pending.state, code: 'c', sessionUserId: null, store: fakeStore(), now: later })
    ).rejects.toMatchObject({ reason: 'state_mismatch' });
  });

  it('refuses a wrong nonce and a userinfo sub that does not match', async () => {
    const store = fakeStore([{ sub: 'sub-1', user_id: 'u1', email: null, name: null }]);
    const a = begin();
    await expect(
      finishCoinpaySignin({ config, cookie: a.cookie, state: a.pending.state, code: 'c', sessionUserId: null, store, fetch: fakeCoinpay({ sub: 'sub-1', nonce: 'nope' }).fetch })
    ).rejects.toMatchObject({ reason: 'exchange_failed' });
    const b = begin();
    await expect(
      finishCoinpaySignin({ config, cookie: b.cookie, state: b.pending.state, code: 'c', sessionUserId: null, store, fetch: fakeCoinpay({ sub: 'sub-1', userinfoSub: 'sub-2', nonce: b.pending.nonce }).fetch })
    ).rejects.toMatchObject({ reason: 'exchange_failed' });
    expect(store.minted).toEqual([]);
  });

  it('linking needs the signed-in account that started it', async () => {
    const store = fakeStore();
    const { cookie, pending } = begin('link', 'owner');
    const { fetch } = fakeCoinpay({ sub: 'link-sub', nonce: pending.nonce });
    await expect(
      finishCoinpaySignin({ config, cookie, state: pending.state, code: 'c', sessionUserId: null, store, fetch })
    ).rejects.toMatchObject({ reason: 'not_authenticated' });
    await expect(
      finishCoinpaySignin({ config, cookie, state: pending.state, code: 'c', sessionUserId: 'someone-else', store, fetch })
    ).rejects.toMatchObject({ reason: 'not_authenticated' });
    expect(store.rows).toEqual([]);
    const out = await finishCoinpaySignin({ config, cookie, state: pending.state, code: 'c', sessionUserId: 'owner', store, fetch });
    expect(out.mode).toBe('link');
    expect(out.session).toBeNull();
    expect(store.rows).toEqual([{ sub: 'link-sub', user_id: 'owner', email: null, name: null }]);
  });

  it('will not link a sub that belongs to another account', async () => {
    const store = fakeStore([{ sub: 'taken', user_id: 'first', email: null, name: null }]);
    const { cookie, pending } = begin('link', 'second');
    const { fetch } = fakeCoinpay({ sub: 'taken', nonce: pending.nonce });
    await expect(
      finishCoinpaySignin({ config, cookie, state: pending.state, code: 'c', sessionUserId: 'second', store, fetch })
    ).rejects.toMatchObject({ reason: 'sub_taken' });
  });
});
