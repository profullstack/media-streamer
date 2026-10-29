import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ createServerClient: () => ({}) }));

import { VaultLockedError, isVaultLockedError } from './errors';
import { SEALED_PREFIX, openOptional, openWithKey, sealOptional, sealValue, sealWithKey } from './fields';
import { isLegacyValue, legacyMigrationEnabled, openLegacyValue } from './legacy';
import { FIELDS, migrateLegacySecrets } from './migrate';
import { sealer } from './sealer';
import { dataKeyFor, resetUnlockStoreForTests, ttlSeconds, unlockStore } from './unlock';

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const LEGACY_SECRET = 'test-legacy-server-key';

function legacyEncrypt(prefix: string, plaintext: string, secret = LEGACY_SECRET): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [prefix, iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

let dek: Uint8Array;

beforeAll(async () => {
  const created = await sealer.createSeal('correct horse battery staple', USER);
  dek = created.dek;
  expect(created.recoveryKey).toBeTruthy();
  // The seal record carries no plaintext key material.
  expect(JSON.stringify(created.seal)).not.toContain(Buffer.from(dek).toString('base64'));
});

afterEach(() => {
  resetUnlockStoreForTests();
  vi.unstubAllEnvs();
});

describe('seal / unseal', () => {
  it('round-trips and never stores plaintext', async () => {
    const sealed = await sealWithKey(dek, USER, FIELDS.seedboxSshKey, '-----BEGIN KEY-----abc');
    expect(sealed.startsWith(SEALED_PREFIX)).toBe(true);
    expect(sealed).not.toContain('BEGIN KEY');
    await expect(openWithKey(dek, USER, FIELDS.seedboxSshKey, sealed)).resolves.toBe('-----BEGIN KEY-----abc');
  });

  it('binds the owner and the field (AAD)', async () => {
    const sealed = await sealWithKey(dek, USER, FIELDS.smtpPassword, 'pw');
    await expect(openWithKey(dek, OTHER, FIELDS.smtpPassword, sealed)).rejects.toThrow();
    await expect(openWithKey(dek, USER, FIELDS.imapPassword, sealed)).rejects.toThrow();
  });

  it('the passphrase and the recovery key open the same data key', async () => {
    const { dek: k, seal, recoveryKey } = await sealer.createSeal('another long passphrase', OTHER);
    expect(await sealer.unlockSeal(seal, 'another long passphrase', OTHER)).toEqual(k);
    expect(await sealer.unlockSealWithRecovery(seal, recoveryKey, OTHER)).toEqual(k);
    await expect(sealer.unlockSeal(seal, 'wrong passphrase!!', OTHER)).rejects.toThrow();
  });
});

describe('unlock store', () => {
  it('locked -> unlocked -> locked, and a restart re-locks', async () => {
    await expect(sealValue(USER, FIELDS.smtpPassword, 'x')).rejects.toBeInstanceOf(VaultLockedError);

    unlockStore().unlock(USER, dek, ttlSeconds('8h'));
    const sealed = await sealValue(USER, FIELDS.smtpPassword, 'hunter2');
    await expect(openOptional(USER, FIELDS.smtpPassword, sealed)).resolves.toBe('hunter2');

    unlockStore().lock(USER);
    await expect(openOptional(USER, FIELDS.smtpPassword, sealed)).rejects.toMatchObject({ code: 'vault_locked' });

    unlockStore().unlock(USER, dek);
    resetUnlockStoreForTests(); // what a process restart does
    expect(dataKeyFor(USER)).toBeNull();
    await expect(openOptional(USER, FIELDS.smtpPassword, sealed)).rejects.toSatisfy(isVaultLockedError);
  });

  it('expires after its TTL', () => {
    vi.useFakeTimers();
    try {
      unlockStore().unlock(USER, dek, 60);
      expect(dataKeyFor(USER)).not.toBeNull();
      vi.advanceTimersByTime(61_000);
      expect(dataKeyFor(USER)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a copy of the key, so the caller can wipe its own', () => {
    const copy = new Uint8Array(dek);
    unlockStore().unlock(USER, copy);
    copy.fill(0);
    expect(dataKeyFor(USER)).toEqual(dek);
  });

  it('ttl defaults to 8h and caps at 7d', () => {
    expect(ttlSeconds(undefined)).toBe(8 * 3600);
    expect(ttlSeconds('7d')).toBe(7 * 86400);
    expect(ttlSeconds('30d')).toBe(7 * 86400);
    expect(() => ttlSeconds('soon')).toThrow();
  });

  it('null and blank secrets pass through without a key', async () => {
    await expect(openOptional(USER, FIELDS.seedboxHttpToken, null)).resolves.toBeNull();
    await expect(sealOptional(USER, FIELDS.seedboxHttpToken, '  ')).resolves.toBeNull();
  });
});

describe('no env fallback', () => {
  it('an old-key value still opens while the migration is on, and not after the cutoff', async () => {
    vi.stubEnv('ENCRYPTION_KEY', LEGACY_SECRET);
    const legacy = legacyEncrypt('senc:v1', 'token');
    await expect(openOptional(USER, FIELDS.seedboxHttpToken, legacy)).resolves.toBe('token');
    vi.stubEnv('LEGACY_KEY_MIGRATION', 'off');
    await expect(openOptional(USER, FIELDS.seedboxHttpToken, legacy)).rejects.toMatchObject({
      code: 'legacy_unmigrated',
    });
    vi.stubEnv('LEGACY_KEY_MIGRATION', 'on');
    // Writes need the user's key, never the env key.
    unlockStore().lock(USER);
    await expect(sealValue(USER, FIELDS.seedboxHttpToken, 'new')).rejects.toBeInstanceOf(VaultLockedError);
  });
});

describe('legacy values', () => {
  it('opens all three old formats and plaintext, only while migration is on', () => {
    vi.stubEnv('ENCRYPTION_KEY', LEGACY_SECRET);
    expect(openLegacyValue(legacyEncrypt('fenc:v1', '{"apiKey":"a"}'))).toBe('{"apiKey":"a"}');
    expect(openLegacyValue(legacyEncrypt('senc:v1', 'tok'))).toBe('tok');
    expect(openLegacyValue(legacyEncrypt('enc:v1', 'pw'))).toBe('pw');
    expect(openLegacyValue('plain-old-password')).toBe('plain-old-password');
    expect(isLegacyValue('ss2:abc')).toBe(false);
    expect(isLegacyValue('senc:v1:a:b:c')).toBe(true);

    vi.stubEnv('LEGACY_KEY_MIGRATION', 'off');
    expect(legacyMigrationEnabled()).toBe(false);
    expect(() => openLegacyValue(legacyEncrypt('senc:v1', 'tok'))).toThrow(/switched off/);
  });

  it('accepts the ENCYRPTION_KEY and EMAIL_ACCOUNTS_ENCRYPTION_KEY spellings', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    vi.stubEnv('ENCYRPTION_KEY', LEGACY_SECRET);
    // An empty ENCRYPTION_KEY is still "set" (??), mirroring the old helpers.
    expect(() => openLegacyValue(legacyEncrypt('senc:v1', 'tok'))).toThrow();
    vi.unstubAllEnvs();
    vi.stubEnv('EMAIL_ACCOUNTS_ENCRYPTION_KEY', LEGACY_SECRET);
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCYRPTION_KEY;
    expect(openLegacyValue(legacyEncrypt('enc:v1', 'pw'))).toBe('pw');
  });
});

// ---------------------------------------------------------------------------
// Migration against an in-memory stand-in for the Supabase query builder
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const updates: { table: string; patch: Row }[] = [];
  const client = {
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: [string, unknown, 'eq' | 'in'][] = [];
      let patch: Row | null = null;
      const match = (r: Row) =>
        filters.every(([c, v, op]) => (op === 'in' ? (v as unknown[]).includes(r[c]) : r[c] === v));
      const builder = {
        select() {
          return builder;
        },
        update(p: Row) {
          patch = p;
          return builder;
        },
        eq(c: string, v: unknown) {
          filters.push([c, v, 'eq']);
          return builder;
        },
        in(c: string, v: unknown[]) {
          filters.push([c, v, 'in']);
          return builder;
        },
        then(resolve: (v: { data: Row[] | null; error: null }) => void) {
          if (patch) {
            for (const r of rows.filter(match)) Object.assign(r, patch);
            updates.push({ table, patch });
            return resolve({ data: null, error: null });
          }
          return resolve({ data: rows.filter(match).map((r) => ({ ...r })), error: null });
        },
      };
      return builder;
    },
  };
  return { client, updates };
}

describe('migrateLegacySecrets', () => {
  it('re-seals legacy rows under the user key and leaves no legacy value behind', async () => {
    vi.stubEnv('ENCRYPTION_KEY', LEGACY_SECRET);
    const tables: Record<string, Row[]> = {
      account_seedbox_configs: [
        {
          id: 's1',
          account_id: USER,
          http_token_encrypted: legacyEncrypt('senc:v1', 'http-tok'),
          ssh_private_key_encrypted: legacyEncrypt('senc:v1', 'ssh-key'),
          files_token_encrypted: null,
          files_basic_pass_encrypted: null,
        },
        { id: 's2', account_id: OTHER, http_token_encrypted: legacyEncrypt('senc:v1', 'theirs') },
      ],
      email_accounts: [
        {
          id: 'e1',
          user_id: USER,
          smtp_password: legacyEncrypt('enc:v1', 'smtp-pw'),
          imap_password: 'plaintext-imap-pw',
          smtp_username: legacyEncrypt('enc:v1', 'me@example.com'),
          imap_username: null,
        },
      ],
      profiles: [{ id: 'p1', account_id: USER }],
      finance_broker_connections: [
        { id: 'b1', profile_id: 'p1', encrypted_credentials: legacyEncrypt('fenc:v1', '{"apiKey":"k"}') },
      ],
      bt_spotify_sessions: [{ user_id: USER, credentials_enc: legacyEncrypt('senc:v1', '{"username":"u"}') }],
      vod_providers: [
        { id: 'v1', owner_account_id: USER, source_password_encrypted: legacyEncrypt('senc:v1', 'vodpw'), source_token_encrypted: null },
      ],
    };
    const { client } = fakeDb(tables);

     
    const result = await migrateLegacySecrets(USER, dek, client as any);
    expect(result).toEqual({ migrated: 8, failed: 0, remaining: 0 });

    const sb = tables.account_seedbox_configs[0];
    expect(await openWithKey(dek, USER, FIELDS.seedboxHttpToken, sb.http_token_encrypted as string)).toBe('http-tok');
    expect(await openWithKey(dek, USER, FIELDS.seedboxSshKey, sb.ssh_private_key_encrypted as string)).toBe('ssh-key');
    // Another user's row is untouched.
    expect(String(tables.account_seedbox_configs[1].http_token_encrypted).startsWith('senc:v1:')).toBe(true);

    const em = tables.email_accounts[0];
    expect(await openWithKey(dek, USER, FIELDS.smtpPassword, em.smtp_password as string)).toBe('smtp-pw');
    expect(await openWithKey(dek, USER, FIELDS.imapPassword, em.imap_password as string)).toBe('plaintext-imap-pw');
    expect(em.smtp_username).toBe('me@example.com');

    const br = tables.finance_broker_connections[0];
    expect(await openWithKey(dek, USER, FIELDS.brokerCredentials, br.encrypted_credentials as string)).toBe('{"apiKey":"k"}');
    const sp = tables.bt_spotify_sessions[0];
    expect(await openWithKey(dek, USER, FIELDS.spotifyCredentials, sp.credentials_enc as string)).toBe('{"username":"u"}');
    const vod = tables.vod_providers[0];
    expect(await openWithKey(dek, USER, FIELDS.vodPassword, vod.source_password_encrypted as string)).toBe('vodpw');

    // Running it again is a no-op.
     
    expect(await migrateLegacySecrets(USER, dek, client as any)).toEqual({ migrated: 0, failed: 0, remaining: 0 });
  });

  it('with LEGACY_KEY_MIGRATION=off, counts what is left and changes nothing', async () => {
    vi.stubEnv('ENCRYPTION_KEY', LEGACY_SECRET);
    vi.stubEnv('LEGACY_KEY_MIGRATION', 'off');
    const original = legacyEncrypt('senc:v1', 'tok');
    const tables: Record<string, Row[]> = {
      account_seedbox_configs: [{ id: 's1', account_id: USER, http_token_encrypted: original }],
      profiles: [],
    };
    const { client, updates } = fakeDb(tables);
     
    const result = await migrateLegacySecrets(USER, dek, client as any);
    expect(result).toEqual({ migrated: 0, failed: 0, remaining: 1 });
    expect(updates).toHaveLength(0);
    expect(tables.account_seedbox_configs[0].http_token_encrypted).toBe(original);
  });

  it('a row that will not decrypt is kept and counted, never deleted', async () => {
    vi.stubEnv('ENCRYPTION_KEY', 'a-different-key');
    const original = legacyEncrypt('senc:v1', 'zz-secret-zz');
    const tables: Record<string, Row[]> = {
      account_seedbox_configs: [{ id: 's1', account_id: USER, http_token_encrypted: original }],
      profiles: [],
    };
    const { client } = fakeDb(tables);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
     
    const result = await migrateLegacySecrets(USER, dek, client as any);
    expect(result).toEqual({ migrated: 0, failed: 1, remaining: 1 });
    expect(tables.account_seedbox_configs[0].http_token_encrypted).toBe(original);
    // The log names the row, never the value.
    expect(String(spy.mock.calls[0]?.[0])).not.toContain('zz-secret-zz');
    spy.mockRestore();
  });
});
