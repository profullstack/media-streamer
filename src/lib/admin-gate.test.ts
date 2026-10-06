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
