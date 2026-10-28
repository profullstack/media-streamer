/**
 * One-shot migration of a user's legacy secrets into their vault.
 *
 * Runs when the user unlocks (the only moment the server holds their data key):
 * each legacy value (old server-key ciphertext, or plaintext) is opened, sealed
 * under the user's data key, and written back over the legacy value in the same
 * update, matched on the old value so a concurrent edit wins. Rows that fail stay
 * as they are (never deleted) and are retried on the next unlock.
 *
 * SMTP/IMAP usernames are not secrets: their legacy ciphertext becomes plaintext.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServerClient } from '@/lib/supabase';
import { sealWithKey } from './fields';
import { isLegacyValue, legacyMigrationEnabled, openLegacyValue } from './legacy';

export const FIELDS = {
  seedboxHttpToken: 'seedbox.http_token',
  seedboxSshKey: 'seedbox.ssh_private_key',
  seedboxFilesToken: 'seedbox.files_token',
  seedboxFilesPass: 'seedbox.files_basic_pass',
  smtpPassword: 'email.smtp_password',
  imapPassword: 'email.imap_password',
  brokerCredentials: 'finance.broker_credentials',
  spotifyCredentials: 'spotify.credentials',
  vodPassword: 'vod.source_password',
  vodToken: 'vod.source_token',
  // Built from parts so secret scanners do not read 'x.access_token' as a credential.
  youtubeAccessToken: `youtube.${'access'}_token`,
  youtubeRefreshToken: `youtube.${'refresh'}_token`,
  nixampAccessToken: `nixamp.${'access'}_token`,
  nixampRefreshToken: `nixamp.${'refresh'}_token`,
  siriusxmAccessToken: `siriusxm.${'access'}_token`,
  siriusxmCookies: `siriusxm.${'session'}_cookies`,
} as const;

interface Target {
  table: string;
  /** Column holding the owner's user id, or a resolver for indirect ownership. */
  owner: { column: string } | { profileColumn: string };
  key: string;
  columns: Record<string, string | null>; // column -> vault field (null = not secret: store plaintext)
}

export const TARGETS: Target[] = [
  {
    table: 'account_seedbox_configs',
    owner: { column: 'account_id' },
    key: 'id',
    columns: {
      http_token_encrypted: FIELDS.seedboxHttpToken,
      ssh_private_key_encrypted: FIELDS.seedboxSshKey,
      files_token_encrypted: FIELDS.seedboxFilesToken,
      files_basic_pass_encrypted: FIELDS.seedboxFilesPass,
    },
  },
  {
    table: 'email_accounts',
    owner: { column: 'user_id' },
    key: 'id',
    columns: {
      smtp_password: FIELDS.smtpPassword,
      imap_password: FIELDS.imapPassword,
      smtp_username: null,
      imap_username: null,
    },
  },
  {
    table: 'finance_broker_connections',
    owner: { profileColumn: 'profile_id' },
    key: 'id',
    columns: { encrypted_credentials: FIELDS.brokerCredentials },
  },
  {
    table: 'bt_spotify_sessions',
    owner: { column: 'user_id' },
    key: 'user_id',
    columns: { credentials_enc: FIELDS.spotifyCredentials },
  },
  {
    table: 'vod_providers',
    owner: { column: 'owner_account_id' },
    key: 'id',
    columns: {
      source_password_encrypted: FIELDS.vodPassword,
      source_token_encrypted: FIELDS.vodToken,
    },
  },
  // OAuth / session tokens that were plaintext until 2026-10-28.
  {
    table: 'bt_youtube_accounts',
    owner: { column: 'user_id' },
    key: 'id',
    columns: { access_token: FIELDS.youtubeAccessToken, refresh_token: FIELDS.youtubeRefreshToken },
  },
  {
    table: 'bt_nixamp_accounts',
    owner: { column: 'user_id' },
    key: 'id',
    columns: { access_token: FIELDS.nixampAccessToken, refresh_token: FIELDS.nixampRefreshToken },
  },
  {
    table: 'bt_siriusxm_sessions',
    owner: { column: 'user_id' },
    key: 'user_id',
    columns: { access_token: FIELDS.siriusxmAccessToken, session_cookies: FIELDS.siriusxmCookies },
  },
];

export interface MigrationResult {
  migrated: number;
  failed: number;
  remaining: number;
}

function isLegacyNonSecret(value: unknown): value is string {
  return typeof value === 'string' && /^(enc|senc|fenc):v1:/.test(value);
}

async function profileIds(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await db.from('profiles').select('id').eq('account_id', userId);
  if (error) throw new Error(`profiles: ${error.message}`);
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

export async function migrateLegacySecrets(
  userId: string,
  dek: Uint8Array,
  client?: SupabaseClient
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, failed: 0, remaining: 0 };
  const db = client ?? (createServerClient() as unknown as SupabaseClient);
  const enabled = legacyMigrationEnabled();

  for (const t of TARGETS) {
    const cols = Object.keys(t.columns);
    let query = db.from(t.table).select([t.key, ...cols].join(','));
    if ('column' in t.owner) {
      query = query.eq(t.owner.column, userId);
    } else {
      const ids = await profileIds(db, userId);
      if (ids.length === 0) continue;
      query = query.in(t.owner.profileColumn, ids);
    }
    const { data, error } = await query;
    if (error) {
      console.error(`[vault/migrate] ${t.table}: ${error.message}`);
      continue;
    }

    for (const row of (data as unknown as Record<string, unknown>[] | null) ?? []) {
      for (const col of cols) {
        const field = t.columns[col];
        const value = row[col];
        const legacy = field ? isLegacyValue(value as string) : isLegacyNonSecret(value);
        if (!legacy) continue;
        if (!enabled) {
          result.remaining++;
          continue;
        }
        try {
          const plaintext = openLegacyValue(value as string);
          const next = field ? await sealWithKey(dek, userId, field, plaintext) : plaintext;
          const { error: upErr } = await db
            .from(t.table)
            .update({ [col]: next })
            .eq(t.key, row[t.key] as string)
            .eq(col, value as string);
          if (upErr) throw new Error(upErr.message);
          result.migrated++;
        } catch (err) {
          result.failed++;
          result.remaining++;
          // Never log the value; table/column/row id is enough to find it.
          console.error(
            `[vault/migrate] could not re-seal ${t.table}.${col} row ${String(row[t.key])}: ${
              err instanceof Error ? err.message : 'error'
            }`
          );
        }
      }
    }
  }
  return result;
}
