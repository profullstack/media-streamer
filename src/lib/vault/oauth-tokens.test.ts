/**
 * The OAuth / session tokens sealed on 2026-10-28 (YouTube, nixamp, SiriusXM):
 * sealed at rest, opened only while the owner is unlocked, refused (never
 * written in plaintext) while locked, and migrated from plaintext on unlock.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db: { written: { table: string; row: Row }[]; rows: Record<string, Row[]> } = { written: [], rows: {} };

function builder(table: string) {
  const filters: [string, unknown][] = [];
  let pending: Row | null = null;
  const rows = () => (db.rows[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
  const b = {
    select: () => b,
    order: () => b,
    limit: () => b,
    neq: () => b,
    eq(c: string, v: unknown) {
      filters.push([c, v]);
      return b;
    },
    upsert(row: Row) {
      pending = { id: 'row-1', ...row };
      db.written.push({ table, row });
      db.rows[table] = [pending];
      return b;
    },
    single: async () => ({ data: pending, error: null }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then(resolve: (v: { data: Row[]; error: null; count: number }) => void) {
      return resolve({ data: rows(), error: null, count: rows().length });
    },
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({ createServerClient: () => ({ from: (t: string) => builder(t) }) }));

import { FIELDS, VaultLockedError, migrateLegacySecrets, openWithKey, sealer, unlockStore } from '@/lib/vault';
import { resetUnlockStoreForTests } from './unlock';
import { upsertAccount } from '@/lib/youtube/repository';
import { upsertNixampAccount } from '@/lib/nixamp/accounts';
import { getCredentials, getCredentialsMeta, saveCredentials } from '@/lib/radio/siriusxm-credentials';

const USER = '33333333-3333-3333-3333-333333333333';
let dek: Uint8Array;

beforeAll(async () => {
  dek = (await sealer.createSeal('correct horse battery staple', USER)).dek;
});

afterEach(() => {
  resetUnlockStoreForTests();
  db.written = [];
  db.rows = {};
});

const unlock = () => unlockStore().unlock(USER, dek, 3600);

describe('YouTube tokens', () => {
  const input = {
    userId: USER,
    googleSub: 'g-1',
    email: null,
    displayName: null,
    avatarUrl: null,
    accessToken: 'ya29.plain-access',
    refreshToken: '1//plain-refresh',
    tokenExpiresAt: new Date().toISOString(),
    scopes: [],
  };

  it('locked: refused, nothing written', async () => {
    await expect(upsertAccount(input)).rejects.toBeInstanceOf(VaultLockedError);
    expect(db.written).toHaveLength(0);
  });

  it('unlocked: sealed at rest under the owner key', async () => {
    unlock();
    await upsertAccount(input);
    const row = db.written[0].row;
    expect(JSON.stringify(row)).not.toContain('plain-access');
    expect(JSON.stringify(row)).not.toContain('plain-refresh');
    expect(await openWithKey(dek, USER, FIELDS.youtubeRefreshToken, row.refresh_token as string)).toBe('1//plain-refresh');
  });
});

describe('nixamp tokens', () => {
  const input = {
    userId: USER,
    nixampSub: 'n-1',
    nixampSite: 'https://nixamp.com',
    accessToken: 'nx-plain-access',
    refreshToken: 'nx-plain-refresh',
    expiresIn: 3600,
    scopes: [],
  };

  it('connect while locked is refused; sign-in while locked keeps the identity with no tokens', async () => {
    await expect(upsertNixampAccount(input)).rejects.toBeInstanceOf(VaultLockedError);
    expect(db.written).toHaveLength(0);
    await upsertNixampAccount({ ...input, identityOnlyWhenLocked: true });
    expect(db.written[0].row).toMatchObject({ nixamp_sub: 'n-1', access_token: '', refresh_token: null });
  });

  it('unlocked: sealed at rest', async () => {
    unlock();
    await upsertNixampAccount(input);
    const row = db.written[0].row;
    expect(JSON.stringify(row)).not.toContain('nx-plain');
    expect(await openWithKey(dek, USER, FIELDS.nixampAccessToken, row.access_token as string)).toBe('nx-plain-access');
  });
});

describe('SiriusXM session', () => {
  const input = { userId: USER, email: 'me@example.com', accessToken: 'sxm-plain', sessionCookies: 'a=1; b=2' };

  it('locked: save refused; unlocked: sealed at rest, opens; lock: read refused, meta still works', async () => {
    await expect(saveCredentials(input)).rejects.toBeInstanceOf(VaultLockedError);
    unlock();
    await saveCredentials(input);
    const row = db.written[0].row;
    expect(JSON.stringify(row)).not.toContain('sxm-plain');
    expect(JSON.stringify(row)).not.toContain('a=1');
    expect((await getCredentials(USER))?.sessionCookies).toBe('a=1; b=2');
    unlockStore().lock(USER);
    await expect(getCredentials(USER)).rejects.toBeInstanceOf(VaultLockedError);
    expect(await getCredentialsMeta(USER)).toMatchObject({ email: 'me@example.com' });
  });

  it('a plaintext row still works while the migration is on, and not after the cutoff', async () => {
    db.rows.bt_siriusxm_sessions = [{ user_id: USER, email: null, access_token: 'old-plain', session_cookies: 'c=3' }];
    unlock();
    await expect(getCredentials(USER)).resolves.toMatchObject({ accessToken: 'old-plain' });
    vi.stubEnv('LEGACY_KEY_MIGRATION', 'off');
    await expect(getCredentials(USER)).rejects.toMatchObject({ code: 'legacy_unmigrated' });
    vi.unstubAllEnvs();
  });
});

describe('migration of plaintext OAuth tokens', () => {
  it('re-seals YouTube, nixamp and SiriusXM rows on unlock', async () => {
    const tables: Record<string, Row[]> = {
      bt_youtube_accounts: [{ id: 'y1', user_id: USER, access_token: 'ya-a', refresh_token: 'ya-r' }],
      bt_nixamp_accounts: [{ id: 'x1', user_id: USER, access_token: 'nx-a', refresh_token: null }],
      bt_siriusxm_sessions: [{ user_id: USER, access_token: 'sx-a', session_cookies: '' }],
      profiles: [],
    };
    const client = {
      from(table: string) {
        const filters: [string, unknown][] = [];
        let patch: Row | null = null;
        const match = (r: Row) => filters.every(([c, v]) => r[c] === v);
        const b = {
          select: () => b,
          in: () => b,
          update(p: Row) {
            patch = p;
            return b;
          },
          eq(c: string, v: unknown) {
            filters.push([c, v]);
            return b;
          },
          then(resolve: (v: { data: Row[] | null; error: null }) => void) {
            const rows = (tables[table] ?? []).filter(match);
            if (patch) {
              for (const r of rows) Object.assign(r, patch);
              return resolve({ data: null, error: null });
            }
            return resolve({ data: rows.map((r) => ({ ...r })), error: null });
          },
        };
        return b;
      },
    };
     
    const result = await migrateLegacySecrets(USER, dek, client as any);
    expect(result).toEqual({ migrated: 4, failed: 0, remaining: 0 });
    const y = tables.bt_youtube_accounts[0];
    expect(await openWithKey(dek, USER, FIELDS.youtubeRefreshToken, y.refresh_token as string)).toBe('ya-r');
    expect(await openWithKey(dek, USER, FIELDS.nixampAccessToken, tables.bt_nixamp_accounts[0].access_token as string)).toBe('nx-a');
    expect(tables.bt_nixamp_accounts[0].refresh_token).toBeNull();
    expect(await openWithKey(dek, USER, FIELDS.siriusxmAccessToken, tables.bt_siriusxm_sessions[0].access_token as string)).toBe('sx-a');
    expect(tables.bt_siriusxm_sessions[0].session_cookies).toBe('');
  });
});
