/**
 * Seedbox-rental data access (service-role Supabase).
 *
 * The new rental tables aren't in the generated `Database` type yet, so we talk
 * to them through an untyped client (a plain `SupabaseClient` defaults to an
 * `any` schema). All access is server-side via the service role — RLS on these
 * tables denies everyone else.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import type {
  DownloadStatus,
  GrantStatus,
  SeedboxShare,
  SeedboxShareDownload,
  SeedboxShareGrant,
  ShareInput,
} from './types';

function db(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

type ShareRow = Record<string, unknown>;

function toShare(row: ShareRow): SeedboxShare {
  return {
    id: String(row.id),
    slug: String(row.slug),
    ownerAccountId: String(row.owner_account_id),
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    priceUsd: Number(row.price_usd ?? 0),
    passWindowMinutes: Number(row.pass_window_minutes ?? 1440),
    maxDownloadsPerPass: Number(row.max_downloads_per_pass ?? 2),
    maxDownloadSizeGb: row.max_download_size_gb == null ? null : Number(row.max_download_size_gb),
    status: row.status as SeedboxShare['status'],
    expiresAt: (row.expires_at as string | null) ?? null,
    payoutWalletAddress: (row.payout_wallet_address as string | null) ?? null,
    payoutBlockchain: (row.payout_blockchain as string | null) ?? null,
    viewCount: Number(row.view_count ?? 0),
    sessionCount: Number(row.session_count ?? 0),
    earningsUsd: Number(row.earnings_usd ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toGrant(row: ShareRow): SeedboxShareGrant {
  return {
    id: String(row.id),
    shareId: String(row.share_id),
    coinpayportalPaymentId: (row.coinpayportal_payment_id as string | null) ?? null,
    grantTokenHash: String(row.grant_token_hash),
    status: row.status as GrantStatus,
    amountUsd: Number(row.amount_usd ?? 0),
    expiresAt: (row.expires_at as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function toDownload(row: ShareRow): SeedboxShareDownload {
  return {
    id: String(row.id),
    grantId: String(row.grant_id),
    shareId: String(row.share_id),
    infohash: String(row.infohash),
    name: (row.name as string | null) ?? null,
    magnet: String(row.magnet),
    status: row.status as DownloadStatus,
    createdAt: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

export async function insertShare(record: {
  slug: string;
  ownerAccountId: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  maxDownloadsPerPass: number;
  maxDownloadSizeGb: number | null;
  expiresAt: string | null;
  payoutWalletAddress: string | null;
  payoutBlockchain: string | null;
}): Promise<SeedboxShare> {
  const { data, error } = await db()
    .from('seedbox_shares')
    .insert({
      slug: record.slug,
      owner_account_id: record.ownerAccountId,
      title: record.title,
      description: record.description,
      price_usd: record.priceUsd,
      pass_window_minutes: record.passWindowMinutes,
      max_downloads_per_pass: record.maxDownloadsPerPass,
      max_download_size_gb: record.maxDownloadSizeGb,
      expires_at: record.expiresAt,
      payout_wallet_address: record.payoutWalletAddress,
      payout_blockchain: record.payoutBlockchain,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create rental: ${error.message}`);
  return toShare(data as ShareRow);
}

export async function listSharesByOwner(ownerAccountId: string): Promise<SeedboxShare[]> {
  const { data, error } = await db()
    .from('seedbox_shares')
    .select('*')
    .eq('owner_account_id', ownerAccountId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list rentals: ${error.message}`);
  return (data as ShareRow[]).map(toShare);
}

export async function getShareByIdForOwner(
  id: string,
  ownerAccountId: string
): Promise<SeedboxShare | null> {
  const { data, error } = await db()
    .from('seedbox_shares')
    .select('*')
    .eq('id', id)
    .eq('owner_account_id', ownerAccountId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load rental: ${error.message}`);
  return data ? toShare(data as ShareRow) : null;
}

/** Owner-agnostic lookup by id (server-internal use, e.g. webhook). */
export async function getShareById(id: string): Promise<SeedboxShare | null> {
  const { data, error } = await db()
    .from('seedbox_shares')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load rental: ${error.message}`);
  return data ? toShare(data as ShareRow) : null;
}

export async function getShareBySlug(slug: string): Promise<SeedboxShare | null> {
  const { data, error } = await db()
    .from('seedbox_shares')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`Failed to load rental: ${error.message}`);
  return data ? toShare(data as ShareRow) : null;
}

export async function updateShare(
  id: string,
  ownerAccountId: string,
  patch: ShareInput
): Promise<SeedboxShare | null> {
  const record: Record<string, unknown> = {};
  if (patch.title !== undefined) record.title = patch.title;
  if (patch.description !== undefined) record.description = patch.description;
  if (patch.priceUsd !== undefined) record.price_usd = patch.priceUsd;
  if (patch.passWindowMinutes !== undefined) record.pass_window_minutes = patch.passWindowMinutes;
  if (patch.maxDownloadsPerPass !== undefined) record.max_downloads_per_pass = patch.maxDownloadsPerPass;
  if (patch.maxDownloadSizeGb !== undefined) record.max_download_size_gb = patch.maxDownloadSizeGb;
  if (patch.expiresAt !== undefined) record.expires_at = patch.expiresAt;
  if (patch.payoutWalletAddress !== undefined) record.payout_wallet_address = patch.payoutWalletAddress;
  if (patch.payoutBlockchain !== undefined) record.payout_blockchain = patch.payoutBlockchain;
  if (patch.status !== undefined) record.status = patch.status;
  if (Object.keys(record).length === 0) {
    return getShareByIdForOwner(id, ownerAccountId);
  }

  const { data, error } = await db()
    .from('seedbox_shares')
    .update(record)
    .eq('id', id)
    .eq('owner_account_id', ownerAccountId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update rental: ${error.message}`);
  return data ? toShare(data as ShareRow) : null;
}

export async function deleteShare(id: string, ownerAccountId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('seedbox_shares')
    .delete()
    .eq('id', id)
    .eq('owner_account_id', ownerAccountId)
    .select('id');
  if (error) throw new Error(`Failed to delete rental: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Atomically credit a share's session count + gross earnings on a paid grant. */
export async function incrementShareEarnings(shareId: string, amountUsd: number): Promise<void> {
  const supabase = db();
  const { data, error } = await supabase
    .from('seedbox_shares')
    .select('session_count, earnings_usd')
    .eq('id', shareId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read rental stats: ${error.message}`);
  if (!data) return;
  const row = data as ShareRow;
  await supabase
    .from('seedbox_shares')
    .update({
      session_count: Number(row.session_count ?? 0) + 1,
      earnings_usd: Number(row.earnings_usd ?? 0) + amountUsd,
    })
    .eq('id', shareId);
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export async function insertPendingGrant(record: {
  shareId: string;
  grantTokenHash: string;
  amountUsd: number;
  viewerFingerprint: string | null;
}): Promise<SeedboxShareGrant> {
  const { data, error } = await db()
    .from('seedbox_share_grants')
    .insert({
      share_id: record.shareId,
      grant_token_hash: record.grantTokenHash,
      amount_usd: record.amountUsd,
      viewer_fingerprint: record.viewerFingerprint,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create session pass: ${error.message}`);
  return toGrant(data as ShareRow);
}

export async function setGrantPaymentId(grantId: string, paymentId: string): Promise<void> {
  const { error } = await db()
    .from('seedbox_share_grants')
    .update({ coinpayportal_payment_id: paymentId })
    .eq('id', grantId);
  if (error) throw new Error(`Failed to attach payment: ${error.message}`);
}

/** A paid, unexpired grant matching a fingerprint (used to reuse an owner's free pass). */
export async function findActiveGrantByFingerprint(
  shareId: string,
  fingerprint: string
): Promise<SeedboxShareGrant | null> {
  const { data, error } = await db()
    .from('seedbox_share_grants')
    .select('*')
    .eq('share_id', shareId)
    .eq('viewer_fingerprint', fingerprint)
    .eq('status', 'paid')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load session pass: ${error.message}`);
  return data ? toGrant(data as ShareRow) : null;
}

export async function insertOwnerGrant(record: {
  shareId: string;
  grantTokenHash: string;
  fingerprint: string;
  expiresAt: string;
}): Promise<SeedboxShareGrant> {
  const { data, error } = await db()
    .from('seedbox_share_grants')
    .insert({
      share_id: record.shareId,
      grant_token_hash: record.grantTokenHash,
      amount_usd: 0,
      viewer_fingerprint: record.fingerprint,
      status: 'paid',
      paid_at: new Date().toISOString(),
      expires_at: record.expiresAt,
      metadata: { owner: true },
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create owner pass: ${error.message}`);
  return toGrant(data as ShareRow);
}

export async function getGrantById(id: string): Promise<SeedboxShareGrant | null> {
  const { data, error } = await db()
    .from('seedbox_share_grants')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load session pass: ${error.message}`);
  return data ? toGrant(data as ShareRow) : null;
}

export async function getGrantByPaymentId(paymentId: string): Promise<SeedboxShareGrant | null> {
  const { data, error } = await db()
    .from('seedbox_share_grants')
    .select('*')
    .eq('coinpayportal_payment_id', paymentId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load session pass: ${error.message}`);
  return data ? toGrant(data as ShareRow) : null;
}

export async function markGrantPaid(
  grantId: string,
  fields: {
    expiresAt: string;
    amountCrypto?: string | null;
    cryptoCurrency?: string | null;
    blockchain?: string | null;
    txHash?: string | null;
    webhookEventType?: string | null;
  }
): Promise<void> {
  const { error } = await db()
    .from('seedbox_share_grants')
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
  if (error) throw new Error(`Failed to mark session pass paid: ${error.message}`);
}

export async function updateGrantTokenHash(grantId: string, grantTokenHash: string): Promise<void> {
  const { error } = await db()
    .from('seedbox_share_grants')
    .update({ grant_token_hash: grantTokenHash })
    .eq('id', grantId);
  if (error) throw new Error(`Failed to rotate pass token: ${error.message}`);
}

export async function markGrantStatus(grantId: string, status: GrantStatus): Promise<void> {
  const { error } = await db()
    .from('seedbox_share_grants')
    .update({ status, webhook_received_at: new Date().toISOString() })
    .eq('id', grantId);
  if (error) throw new Error(`Failed to update session pass: ${error.message}`);
}

export async function listGrantsByShare(shareId: string, limit = 100): Promise<SeedboxShareGrant[]> {
  const { data, error } = await db()
    .from('seedbox_share_grants')
    .select('*')
    .eq('share_id', shareId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list session passes: ${error.message}`);
  return (data as ShareRow[]).map(toGrant);
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

export async function insertDownload(record: {
  grantId: string;
  shareId: string;
  infohash: string;
  name: string | null;
  magnet: string;
}): Promise<SeedboxShareDownload> {
  const { data, error } = await db()
    .from('seedbox_share_downloads')
    .upsert(
      {
        grant_id: record.grantId,
        share_id: record.shareId,
        infohash: record.infohash,
        name: record.name,
        magnet: record.magnet,
        status: 'added',
      },
      { onConflict: 'grant_id,infohash' }
    )
    .select('*')
    .single();
  if (error) throw new Error(`Failed to record download: ${error.message}`);
  return toDownload(data as ShareRow);
}

export async function getDownloadById(id: string): Promise<SeedboxShareDownload | null> {
  const { data, error } = await db()
    .from('seedbox_share_downloads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load download: ${error.message}`);
  return data ? toDownload(data as ShareRow) : null;
}

export async function listDownloadsByGrant(grantId: string): Promise<SeedboxShareDownload[]> {
  const { data, error } = await db()
    .from('seedbox_share_downloads')
    .select('*')
    .eq('grant_id', grantId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list downloads: ${error.message}`);
  return (data as ShareRow[]).map(toDownload);
}

export async function countDownloadsByGrant(grantId: string): Promise<number> {
  const { count, error } = await db()
    .from('seedbox_share_downloads')
    .select('id', { count: 'exact', head: true })
    .eq('grant_id', grantId);
  if (error) throw new Error(`Failed to count downloads: ${error.message}`);
  return count ?? 0;
}

export async function countDownloadsByShare(shareId: string): Promise<number> {
  const { count, error } = await db()
    .from('seedbox_share_downloads')
    .select('id', { count: 'exact', head: true })
    .eq('share_id', shareId);
  if (error) throw new Error(`Failed to count downloads: ${error.message}`);
  return count ?? 0;
}

/** Persist a torrent's learned name/status from torlink status polling. */
export async function updateDownloadMeta(
  id: string,
  fields: { name?: string | null; status?: DownloadStatus }
): Promise<void> {
  const record: Record<string, unknown> = {};
  if (fields.name !== undefined) record.name = fields.name;
  if (fields.status !== undefined) record.status = fields.status;
  if (Object.keys(record).length === 0) return;
  const { error } = await db().from('seedbox_share_downloads').update(record).eq('id', id);
  if (error) throw new Error(`Failed to update download: ${error.message}`);
}
