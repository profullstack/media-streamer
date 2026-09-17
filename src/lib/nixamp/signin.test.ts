/**
 * Sign in with nixamp: the account with that email is theirs, made if absent,
 * and a session is minted for it without a password.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => ({ createServerClient: () => { throw new Error('not in this test'); } }));

const { sessionForNixampIdentity, safeRedirect, sessionCookieValue } = await import('./signin');

function fakeClient(overrides: { create?: unknown; link?: unknown; verify?: unknown } = {}) {
  const calls: Record<string, unknown[]> = { createUser: [], generateLink: [], verifyOtp: [] };
  const client = {
    auth: {
      admin: {
        createUser: vi.fn(async (input: unknown) => {
          calls.createUser!.push(input);
          return overrides.create ?? { data: { user: { id: 'u-new' } }, error: null };
        }),
        generateLink: vi.fn(async (input: unknown) => {
          calls.generateLink!.push(input);
          return overrides.link ?? { data: { properties: { hashed_token: 'hash-1' } }, error: null };
        }),
      },
      verifyOtp: vi.fn(async (input: unknown) => {
        calls.verifyOtp!.push(input);
        return (
          overrides.verify ?? {
            data: { user: { id: 'u-1' }, session: { access_token: 'at', refresh_token: 'rt' } },
            error: null,
          }
        );
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('sessionForNixampIdentity', () => {
  it('makes a confirmed account with the handle as its name, then a session', async () => {
    const { client, calls } = fakeClient();
    const minted = await sessionForNixampIdentity({ email: 'Chovy@Example.com', handle: 'chovy', sub: 'nx-1' }, client);
    expect(minted).toEqual({ userId: 'u-1', accessToken: 'at', refreshToken: 'rt', created: true });
    expect(calls.createUser![0]).toMatchObject({
      email: 'chovy@example.com',
      email_confirm: true,
      user_metadata: { display_name: 'chovy', nixamp_handle: 'chovy', nixamp_sub: 'nx-1' },
    });
    expect(calls.generateLink![0]).toEqual({ type: 'magiclink', email: 'chovy@example.com' });
    expect(calls.verifyOtp![0]).toEqual({ type: 'magiclink', token_hash: 'hash-1' });
  });

  it('an account that already exists is the one signed in', async () => {
    const { client } = fakeClient({ create: { data: { user: null }, error: { message: 'A user with this email address has already been registered' } } });
    const minted = await sessionForNixampIdentity({ email: 'a@b.test', sub: 'nx-1' }, client);
    expect(minted.created).toBe(false);
    expect(minted.userId).toBe('u-1');
  });

  it('needs an email, because that is what names the account here', async () => {
    const { client, calls } = fakeClient();
    await expect(sessionForNixampIdentity({ email: '', sub: 'nx-1' }, client)).rejects.toMatchObject({ reason: 'no_email' });
    expect(calls.createUser).toHaveLength(0);
  });

  it('any other refusal to create is a failure, not a silent sign-in', async () => {
    const { client } = fakeClient({ create: { data: { user: null }, error: { message: 'Database error' } } });
    await expect(sessionForNixampIdentity({ email: 'a@b.test', sub: 'nx-1' }, client)).rejects.toMatchObject({ reason: 'create_failed' });
  });

  it('a link that will not verify is a failure', async () => {
    const { client } = fakeClient({ verify: { data: { user: null, session: null }, error: { message: 'expired' } } });
    await expect(sessionForNixampIdentity({ email: 'a@b.test', sub: 'nx-1' }, client)).rejects.toMatchObject({ reason: 'verify_failed' });
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
