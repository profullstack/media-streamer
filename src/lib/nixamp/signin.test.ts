/**
 * Sign in with nixamp: only the account that connected that nixamp `sub` is
 * signed in. The address nixamp reports never finds an account here.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => ({ createServerClient: () => { throw new Error('not in this test'); } }));

const { sessionForNixampIdentity, safeRedirect, sessionCookieValue } = await import('./signin');

const SITE = 'https://nixamp.com';

interface Binding { user_id: string; nixamp_sub: string; nixamp_site: string }

function fakeClient(options: {
  bindings?: Binding[];
  users?: Record<string, string>;
  verifyAs?: string;
  verify?: unknown;
} = {}) {
  const bindings = options.bindings ?? [];
  const users = options.users ?? {};
  const calls: Record<string, unknown[]> = { createUser: [], generateLink: [], verifyOtp: [], getUserById: [] };
  const client = {
    from: (table: string) => {
      expect(table).toBe('bt_nixamp_accounts');
      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          filters[column] = value;
          return query;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: bindings.filter((row) => Object.entries(filters).every(([k, v]) => (row as unknown as Record<string, string>)[k] === v)),
            error: null,
          }),
      };
      return query;
    },
    auth: {
      admin: {
        createUser: vi.fn(async (input: unknown) => {
          calls.createUser!.push(input);
          return { data: { user: { id: 'u-new' } }, error: null };
        }),
        getUserById: vi.fn(async (id: string) => {
          calls.getUserById!.push(id);
          return users[id] ? { data: { user: { id, email: users[id] } }, error: null } : { data: { user: null }, error: { message: 'not found' } };
        }),
        generateLink: vi.fn(async (input: { email: string }) => {
          calls.generateLink!.push(input);
          return { data: { properties: { hashed_token: `hash:${input.email}` } }, error: null };
        }),
      },
      verifyOtp: vi.fn(async (input: { token_hash: string }) => {
        calls.verifyOtp!.push(input);
        if (options.verify) return options.verify;
        const email = input.token_hash.slice('hash:'.length);
        const id = options.verifyAs ?? Object.keys(users).find((key) => users[key] === email) ?? 'u-?';
        return { data: { user: { id }, session: { access_token: 'at', refresh_token: 'rt' } }, error: null };
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('sessionForNixampIdentity', () => {
  it('signs in the account that connected this nixamp sub, by its own address', async () => {
    const { client, calls } = fakeClient({
      bindings: [{ user_id: 'u-1', nixamp_sub: 'nx-1', nixamp_site: SITE }],
      users: { 'u-1': 'owner@b.test' },
    });
    const minted = await sessionForNixampIdentity({ sub: 'nx-1', site: SITE }, client);
    expect(minted).toEqual({ userId: 'u-1', accessToken: 'at', refreshToken: 'rt' });
    expect(calls.generateLink![0]).toEqual({ type: 'magiclink', email: 'owner@b.test' });
    expect(calls.createUser).toHaveLength(0);
  });

  it('an unconnected nixamp account never reaches the account that has its email (takeover)', async () => {
    // The victim has an account here; the attacker signed up on nixamp with
    // the victim's address and never connected anything.
    const { client, calls } = fakeClient({ users: { victim: 'victim@b.test' } });
    await expect(sessionForNixampIdentity({ sub: 'nx-attacker', site: SITE }, client)).rejects.toMatchObject({ reason: 'not_connected' });
    expect(calls.generateLink).toHaveLength(0);
    expect(calls.verifyOtp).toHaveLength(0);
    expect(calls.createUser).toHaveLength(0);
  });

  it('a binding at another nixamp site is not this one', async () => {
    const { client } = fakeClient({
      bindings: [{ user_id: 'u-1', nixamp_sub: 'nx-1', nixamp_site: 'https://other.example' }],
      users: { 'u-1': 'owner@b.test' },
    });
    await expect(sessionForNixampIdentity({ sub: 'nx-1', site: SITE }, client)).rejects.toMatchObject({ reason: 'not_connected' });
  });

  it('a sub connected to two accounts here is refused, not guessed', async () => {
    const { client, calls } = fakeClient({
      bindings: [
        { user_id: 'u-1', nixamp_sub: 'nx-1', nixamp_site: SITE },
        { user_id: 'u-2', nixamp_sub: 'nx-1', nixamp_site: SITE },
      ],
      users: { 'u-1': 'a@b.test', 'u-2': 'c@d.test' },
    });
    await expect(sessionForNixampIdentity({ sub: 'nx-1', site: SITE }, client)).rejects.toMatchObject({ reason: 'not_connected' });
    expect(calls.generateLink).toHaveLength(0);
  });

  it('a minted session for anyone but the connected account is refused', async () => {
    const { client } = fakeClient({
      bindings: [{ user_id: 'u-1', nixamp_sub: 'nx-1', nixamp_site: SITE }],
      users: { 'u-1': 'owner@b.test' },
      verifyAs: 'someone-else',
    });
    await expect(sessionForNixampIdentity({ sub: 'nx-1', site: SITE }, client)).rejects.toMatchObject({ reason: 'verify_failed' });
  });

  it('a link that will not verify is a failure', async () => {
    const { client } = fakeClient({
      bindings: [{ user_id: 'u-1', nixamp_sub: 'nx-1', nixamp_site: SITE }],
      users: { 'u-1': 'owner@b.test' },
      verify: { data: { user: null, session: null }, error: { message: 'expired' } },
    });
    await expect(sessionForNixampIdentity({ sub: 'nx-1', site: SITE }, client)).rejects.toMatchObject({ reason: 'verify_failed' });
  });
});

describe('safeRedirect', () => {
  it('keeps a path on this site', () => {
    expect(safeRedirect('/watch-party?code=ABC123')).toBe('/watch-party?code=ABC123');
  });
  it('refuses another origin however it is spelled', () => {
    expect(safeRedirect('https://evil.example/')).toBe('/settings?tab=connections');
    expect(safeRedirect('//evil.example')).toBe('/settings?tab=connections');
    expect(safeRedirect('/\\evil.example')).toBe('/settings?tab=connections');
    expect(safeRedirect('')).toBe('/settings?tab=connections');
    expect(safeRedirect(null, '/')).toBe('/');
  });
});

describe('sessionCookieValue', () => {
  it('is the same shape a password login sets', () => {
    const value = sessionCookieValue({ accessToken: 'a', refreshToken: 'r' });
    expect(JSON.parse(decodeURIComponent(value))).toEqual({ access_token: 'a', refresh_token: 'r' });
  });
});
