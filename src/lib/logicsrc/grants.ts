/**
 * Keys from logicsrc, through the house package @profullstack/key-grants.
 *
 * A member asks logicsrc (app.logicsrc.com) for keys by name instead of pasting
 * them; they approve there; their browser seals each value to the inbox public
 * key of their bittorrented key vault (sealer app "bittorrented", scope
 * "user_secrets", user id = their account id); logicsrc posts the sealed text to
 * our webhook, again on every rotation (grant.updated) and on grant.revoked.
 * This file is only the wiring:
 *
 *   recipientFor  the member's vault inbox (user_secret_vaults.seal)
 *   onKey         queue it in user_secret_inbox (inbox.ts), and apply it at once
 *                 when the member is unlocked right now
 *   onRevoke      drop what is waiting, clear credentials that grant put in place
 *   store         logicsrc_grant_requests / logicsrc_grants over Supabase
 *                 (nonces, per-request webhook secrets, grant ids: never a key)
 *
 * The request scope is the finance profile the member asked from: broker keys
 * belong to a profile, and the webhook only knows the account.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createKeyGrants,
  type GrantRequestRow,
  type GrantRow,
  type KeyGrants,
  type KeyGrantStore,
} from '@profullstack/key-grants';

import { connectBroker } from '@/lib/finance/brokers/service';
import { createServerClient } from '@/lib/supabase';
import { dataKeyFor, getVaultSeal, VAULT_APP, VAULT_SCOPE } from '@/lib/vault';
import { applyInbox, queueKey, revokeKey, type BrokerConnectionRow, type InboxDeps, type PendingRow } from './inbox';

/** Where "Get from logicsrc" lives, and where logicsrc sends people back to. */
export const KEYS_PAGE = '/settings?tab=vault';

// Non-literal reads: Next inlines `process.env.NAME` at build time.
const env = (name: string): string | undefined => process.env[name];

export function siteOrigin(): string {
  return (env('APP_ORIGIN') || env('NEXT_PUBLIC_APP_URL') || 'https://bittorrented.com').replace(/\/+$/, '');
}

function db(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

const fail = (what: string, error: { message: string } | null): void => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

/** KeyGrantStore over Supabase (service role); tables from 20261111120000_logicsrc_key_grants.sql. */
export function supabaseGrantStore(client: () => SupabaseClient = db): KeyGrantStore {
  return {
    async saveRequest(row: GrantRequestRow) {
      const { error } = await client().from('logicsrc_grant_requests').insert(row);
      fail('logicsrc_grant_requests', error);
    },
    async getRequest(nonce: string) {
      const { data, error } = await client().from('logicsrc_grant_requests').select('*').eq('nonce', nonce).maybeSingle();
      fail('logicsrc_grant_requests', error);
      return (data as GrantRequestRow | null) ?? null;
    },
    async requestsForUser(userId: string, limit: number) {
      const { data, error } = await client()
        .from('logicsrc_grant_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      fail('logicsrc_grant_requests', error);
      return (data as GrantRequestRow[] | null) ?? [];
    },
    async getGrant(grantId: string) {
      const { data, error } = await client().from('logicsrc_grants').select('*').eq('grant_id', grantId).maybeSingle();
      fail('logicsrc_grants', error);
      return (data as GrantRow | null) ?? null;
    },
    async saveGrant(row: GrantRow) {
      const { error } = await client().from('logicsrc_grants').upsert(row, { onConflict: 'grant_id' });
      fail('logicsrc_grants', error);
    },
  };
}

async function profileIdsOf(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client.from('profiles').select('id').eq('account_id', userId);
  fail('profiles', error);
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

/** The real inbox storage and domain writes. */
export function supabaseInboxDeps(client: () => SupabaseClient = db): InboxDeps {
  return {
    async savePending(row) {
      const { error } = await client()
        .from('user_secret_inbox')
        // created_at moves too: a rotation is the newest value for that key name.
        .upsert({ ...row, last_error: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'grant_id' });
      fail('user_secret_inbox', error);
    },
    async listPending(userId) {
      const { data, error } = await client()
        .from('user_secret_inbox')
        .select('id, user_id, grant_id, key_name, target, sealed, last_error, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      fail('user_secret_inbox', error);
      return (data as PendingRow[] | null) ?? [];
    },
    async deletePending(ids) {
      if (!ids.length) return;
      const { error } = await client().from('user_secret_inbox').delete().in('id', ids);
      fail('user_secret_inbox', error);
    },
    async deletePendingByGrant(userId, grantId) {
      const { error } = await client().from('user_secret_inbox').delete().eq('user_id', userId).eq('grant_id', grantId);
      fail('user_secret_inbox', error);
    },
    async markPending(ids, message) {
      if (!ids.length) return;
      const { error } = await client()
        .from('user_secret_inbox')
        .update({ last_error: message, updated_at: new Date().toISOString() })
        .in('id', ids);
      fail('user_secret_inbox', error);
    },
    getSeal: getVaultSeal,
    async profileOwner(profileId) {
      const { data, error } = await client().from('profiles').select('account_id').eq('id', profileId).maybeSingle();
      fail('profiles', error);
      return (data as { account_id: string } | null)?.account_id ?? null;
    },
    async getBrokerConnection(profileId, provider) {
      const { data, error } = await client()
        .from('finance_broker_connections')
        .select('id, encrypted_credentials, logicsrc_grant_ids, label')
        .eq('profile_id', profileId)
        .eq('provider', provider)
        .maybeSingle();
      fail('finance_broker_connections', error);
      return (data as BrokerConnectionRow | null) ?? null;
    },
    async connectBroker(profileId, provider, creds, label, grantIds) {
      const r = await connectBroker(profileId, provider, creds, label, grantIds);
      return { ok: r.ok, error: r.error };
    },
    async revokeBrokerByGrant(userId, grantId) {
      const c = client();
      const ids = await profileIdsOf(c, userId);
      if (!ids.length) return 0;
      const { data, error } = await c
        .from('finance_broker_connections')
        .update({
          encrypted_credentials: '',
          status: 'revoked',
          last_sync_error: 'Key revoked in logicsrc. Connect again to resume.',
          logicsrc_grant_ids: null,
          updated_at: new Date().toISOString(),
        })
        .in('profile_id', ids)
        .contains('logicsrc_grant_ids', [grantId])
        .select('id');
      fail('finance_broker_connections', error);
      return ((data as unknown[] | null) ?? []).length;
    },
  };
}

/** Keys waiting for an unlock, for the key vault page: names and reasons, never values. */
export async function listPendingKeys(
  userId: string,
  deps: InboxDeps = supabaseInboxDeps()
): Promise<{ keyName: string; createdAt: string; error: string | null }[]> {
  const rows = await deps.listPending(userId);
  return rows.map((r) => ({ keyName: r.key_name, createdAt: r.created_at, error: r.last_error ?? null }));
}

/**
 * Apply what is waiting while the server holds the member's data key. Never
 * throws: a key that cannot be applied stays queued with a reason.
 */
export async function applyPendingKeys(userId: string, dek: Uint8Array, deps: InboxDeps = supabaseInboxDeps()) {
  try {
    return await applyInbox(deps, userId, dek);
  } catch (err) {
    console.error(`[logicsrc] could not apply keys for ${userId}: ${err instanceof Error ? err.message : 'error'}`);
    return { applied: 0, waiting: 0, failed: 0 };
  }
}

export function bittorrentedKeyGrants({
  origin = siteOrigin(),
  store = supabaseGrantStore(),
  deps = supabaseInboxDeps(),
  now,
}: { origin?: string; store?: KeyGrantStore; deps?: InboxDeps; now?: () => number } = {}): KeyGrants {
  return createKeyGrants({
    appName: 'BitTorrented',
    origin,
    logicsrcUrl: env('LOGICSRC_URL') || undefined,
    store,
    now,
    describeKey: (name) =>
      name.startsWith('ALPACA_')
        ? 'Read-only Alpaca holdings in your BitTorrented finance profile; opens only while your key vault is unlocked'
        : 'Used by BitTorrented; opens only while your key vault is unlocked',
    recipientFor: async (userId) => {
      const seal = await deps.getSeal(userId);
      if (!seal?.inbox_public_key) return null;
      return { app: VAULT_APP, scope: VAULT_SCOPE, user_id: userId, inbox_public_key: seal.inbox_public_key };
    },
    onKey: async ({ userId, scope, keyName, sealed, grantId }) => {
      if (!(await queueKey(deps, { userId, grantId, keyName, scope, sealed }))) return;
      const dek = dataKeyFor(userId);
      if (dek) await applyPendingKeys(userId, dek, deps);
    },
    onRevoke: async ({ userId, grantId }) => {
      await revokeKey(deps, { userId, grantId });
    },
  });
}

let shared: KeyGrants | null = null;
export const keyGrants = (): KeyGrants => (shared ??= bittorrentedKeyGrants());
