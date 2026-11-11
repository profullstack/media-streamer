import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SealRecord } from '@profullstack/sealed-secrets';
import { memoryStore } from '@profullstack/key-grants';

vi.mock('@/lib/supabase', () => ({ createServerClient: () => ({}), getServerClient: () => ({}) }));
vi.mock('@/lib/finance/brokers/service', () => ({ connectBroker: vi.fn() }));

import { FIELDS, openWithKey, sealValue, sealer, unlockStore } from '@/lib/vault';
import { resetUnlockStoreForTests } from '@/lib/vault/unlock';
import type { BrokerCredentials } from '@/lib/finance/brokers/types';
import { applyPendingKeys, bittorrentedKeyGrants } from './grants';
import { ALPACA_API_KEY, ALPACA_API_SECRET, type BrokerConnectionRow, type InboxDeps, type PendingRow } from './inbox';

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const PROFILE = '33333333-3333-3333-3333-333333333333';
const ORIGIN = 'https://bittorrented.test';

let seal: SealRecord;
let dek: Uint8Array;
let otherSeal: SealRecord;

beforeAll(async () => {
  ({ seal, dek } = await sealer.createSeal('correct horse battery staple', USER));
  ({ seal: otherSeal } = await sealer.createSeal('another long passphrase', OTHER));
});

afterEach(() => resetUnlockStoreForTests());

/** In-memory user_secret_inbox + finance_broker_connections, with the real sealing path. */
function memoryDeps() {
  const pending = new Map<string, PendingRow>();
  const connections = new Map<string, BrokerConnectionRow & { status: string }>();
  const verified: BrokerCredentials[] = [];
  let tick = 0;
  const deps: InboxDeps = {
    async savePending(row) {
      const existing = [...pending.values()].find((r) => r.grant_id === row.grant_id);
      const id = existing?.id ?? randomUUID();
      pending.set(id, { ...row, id, last_error: null, created_at: new Date(Date.UTC(2026, 10, 11, 0, 0, tick++)).toISOString() });
    },
    async listPending(userId) {
      return [...pending.values()].filter((r) => r.user_id === userId);
    },
    async deletePending(ids) {
      ids.forEach((id) => pending.delete(id));
    },
    async deletePendingByGrant(userId, grantId) {
      for (const [id, r] of pending) if (r.user_id === userId && r.grant_id === grantId) pending.delete(id);
    },
    async markPending(ids, error) {
      ids.forEach((id) => pending.set(id, { ...pending.get(id)!, last_error: error }));
    },
    async getSeal(userId) {
      return userId === USER ? seal : userId === OTHER ? otherSeal : null;
    },
    async profileOwner(profileId) {
      return profileId === PROFILE ? USER : null;
    },
    async getBrokerConnection(profileId) {
      return connections.get(profileId) ?? null;
    },
    // Same as the service: seal under the owner's vault (throws while locked), upsert.
    async connectBroker(profileId, _provider, creds, label, grantIds) {
      verified.push(creds);
      const sealed = await sealValue(USER, FIELDS.brokerCredentials, JSON.stringify(creds));
      connections.set(profileId, {
        id: 'conn-1',
        encrypted_credentials: sealed,
        logicsrc_grant_ids: grantIds.length ? grantIds : null,
        label,
        status: 'active',
      });
      return { ok: true };
    },
    async revokeBrokerByGrant(_userId, grantId) {
      let n = 0;
      for (const [k, c] of connections) {
        if (c.logicsrc_grant_ids?.includes(grantId)) {
          connections.set(k, { ...c, encrypted_credentials: '', logicsrc_grant_ids: null, status: 'revoked' });
          n++;
        }
      }
      return n;
    },
  };
  return { deps, pending, connections, verified };
}

function sign(secret: string, body: string, ts = Math.floor(Date.now() / 1000)) {
  const id = `msg_${randomUUID()}`;
  const sig = createHmac('sha256', Buffer.from(secret, 'utf8')).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sig}` };
}

/** What logicsrc does in the member's browser, then posts. */
async function deliver(
  kg: ReturnType<typeof bittorrentedKeyGrants>,
  secret: string,
  e: { type?: string; grantId: string; keyName: string; value?: string; inbox?: string; userId?: string }
) {
  const userId = e.userId ?? USER;
  const sealed =
    e.value === undefined
      ? undefined
      : `sealed:v2:${JSON.stringify(await sealer.sealToInbox(e.inbox ?? seal.inbox_public_key, { [e.keyName]: e.value }, userId))}`;
  const body = JSON.stringify({
    type: e.type ?? 'grant.delivered',
    grant_id: e.grantId,
    key_name: e.keyName,
    recipient_user_id: USER,
    sealed,
  });
  return kg.webhook(sign(secret, body), body);
}

// The deps each setup() built, by key-grants instance (for calling applyPendingKeys like the unlock route).
const depsOf = new WeakMap<object, InboxDeps>();

async function setup() {
  const mem = memoryDeps();
  const kg = bittorrentedKeyGrants({ origin: ORIGIN, store: memoryStore(), deps: mem.deps });
  depsOf.set(kg, mem.deps);
  const to = await kg.start({ userId: USER, keys: [ALPACA_API_KEY, ALPACA_API_SECRET], next: '/settings?tab=vault', scope: PROFILE });
  const nonce = new URL(to).searchParams.get('nonce')!;
  const manifest = (await kg.manifest(nonce))!;
  return { ...mem, kg, to, nonce, manifest };
}

describe('logicsrc key grants on bittorrented', () => {
  it('serves a manifest that names the vault inbox, and 404s an unknown nonce', async () => {
    const { to, manifest, kg } = await setup();
    expect(to.startsWith('https://app.logicsrc.com/grant?origin=https%3A%2F%2Fbittorrented.test&nonce=')).toBe(true);
    expect(manifest.recipient).toEqual({
      format: 'sealed-secrets/inbox-v2',
      app: 'bittorrented',
      scope: 'user_secrets',
      user_id: USER,
      inbox_public_key: seal.inbox_public_key,
    });
    expect(manifest.keys.map((k) => k.name)).toEqual([ALPACA_API_KEY, ALPACA_API_SECRET]);
    expect(manifest.webhook_url).toBe(`${ORIGIN}/api/v1/logicsrc/webhook`);
    expect(manifest.return_url).toBe(`${ORIGIN}/settings?tab=vault&logicsrc=granted`);

    const res = await kg.manifestResponse('unknownnonce123456789');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown or expired request' });
  });

  it('refuses a member without a vault and an unsigned delivery', async () => {
    const { kg } = await setup();
    const r = await kg.startResponse({ userId: '44444444-4444-4444-4444-444444444444', keys: ALPACA_API_KEY, errorPath: '/settings?tab=vault' });
    expect(r.headers.get('location')).toBe('/settings?tab=vault&logicsrc=needs_vault');

    const body = JSON.stringify({ type: 'grant.delivered', grant_id: 'g1', key_name: ALPACA_API_KEY, recipient_user_id: USER, sealed: 'sealed:v2:{}' });
    expect((await kg.webhook({}, body)).status).toBe(401);
    expect((await kg.webhook(sign('not-the-secret', body), body)).status).toBe(401);
  });

  it('queues a signed delivery while locked; only the owner\'s data key opens it', async () => {
    const { kg, manifest, pending, connections } = await setup();
    const r = await deliver(kg, manifest.webhook_secret, { grantId: 'g-key', keyName: ALPACA_API_KEY, value: 'PKTESTKEY' });
    expect(r).toEqual({ status: 200, body: { ok: true, key: ALPACA_API_KEY } });
    expect(connections.size).toBe(0);
    const [row] = [...pending.values()];
    expect(row).toMatchObject({ user_id: USER, grant_id: 'g-key', key_name: ALPACA_API_KEY, target: PROFILE });
    expect(row.sealed).not.toContain('PKTESTKEY');
    const entry = JSON.parse(row.sealed.slice('sealed:v2:'.length));
    const { patch } = await sealer.openInbox(dek, seal, [entry], USER);
    expect(patch).toEqual({ [ALPACA_API_KEY]: 'PKTESTKEY' });
  });

  it('writes the broker credentials on unlock, then follows a rotation and a revoke', async () => {
    const { kg, manifest, pending, connections, verified } = await setup();
    await deliver(kg, manifest.webhook_secret, { grantId: 'g-key', keyName: ALPACA_API_KEY, value: 'PKTESTKEY' });

    // One half is not a connection: it waits for the other.
    unlockStore().unlock(USER, dek, 3600);
    expect(await applyPendingKeys(USER, dek, depsOf.get(kg)!)).toEqual({ applied: 0, waiting: 1, failed: 0 });
    resetUnlockStoreForTests();

    await deliver(kg, manifest.webhook_secret, { grantId: 'g-secret', keyName: ALPACA_API_SECRET, value: 'secret-one' });
    expect(pending.size).toBe(2);
    expect(connections.size).toBe(0);

    // The unlock route: data key in the store, then the pending keys are applied.
    unlockStore().unlock(USER, dek, 3600);
    expect(await applyPendingKeys(USER, dek, depsOf.get(kg)!)).toEqual({ applied: 2, waiting: 0, failed: 0 });
    expect(pending.size).toBe(0);
    const conn = connections.get(PROFILE)!;
    expect(conn.logicsrc_grant_ids?.sort()).toEqual(['g-key', 'g-secret']);
    expect(conn.encrypted_credentials!.startsWith('ss2:')).toBe(true);
    expect(JSON.parse(await openWithKey(dek, USER, FIELDS.brokerCredentials, conn.encrypted_credentials!))).toEqual({
      apiKey: 'PKTESTKEY',
      apiSecret: 'secret-one',
      paper: true,
    });

    // Rotation while unlocked: applied at once, combined with the stored key.
    const rot = await deliver(kg, manifest.webhook_secret, { type: 'grant.updated', grantId: 'g-secret', keyName: ALPACA_API_SECRET, value: 'secret-two' });
    expect(rot.status).toBe(200);
    expect(pending.size).toBe(0);
    expect(verified.at(-1)).toEqual({ apiKey: 'PKTESTKEY', apiSecret: 'secret-two', paper: true });
    expect(connections.get(PROFILE)!.logicsrc_grant_ids?.sort()).toEqual(['g-key', 'g-secret']);

    // Revoke: the credentials that grant put in place are cleared.
    const rev = await deliver(kg, manifest.webhook_secret, { type: 'grant.revoked', grantId: 'g-key', keyName: ALPACA_API_KEY });
    expect(rev.status).toBe(200);
    expect(connections.get(PROFILE)).toMatchObject({ encrypted_credentials: '', status: 'revoked', logicsrc_grant_ids: null });
  });

  it('a revoke leaves credentials the member typed in alone, and drops a waiting key', async () => {
    const { kg, manifest, pending, connections } = await setup();
    unlockStore().unlock(USER, dek, 3600);
    connections.set(PROFILE, {
      id: 'conn-1',
      encrypted_credentials: await sealValue(USER, FIELDS.brokerCredentials, JSON.stringify({ apiKey: 'AKMANUAL', apiSecret: 's' })),
      logicsrc_grant_ids: null,
      label: 'Live',
      status: 'active',
    });
    resetUnlockStoreForTests();
    await deliver(kg, manifest.webhook_secret, { grantId: 'g-key', keyName: ALPACA_API_KEY, value: 'PKTESTKEY' });
    expect(pending.size).toBe(1);
    await deliver(kg, manifest.webhook_secret, { type: 'grant.revoked', grantId: 'g-key', keyName: ALPACA_API_KEY });
    expect(pending.size).toBe(0);
    expect(connections.get(PROFILE)!.encrypted_credentials!.startsWith('ss2:')).toBe(true);
    expect(connections.get(PROFILE)!.status).toBe('active');
  });

  it('applies only the granted field of a delivery that carries extra fields', async () => {
    const { kg, manifest, pending, verified } = await setup();
    const extra = async (grantId: string, keyName: string, value: string) => {
      const entry = await sealer.sealToInbox(seal.inbox_public_key, { [keyName]: value, ALPACA_API_SECRET: 'smuggled' }, USER);
      const body = JSON.stringify({ type: 'grant.delivered', grant_id: grantId, key_name: keyName, recipient_user_id: USER, sealed: `sealed:v2:${JSON.stringify(entry)}` });
      return kg.webhook(sign(manifest.webhook_secret, body), body);
    };
    await extra('g-key', ALPACA_API_KEY, 'PKTESTKEY');
    unlockStore().unlock(USER, dek, 3600);
    // The smuggled secret is not used: the key alone still waits for its own secret grant.
    expect(await applyPendingKeys(USER, dek, depsOf.get(kg)!)).toEqual({ applied: 0, waiting: 1, failed: 0 });
    expect(verified).toHaveLength(0);
    expect(pending.size).toBe(1);
  });

  it('keeps a key sealed to another vault queued with a reason', async () => {
    const { kg, manifest, pending, connections } = await setup();
    await deliver(kg, manifest.webhook_secret, { grantId: 'g-key', keyName: ALPACA_API_KEY, value: 'PKX', inbox: otherSeal.inbox_public_key });
    unlockStore().unlock(USER, dek, 3600);
    expect(await applyPendingKeys(USER, dek, depsOf.get(kg)!)).toEqual({ applied: 0, waiting: 0, failed: 1 });
    expect([...pending.values()][0].last_error).toMatch(/different vault/);
    expect(connections.size).toBe(0);
  });
});
