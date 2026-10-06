import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The database answer is stubbed: only the user id 'admin-1' is an admin.
vi.mock('@/lib/admin', () => ({
  checkUserAdmin: vi.fn(async (id: string) => ({ isAdmin: id === 'admin-1', source: id === 'admin-1' ? 'user_profiles' : null })),
}));

const { accessTokenOf, isAdminRequest, isSignInPath } = await import('./admin-gate');
const { proxy } = await import('@/proxy');

const cookies = (token?: string) => ({
  get: (name: string) =>
    token && name === 'sb-auth-token' ? { value: encodeURIComponent(JSON.stringify({ access_token: token, refresh_token: 'r' })) } : undefined,
});

/** Supabase's /auth/v1/user: token "admin-token" is user admin-1, "member-token" a paying member, anything else invalid. */
function stubSupabase() {
  vi.stubEnv('SUPABASE_URL', 'https://db.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('authorization');
    if (auth === 'Bearer admin-token') return Response.json({ id: 'admin-1' });
    if (auth === 'Bearer member-token') return Response.json({ id: 'member-1' });
    return new Response('{}', { status: 401 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('admin gate', () => {
  it('keeps sign-in reachable and signup closed', () => {
    expect(isSignInPath('/login')).toBe(true);
    expect(isSignInPath('/api/auth/callback')).toBe(true);
    expect(isSignInPath('/signup')).toBe(false);
    expect(isSignInPath('/loginx')).toBe(false);
  });

  it('reads the token from the session cookie or a bearer header', () => {
    expect(accessTokenOf(cookies('abc'), null)).toBe('abc');
    expect(accessTokenOf(cookies(), 'Bearer xyz')).toBe('xyz');
    expect(accessTokenOf(cookies(), null)).toBeNull();
    expect(accessTokenOf({ get: () => ({ value: 'not json' }) }, null)).toBeNull();
  });

  it('lets in an admin, and refuses a paying member, a bad token and no token', async () => {
    stubSupabase();
    expect(await isAdminRequest(cookies('admin-token'), null)).toBe(true);
    expect(await isAdminRequest(cookies('member-token'), null)).toBe(false);
    expect(await isAdminRequest(cookies('forged-token'), null)).toBe(false);
    expect(await isAdminRequest(cookies(), null)).toBe(false);
  });

  it('fails closed when Supabase cannot be reached', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://db.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await isAdminRequest(cookies('unreachable-token'), null)).toBe(false);
  });

  it('lets an admin in on an hour-old login: the session is refreshed first, then checked', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://db.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const expired = `${b64({ alg: 'none' })}.${b64({ sub: 'admin-1', exp: Math.floor(Date.now() / 1000) - 3600 })}.sig`;
    const fresh = `${b64({ alg: 'none' })}.${b64({ sub: 'admin-1', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/auth/v1/token')) {
          return Response.json({ access_token: fresh, refresh_token: 'rotated', expires_in: 3600, expires_at: 0, token_type: 'bearer', user: { id: 'admin-1' } });
        }
        const auth = new Headers(init?.headers).get('authorization');
        return auth === `Bearer ${fresh}` ? Response.json({ id: 'admin-1' }) : new Response('{}', { status: 401 });
      })
    );
    const cookie = encodeURIComponent(JSON.stringify({ access_token: expired, refresh_token: 'old' }));
    const res = await proxy(new NextRequest('https://bittorrented.com/dht', { headers: { cookie: `sb-auth-token=${cookie}` } }));
    expect([503, 410]).not.toContain(res.status); // admins see every route: neither the notice nor 410
    expect(res.headers.get('set-cookie')).toContain('sb-auth-token='); // the rotated tokens are kept
  });

  it('through the gate: invite-only screen for a paying member, the site for an admin', async () => {
    stubSupabase();
    const as = (token: string, path: string) =>
      proxy(new NextRequest(`https://bittorrented.com${path}`, { headers: { authorization: `Bearer ${token}` } }));
    const member = await as('member-token', '/account');
    expect(member.status).toBe(307);
    expect(member.headers.get('location')).toMatch(/\/invite-only$/);
    for (const p of ['/dht', '/torrents', '/']) {
      const r = await as('admin-token', p);
      expect([503, 410], p).not.toContain(r.status); // admins see every route
      expect(r.headers.get('location') ?? '', p).not.toContain('/pricing');
      expect(r.headers.get('location') ?? '', p).not.toContain('/invite-only');
    }
  });
});

describe('admin gate: cast tokens (a Chromecast has no cookie)', () => {
  async function token(userId: string) {
    vi.stubEnv('CAST_TOKEN_SECRET', 'admin-gate-cast-secret');
    const { createCastToken } = await import('@/lib/cast/token');
    return encodeURIComponent((await createCastToken(userId)).token);
  }
  const SEGMENT = 'https://bittorrented.com/api/stream/hls/segment?infohash=a&fileIndex=0&sessionId=s&file=segment0.ts';

  it("accepts an admin's token on a media route only", async () => {
    const { isAdminCastRequest } = await import('./admin-gate');
    const admin = await token('admin-1');
    expect(await isAdminCastRequest(`${SEGMENT}&ct=${admin}`)).toBe(true);
    expect(await isAdminCastRequest(`https://bittorrented.com/api/torrents?ct=${admin}`)).toBe(false);
  });

  it("refuses a member's token, a forged one and none", async () => {
    const { isAdminCastRequest } = await import('./admin-gate');
    expect(await isAdminCastRequest(`${SEGMENT}&ct=${await token('member-1')}`)).toBe(false);
    expect(await isAdminCastRequest(`${SEGMENT}&ct=${Buffer.from('admin-1.9999999999').toString('base64url')}.${'A'.repeat(43)}`)).toBe(false);
    expect(await isAdminCastRequest(SEGMENT)).toBe(false);
  });

  it('gets an admin cast past the invite-only notice, and nobody else', async () => {
    const crkey = 'Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Safari/537.36 CrKey/1.56.500000';
    const call = async (url: string) =>
      proxy(new NextRequest(url, { headers: { 'user-agent': crkey, 'x-forwarded-for': '24.1.2.3' } }));
    expect((await call(`${SEGMENT}&ct=${await token('admin-1')}`)).status).not.toBe(503);
    expect((await call(`${SEGMENT}&ct=${await token('member-1')}`)).status).toBe(503);
    expect((await call(SEGMENT)).status).toBe(503);
  });
});
