/**
 * Keys from logicsrc, waiting for their owner's unlock.
 *
 * logicsrc delivers each key sealed to the inbox public key of the member's
 * vault (`sealed:v2:<inbox entry JSON>`). This server can store that but never
 * open it: only the data key opens the inbox private key. So a delivery is kept
 * in user_secret_inbox, and the next time the server holds the member's data key
 * (their unlock, or right away when the delivery lands while they are unlocked)
 * it is opened and written into the domain column through the same sealing path
 * a key typed into the app takes. Then the pending row is deleted.
 *
 * What maps where (only what maps without guessing):
 *
 *   ALPACA_API_KEY + ALPACA_API_SECRET
 *       -> finance_broker_connections (provider 'alpaca') of the finance profile
 *          the request was made from (request scope = profile id), as
 *          BrokerCredentials {apiKey, apiSecret, paper}. Both halves are needed
 *          for a new connection; a rotation of one half is combined with the
 *          other half already stored. `paper` follows Alpaca's key prefixes:
 *          paper keys start with "PK", live keys with "AK". The connection
 *          remembers the grant ids it came from (logicsrc_grant_ids), so a
 *          revoke clears only credentials logicsrc gave us, never ones the
 *          member typed in later.
 *
 * Seedbox tokens, mailbox passwords and VOD source logins are not offered: a
 * member can have several of each and a key name alone does not say which.
 */

import { openGrantedValue } from '@profullstack/key-grants';
import { isInboxEntry, type InboxEntry, type SealRecord } from '@profullstack/sealed-secrets';

import type { BrokerCredentials } from '@/lib/finance/brokers/types';
import { FIELDS, isSealedValue, openWithKey, sealer } from '@/lib/vault';

export const INBOX_PREFIX = 'sealed:v2:';
export const ALPACA_API_KEY = 'ALPACA_API_KEY';
export const ALPACA_API_SECRET = 'ALPACA_API_SECRET';
/** Every key name bittorrented asks logicsrc for. */
export const SUPPORTED_KEYS: readonly string[] = [ALPACA_API_KEY, ALPACA_API_SECRET];

export interface PendingRow {
  id: string;
  user_id: string;
  grant_id: string;
  key_name: string;
  target: string | null;
  sealed: string;
  last_error?: string | null;
  created_at: string;
}

export interface BrokerConnectionRow {
  id: string;
  encrypted_credentials: string | null;
  logicsrc_grant_ids: string[] | null;
  label: string | null;
}

/** Storage and domain writes, injected so the flow is testable without a database. */
export interface InboxDeps {
  savePending(row: { user_id: string; grant_id: string; key_name: string; target: string | null; sealed: string }): Promise<void>;
  listPending(userId: string): Promise<PendingRow[]>;
  deletePending(ids: string[]): Promise<void>;
  deletePendingByGrant(userId: string, grantId: string): Promise<void>;
  markPending(ids: string[], error: string): Promise<void>;
  getSeal(userId: string): Promise<SealRecord | null>;
  profileOwner(profileId: string): Promise<string | null>;
  getBrokerConnection(profileId: string, provider: string): Promise<BrokerConnectionRow | null>;
  /** Verify, seal (needs the owner unlocked) and upsert, recording the grant ids. */
  connectBroker(
    profileId: string,
    provider: string,
    creds: BrokerCredentials,
    label: string | null,
    grantIds: string[]
  ): Promise<{ ok: boolean; error?: string }>;
  /** Clear broker credentials that came from this grant. Returns how many. */
  revokeBrokerByGrant(userId: string, grantId: string): Promise<number>;
}

export interface ApplyResult {
  applied: number;
  waiting: number;
  failed: number;
}

/** Parse `sealed:v2:<entry JSON>`; null when it is not one. */
export function parseInboxEntry(sealed: string): InboxEntry | null {
  if (typeof sealed !== 'string' || !sealed.startsWith(INBOX_PREFIX)) return null;
  try {
    const entry: unknown = JSON.parse(sealed.slice(INBOX_PREFIX.length));
    return isInboxEntry(entry) ? entry : null;
  } catch {
    return null;
  }
}

/** Queue a delivered key. A rotation replaces the value still waiting for that grant. */
export async function queueKey(
  deps: InboxDeps,
  e: { userId: string; grantId: string; keyName: string; scope: string | null; sealed: string }
): Promise<boolean> {
  if (!SUPPORTED_KEYS.includes(e.keyName)) return false;
  if (!parseInboxEntry(e.sealed)) throw new Error('not an inbox entry');
  await deps.savePending({ user_id: e.userId, grant_id: e.grantId, key_name: e.keyName, target: e.scope, sealed: e.sealed });
  return true;
}

/** A revoke: drop what is still waiting, and clear what that grant put in place. */
export async function revokeKey(deps: InboxDeps, e: { userId: string; grantId: string }): Promise<void> {
  await deps.deletePendingByGrant(e.userId, e.grantId);
  await deps.revokeBrokerByGrant(e.userId, e.grantId);
}

interface Opened {
  row: PendingRow;
  value: string;
}

const newest = (list: Opened[]): Opened | undefined =>
  [...list].sort((a, b) => b.row.created_at.localeCompare(a.row.created_at))[0];

/**
 * Open every pending key with the data key and write it where it belongs.
 * Values live only in this call; nothing is logged but row ids and reasons.
 */
export async function applyInbox(deps: InboxDeps, userId: string, dek: Uint8Array): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, waiting: 0, failed: 0 };
  const rows = await deps.listPending(userId);
  if (rows.length === 0) return result;
  const seal = await deps.getSeal(userId);
  if (!seal) return { ...result, waiting: rows.length };

  const byTarget = new Map<string, Opened[]>();
  for (const row of rows) {
    // Only the granted key's own field: a delivery could carry extra fields,
    // and applying the whole patch would let it write keys nobody granted.
    let value: string | null = null;
    if (parseInboxEntry(row.sealed)) {
      try {
        value = await openGrantedValue(sealer, dek, seal, userId, row.sealed, row.key_name);
      } catch {
        value = null;
      }
    }
    if (!value) {
      result.failed++;
      await deps.markPending([row.id], 'This key was sealed to a different vault. Use Get from logicsrc again.');
      continue;
    }
    const target = row.target ?? '';
    byTarget.set(target, [...(byTarget.get(target) ?? []), { row, value }]);
  }

  for (const [profileId, opened] of byTarget) {
    const ids = opened.map((o) => o.row.id);
    if (!profileId || (await deps.profileOwner(profileId)) !== userId) {
      result.failed += ids.length;
      await deps.markPending(ids, 'The profile these keys were requested for is gone.');
      continue;
    }
    const key = newest(opened.filter((o) => o.row.key_name === ALPACA_API_KEY));
    const secret = newest(opened.filter((o) => o.row.key_name === ALPACA_API_SECRET));

    const existing = await deps.getBrokerConnection(profileId, 'alpaca');
    let stored: BrokerCredentials | null = null;
    if ((!key || !secret) && isSealedValue(existing?.encrypted_credentials)) {
      try {
        stored = JSON.parse(
          await openWithKey(dek, userId, FIELDS.brokerCredentials, existing!.encrypted_credentials!)
        ) as BrokerCredentials;
      } catch {
        stored = null;
      }
    }
    const apiKey = key?.value ?? stored?.apiKey;
    const apiSecret = secret?.value ?? stored?.apiSecret;
    if (!apiKey || !apiSecret) {
      result.waiting += ids.length; // the other half has not arrived yet
      continue;
    }
    const paper = key ? apiKey.startsWith('PK') : (stored?.paper ?? apiKey.startsWith('PK'));
    const kept = key && secret ? [] : (existing?.logicsrc_grant_ids ?? []);
    const grantIds = [...new Set([...kept, ...(key ? [key.row.grant_id] : []), ...(secret ? [secret.row.grant_id] : [])])];

    const res = await deps.connectBroker(
      profileId,
      'alpaca',
      { apiKey, apiSecret, paper },
      existing?.label ?? 'From logicsrc',
      grantIds
    );
    if (res.ok) {
      result.applied += ids.length;
      await deps.deletePending(ids);
    } else {
      result.failed += ids.length;
      await deps.markPending(ids, res.error ?? 'Alpaca did not accept these keys.');
    }
  }
  return result;
}
