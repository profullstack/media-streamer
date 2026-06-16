/**
 * Finance — broker connection + holdings service (server-side, service-role).
 *
 * Stores encrypted credentials, syncs read-only holdings, and never returns
 * secrets to callers (PRD §3.4, §8). Disconnect purges holdings (FK cascade).
 */

import { getServerClient } from '@/lib/supabase';
import { getBrokerProvider, type BrokerCredentials, type BrokerSnapshot } from './index';
import { encryptJson, decryptJson } from './crypto';

const CONNECTIONS_TABLE = 'finance_broker_connections';
const HOLDINGS_TABLE = 'finance_holdings';

/** Client-safe connection view (NO credentials). */
export interface ConnectionView {
  id: string;
  provider: string;
  scope: string;
  status: 'active' | 'error' | 'revoked';
  label: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface HoldingView {
  symbol: string;
  quantity: number;
  avgCost: number | null;
  marketValue: number | null;
  asOf: string;
}

export async function listConnections(profileId: string): Promise<ConnectionView[]> {
  const { data } = await getServerClient()
    .from(CONNECTIONS_TABLE)
    .select('id, provider, scope, status, label, last_sync_at, last_sync_error')
    .eq('profile_id', profileId);

  return (data ?? []).map((r) => ({
    id: r.id,
    provider: r.provider,
    scope: r.scope,
    status: r.status,
    label: r.label,
    lastSyncAt: r.last_sync_at,
    lastSyncError: r.last_sync_error,
  }));
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
  connection?: ConnectionView;
}

/**
 * Verify credentials (read-only), store them encrypted, and run an initial
 * holdings sync. Always requests/stores read-only scope only.
 */
export async function connectBroker(
  profileId: string,
  providerId: string,
  creds: BrokerCredentials,
  label: string | null,
): Promise<ConnectResult> {
  const provider = getBrokerProvider(providerId);
  if (!provider) return { ok: false, error: 'unsupported provider' };

  const valid = await provider.verify(creds);
  if (!valid) return { ok: false, error: 'Could not verify those credentials (read-only access).' };

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from(CONNECTIONS_TABLE)
    .upsert(
      {
        profile_id: profileId,
        provider: providerId,
        encrypted_credentials: encryptJson(creds),
        scope: 'read-only',
        status: 'active',
        label,
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,provider' },
    )
    .select('id, provider, scope, status, label, last_sync_at, last_sync_error')
    .single();

  if (error || !data) {
    return { ok: false, error: 'Failed to save connection' };
  }

  // Initial sync (best-effort — connection still succeeds if sync hiccups).
  await syncHoldings(profileId, data.id).catch((e) => {
    console.error('[finance/broker] initial sync failed:', e);
  });

  const refreshed = (await listConnections(profileId)).find((c) => c.id === data.id);
  return { ok: true, connection: refreshed ?? {
    id: data.id, provider: data.provider, scope: data.scope, status: data.status,
    label: data.label, lastSyncAt: data.last_sync_at, lastSyncError: data.last_sync_error,
  } };
}

/** Disconnect: delete the connection (holdings cascade-delete via FK). */
export async function disconnectBroker(profileId: string, connectionId: string): Promise<boolean> {
  const { error } = await getServerClient()
    .from(CONNECTIONS_TABLE)
    .delete()
    .eq('profile_id', profileId)
    .eq('id', connectionId);
  return !error;
}

/** Fetch a read-only snapshot and reconcile finance_holdings for one connection. */
export async function syncHoldings(profileId: string, connectionId: string): Promise<BrokerSnapshot | null> {
  const supabase = getServerClient();

  const { data: conn } = await supabase
    .from(CONNECTIONS_TABLE)
    .select('id, provider, encrypted_credentials')
    .eq('profile_id', profileId)
    .eq('id', connectionId)
    .single();

  if (!conn) return null;

  const provider = getBrokerProvider(conn.provider);
  if (!provider) return null;

  try {
    const creds = decryptJson<BrokerCredentials>(conn.encrypted_credentials);
    const snapshot = await provider.fetchSnapshot(creds);
    const asOf = new Date().toISOString();

    if (snapshot.positions.length > 0) {
      await supabase.from(HOLDINGS_TABLE).upsert(
        snapshot.positions.map((p) => ({
          profile_id: profileId,
          connection_id: connectionId,
          symbol: p.symbol,
          quantity: p.quantity,
          avg_cost: p.avgCost,
          market_value: p.marketValue,
          as_of: asOf,
        })),
        { onConflict: 'connection_id,symbol' },
      );
    }

    // Remove holdings no longer present in the snapshot.
    const symbols = snapshot.positions.map((p) => p.symbol);
    let staleQuery = supabase.from(HOLDINGS_TABLE).delete().eq('connection_id', connectionId);
    if (symbols.length > 0) {
      staleQuery = staleQuery.not('symbol', 'in', `(${symbols.map((s) => `"${s}"`).join(',')})`);
    }
    await staleQuery;

    await supabase
      .from(CONNECTIONS_TABLE)
      .update({ status: 'active', last_sync_at: asOf, last_sync_error: null })
      .eq('id', connectionId);

    return snapshot;
  } catch (error) {
    await supabase
      .from(CONNECTIONS_TABLE)
      .update({ status: 'error', last_sync_error: error instanceof Error ? error.message : 'sync failed' })
      .eq('id', connectionId);
    throw error;
  }
}

export async function getHoldings(profileId: string, symbol?: string): Promise<HoldingView[]> {
  let query = getServerClient()
    .from(HOLDINGS_TABLE)
    .select('symbol, quantity, avg_cost, market_value, as_of')
    .eq('profile_id', profileId);

  if (symbol) query = query.eq('symbol', symbol);

  const { data } = await query;
  return (data ?? []).map((h) => ({
    symbol: h.symbol,
    quantity: Number(h.quantity),
    avgCost: h.avg_cost === null ? null : Number(h.avg_cost),
    marketValue: h.market_value === null ? null : Number(h.market_value),
    asOf: h.as_of,
  }));
}
