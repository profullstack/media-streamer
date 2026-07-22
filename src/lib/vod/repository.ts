/**
 * VOD data access (service-role Supabase). The vod_* tables aren't in the
 * generated Database type yet, so we use an untyped client. All access is
 * server-side via the service role; RLS denies everyone else.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import type { ProviderSourceRow } from './config';
import type {
  AccessMode,
  CatalogItem,
  GrantKind,
  GrantStatus,
  ProviderStatus,
  SourceAuthKind,
  SourceKind,
  VodGrant,
  VodProvider,
  VodTitle,
} from './types';

function db(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toProvider(r: Row): VodProvider {
  return {
    id: String(r.id),
    slug: String(r.slug),
    ownerAccountId: String(r.owner_account_id),
    title: String(r.title ?? ''),
    description: (r.description as string | null) ?? null,
    sourceKind: r.source_kind as SourceKind,
    sourceUrl: (r.source_url as string | null) ?? null,
    sourceUsername: (r.source_username as string | null) ?? null,
    sourceAuth: (r.source_auth as SourceAuthKind) ?? 'none',
    sourceHeaderName: (r.source_header_name as string | null) ?? null,
    hasPassword: Boolean(r.source_password_encrypted),
    hasToken: Boolean(r.source_token_encrypted),
    weeklyPriceUsd: r.weekly_price_usd == null ? null : Number(r.weekly_price_usd),
    perTitlePriceUsd: r.per_title_price_usd == null ? null : Number(r.per_title_price_usd),
    passWindowMinutes: Number(r.pass_window_minutes ?? 10080),
    defaultAccessMode: (r.default_access_mode as AccessMode) ?? 'stream',
    payoutWalletAddress: (r.payout_wallet_address as string | null) ?? null,
    payoutBlockchain: (r.payout_blockchain as string | null) ?? null,
    status: r.status as ProviderStatus,
    catalogCount: Number(r.catalog_count ?? 0),
    lastSyncedAt: (r.last_synced_at as string | null) ?? null,
    sessionCount: Number(r.session_count ?? 0),
    earningsUsd: Number(r.earnings_usd ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function toTitle(r: Row): VodTitle {
  return {
    id: String(r.id),
    providerId: String(r.provider_id),
    externalId: String(r.external_id),
    title: String(r.title ?? ''),
    kind: (r.kind as VodTitle['kind']) ?? 'other',
    posterUrl: (r.poster_url as string | null) ?? null,
    plot: (r.plot as string | null) ?? null,
    rating: (r.rating as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    streamRef: String(r.stream_ref),
    extension: (r.extension as string | null) ?? null,
    accessMode: (r.access_mode as AccessMode | null) ?? null,
    priceUsd: r.price_usd == null ? null : Number(r.price_usd),
    createdAt: String(r.created_at),
  };
}

function toGrant(r: Row): VodGrant {
  return {
    id: String(r.id),
    providerId: String(r.provider_id),
    grantKind: r.grant_kind as GrantKind,
    titleId: (r.title_id as string | null) ?? null,
    accessMode: (r.access_mode as AccessMode) ?? 'stream',
    coinpayportalPaymentId: (r.coinpayportal_payment_id as string | null) ?? null,
    viewerKeyHash: String(r.viewer_key_hash),
    status: r.status as GrantStatus,
    amountUsd: Number(r.amount_usd ?? 0),
    paidAt: (r.paid_at as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface ProviderColumns {
  slug: string;
  owner_account_id: string;
  title: string;
  description: string | null;
  source_kind: SourceKind;
  source_url: string | null;
  source_username: string | null;
  source_password_encrypted: string | null;
  source_auth: SourceAuthKind;
  source_token_encrypted: string | null;
  source_header_name: string | null;
  weekly_price_usd: number | null;
  per_title_price_usd: number | null;
  pass_window_minutes: number;
  default_access_mode: AccessMode;
  payout_wallet_address: string | null;
  payout_blockchain: string | null;
}

export async function insertProvider(cols: ProviderColumns): Promise<VodProvider> {
  const { data, error } = await db().from('vod_providers').insert(cols).select('*').single();
  if (error) throw new Error(`Failed to create provider: ${error.message}`);
  return toProvider(data as Row);
}

export async function listProvidersByOwner(ownerId: string): Promise<VodProvider[]> {
  const { data, error } = await db()
    .from('vod_providers')
    .select('*')
    .eq('owner_account_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list providers: ${error.message}`);
  return (data as Row[]).map(toProvider);
}

export async function getProviderByIdForOwner(id: string, ownerId: string): Promise<VodProvider | null> {
  const { data, error } = await db()
    .from('vod_providers')
    .select('*')
    .eq('id', id)
    .eq('owner_account_id', ownerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load provider: ${error.message}`);
  return data ? toProvider(data as Row) : null;
}

export async function getProviderById(id: string): Promise<VodProvider | null> {
  const { data, error } = await db().from('vod_providers').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load provider: ${error.message}`);
  return data ? toProvider(data as Row) : null;
}

export async function getProviderBySlug(slug: string): Promise<VodProvider | null> {
  const { data, error } = await db().from('vod_providers').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`Failed to load provider: ${error.message}`);
  return data ? toProvider(data as Row) : null;
}

/** Raw encrypted source columns for a provider (for resolving the source config). */
export async function getProviderSourceRow(id: string): Promise<ProviderSourceRow | null> {
  const { data, error } = await db()
    .from('vod_providers')
    .select('source_kind, source_url, source_username, source_password_encrypted, source_auth, source_token_encrypted, source_header_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load provider source: ${error.message}`);
  return (data as ProviderSourceRow | null) ?? null;
}

export async function updateProvider(
  id: string,
  ownerId: string,
  patch: Record<string, unknown>
): Promise<VodProvider | null> {
  if (Object.keys(patch).length === 0) return getProviderByIdForOwner(id, ownerId);
  const { data, error } = await db()
    .from('vod_providers')
    .update(patch)
    .eq('id', id)
    .eq('owner_account_id', ownerId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update provider: ${error.message}`);
  return data ? toProvider(data as Row) : null;
}

export async function deleteProvider(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('vod_providers')
    .delete()
    .eq('id', id)
    .eq('owner_account_id', ownerId)
    .select('id');
  if (error) throw new Error(`Failed to delete provider: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

export async function setProviderSyncResult(id: string, catalogCount: number): Promise<void> {
  const { error } = await db()
    .from('vod_providers')
    .update({ catalog_count: catalogCount, last_synced_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to record sync: ${error.message}`);
}

export async function incrementProviderEarnings(id: string, amountUsd: number): Promise<void> {
  const supabase = db();
  const { data, error } = await supabase
    .from('vod_providers')
    .select('session_count, earnings_usd')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to read provider stats: ${error.message}`);
  if (!data) return;
  const r = data as Row;
  await supabase
    .from('vod_providers')
    .update({
      session_count: Number(r.session_count ?? 0) + 1,
      earnings_usd: Number(r.earnings_usd ?? 0) + amountUsd,
    })
    .eq('id', id);
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

export async function upsertTitles(providerId: string, items: CatalogItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((it) => ({
    provider_id: providerId,
    external_id: it.externalId,
    title: it.title,
    kind: it.kind,
    poster_url: it.posterUrl ?? null,
    plot: it.plot ?? null,
    rating: it.rating ?? null,
    category: it.category ?? null,
    stream_ref: it.streamRef,
    extension: it.extension ?? null,
  }));
  // Chunk to keep payloads reasonable.
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db()
      .from('vod_titles')
      .upsert(chunk, { onConflict: 'provider_id,external_id' });
    if (error) throw new Error(`Failed to save titles: ${error.message}`);
    written += chunk.length;
  }
  return written;
}

export async function countTitles(providerId: string): Promise<number> {
  const { count, error } = await db()
    .from('vod_titles')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', providerId);
  if (error) throw new Error(`Failed to count titles: ${error.message}`);
  return count ?? 0;
}

export async function listTitles(
  providerId: string,
  opts: { q?: string; limit: number; offset: number }
): Promise<{ titles: VodTitle[]; total: number }> {
  let query = db()
    .from('vod_titles')
    .select('*', { count: 'exact' })
    .eq('provider_id', providerId);
  if (opts.q) query = query.ilike('title', `%${opts.q}%`);
  const { data, error, count } = await query
    .order('title', { ascending: true })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (error) throw new Error(`Failed to list titles: ${error.message}`);
  return { titles: (data as Row[]).map(toTitle), total: count ?? 0 };
}

export async function getTitleForProvider(id: string, providerId: string): Promise<VodTitle | null> {
  const { data, error } = await db()
    .from('vod_titles')
    .select('*')
    .eq('id', id)
    .eq('provider_id', providerId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load title: ${error.message}`);
  return data ? toTitle(data as Row) : null;
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export async function insertPendingGrant(record: {
  providerId: string;
  grantKind: GrantKind;
  titleId: string | null;
  accessMode: AccessMode;
  viewerKeyHash: string;
  amountUsd: number;
}): Promise<VodGrant> {
  const { data, error } = await db()
    .from('vod_grants')
    .insert({
      provider_id: record.providerId,
      grant_kind: record.grantKind,
      title_id: record.titleId,
      access_mode: record.accessMode,
      viewer_key_hash: record.viewerKeyHash,
      amount_usd: record.amountUsd,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create grant: ${error.message}`);
  return toGrant(data as Row);
}

export async function setGrantPaymentId(grantId: string, paymentId: string): Promise<void> {
  const { error } = await db()
    .from('vod_grants')
    .update({ coinpayportal_payment_id: paymentId })
    .eq('id', grantId);
  if (error) throw new Error(`Failed to attach payment: ${error.message}`);
}

export async function getGrantById(id: string): Promise<VodGrant | null> {
  const { data, error } = await db().from('vod_grants').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load grant: ${error.message}`);
  return data ? toGrant(data as Row) : null;
}

export async function getGrantByPaymentId(paymentId: string): Promise<VodGrant | null> {
  const { data, error } = await db()
    .from('vod_grants')
    .select('*')
    .eq('coinpayportal_payment_id', paymentId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load grant: ${error.message}`);
  return data ? toGrant(data as Row) : null;
}

export async function markGrantPaid(
  grantId: string,
  fields: {
    expiresAt: string | null;
    amountCrypto?: string | null;
    cryptoCurrency?: string | null;
    blockchain?: string | null;
    txHash?: string | null;
    webhookEventType?: string | null;
  }
): Promise<void> {
  const { error } = await db()
    .from('vod_grants')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      expires_at: fields.expiresAt,
      amount_crypto: fields.amountCrypto ?? null,
      crypto_currency: fields.cryptoCurrency ?? null,
      blockchain: fields.blockchain ?? null,
      tx_hash: fields.txHash ?? null,
      webhook_event_type: fields.webhookEventType ?? null,
      webhook_received_at: new Date().toISOString(),
    })
    .eq('id', grantId);
  if (error) throw new Error(`Failed to mark grant paid: ${error.message}`);
}

export async function markGrantStatus(grantId: string, status: GrantStatus): Promise<void> {
  const { error } = await db()
    .from('vod_grants')
    .update({ status, webhook_received_at: new Date().toISOString() })
    .eq('id', grantId);
  if (error) throw new Error(`Failed to update grant: ${error.message}`);
}

/** Paid, unexpired grants for a viewer on a provider (weekly + title). */
export async function listActiveGrantsForViewer(
  providerId: string,
  viewerKeyHash: string
): Promise<VodGrant[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await db()
    .from('vod_grants')
    .select('*')
    .eq('provider_id', providerId)
    .eq('viewer_key_hash', viewerKeyHash)
    .eq('status', 'paid')
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  if (error) throw new Error(`Failed to load grants: ${error.message}`);
  return (data as Row[]).map(toGrant);
}

export async function listGrantsByProvider(providerId: string, limit = 100): Promise<VodGrant[]> {
  const { data, error } = await db()
    .from('vod_grants')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list grants: ${error.message}`);
  return (data as Row[]).map(toGrant);
}
