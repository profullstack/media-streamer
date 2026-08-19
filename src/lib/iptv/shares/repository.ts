/**
 * IPTV-resale data access (service-role Supabase).
 *
 * These tables are not in the hand-maintained `Database` type, so they are reached
 * through an untyped client. All access is server-side via the service role — RLS
 * on these tables denies everyone else, and buyers are anonymous so there is no
 * user JWT to authorise against in the first place.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import type {
  IptvGrantStatus,
  IptvShare,
  IptvShareGrant,
  IptvShareInput,
  IptvShareSession,
} from './types';

function db(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

/**
 * How long a session may go unheard-from before its slot is reclaimed.
 *
 * A viewer who closes the tab never sends a stop, so without this their slot is
 * held until the pass expires and the owner's line looks permanently full.
 */
export const SESSION_STALE_SECONDS = 90;

type Row = Record<string, unknown>;

function toShare(row: Row): IptvShare {
  return {
    id: String(row.id),
    slug: String(row.slug),
    ownerAccountId: String(row.owner_account_id),
    playlistId: String(row.playlist_id),
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    priceUsd: Number(row.price_usd ?? 0),
    passWindowMinutes: Number(row.pass_window_minutes ?? 240),
    maxConcurrentStreams: Number(row.max_concurrent_streams ?? 1),
    maxActivePasses: Number(row.max_active_passes ?? 3),
    allowedChannelIds: (row.allowed_channel_ids as string[] | null) ?? null,
    status: row.status as IptvShare['status'],
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

function toGrant(row: Row): IptvShareGrant {
  return {
    id: String(row.id),
    shareId: String(row.share_id),
    coinpayportalPaymentId: (row.coinpayportal_payment_id as string | null) ?? null,
    grantTokenHash: String(row.grant_token_hash),
    status: row.status as IptvGrantStatus,
    amountUsd: Number(row.amount_usd ?? 0),
    viewerFingerprint: (row.viewer_fingerprint as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toSession(row: Row): IptvShareSession {
  return {
    id: String(row.id),
    grantId: String(row.grant_id),
    shareId: String(row.share_id),
    channelId: String(row.channel_id),
    channelName: (row.channel_name as string | null) ?? null,
    lastSeenAt: String(row.last_seen_at),
    startedAt: String(row.started_at),
    endedAt: (row.ended_at as string | null) ?? null,
  };
}

const staleCutoff = () => new Date(Date.now() - SESSION_STALE_SECONDS * 1000).toISOString();

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

export async function insertShare(
  ownerAccountId: string,
  slug: string,
  input: IptvShareInput
): Promise<IptvShare> {
  const { data, error } = await db()
    .from('iptv_shares')
    .insert({
      slug,
      owner_account_id: ownerAccountId,
      playlist_id: input.playlistId,
      title: input.title ?? 'Watch on my line',
      description: input.description ?? null,
      price_usd: input.priceUsd ?? 1.0,
      pass_window_minutes: input.passWindowMinutes ?? 240,
      max_concurrent_streams: input.maxConcurrentStreams ?? 1,
      max_active_passes: input.maxActivePasses ?? 3,
      allowed_channel_ids: input.allowedChannelIds ?? null,
      expires_at: input.expiresAt ?? null,
      payout_wallet_address: input.payoutWalletAddress ?? null,
      payout_blockchain: input.payoutBlockchain ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toShare(data as Row);
}

export async function listSharesForOwner(ownerAccountId: string): Promise<IptvShare[]> {
  const { data, error } = await db()
    .from('iptv_shares')
    .select('*')
    .eq('owner_account_id', ownerAccountId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toShare(r as Row));
}

export async function getShareBySlug(slug: string): Promise<IptvShare | null> {
  const { data, error } = await db().from('iptv_shares').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toShare(data as Row) : null;
}

export async function getShareForOwner(id: string, ownerAccountId: string): Promise<IptvShare | null> {
  const { data, error } = await db()
    .from('iptv_shares')
    .select('*')
    .eq('id', id)
    .eq('owner_account_id', ownerAccountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toShare(data as Row) : null;
}

export async function updateShare(
  id: string,
  ownerAccountId: string,
  patch: Record<string, unknown>
): Promise<IptvShare | null> {
  const { data, error } = await db()
    .from('iptv_shares')
    .update(patch)
    .eq('id', id)
    .eq('owner_account_id', ownerAccountId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toShare(data as Row) : null;
}

export async function deleteShare(id: string, ownerAccountId: string): Promise<boolean> {
  const { error, count } = await db()
    .from('iptv_shares')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('owner_account_id', ownerAccountId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export async function insertPendingGrant(input: {
  shareId: string;
  grantTokenHash: string;
  amountUsd: number;
  viewerFingerprint: string | null;
}): Promise<IptvShareGrant> {
  const { data, error } = await db()
    .from('iptv_share_grants')
    .insert({
      share_id: input.shareId,
      grant_token_hash: input.grantTokenHash,
      amount_usd: input.amountUsd,
      viewer_fingerprint: input.viewerFingerprint,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toGrant(data as Row);
}

export async function setGrantPaymentId(grantId: string, paymentId: string): Promise<void> {
  const { error } = await db()
    .from('iptv_share_grants')
    .update({ coinpayportal_payment_id: paymentId })
    .eq('id', grantId);
  if (error) throw new Error(error.message);
}

export async function getGrant(grantId: string): Promise<IptvShareGrant | null> {
  const { data, error } = await db()
    .from('iptv_share_grants')
    .select('*')
    .eq('id', grantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toGrant(data as Row) : null;
}

export async function getGrantByPaymentId(paymentId: string): Promise<IptvShareGrant | null> {
  const { data, error } = await db()
    .from('iptv_share_grants')
    .select('*')
    .eq('coinpayportal_payment_id', paymentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toGrant(data as Row) : null;
}

/**
 * Flip a pending grant to paid and start its clock.
 *
 * Guarded on `status = 'pending'` so a webhook redelivery cannot extend a pass that
 * is already running — otherwise every retry would push expiry further out and a
 * $1 pass could be renewed indefinitely by replaying one notification.
 */
export async function markGrantPaid(
  grantId: string,
  windowMinutes: number,
  meta: { eventType?: string; txHash?: string | null } = {}
): Promise<IptvShareGrant | null> {
  const now = new Date();
  const { data, error } = await db()
    .from('iptv_share_grants')
    .update({
      status: 'paid',
      paid_at: now.toISOString(),
      expires_at: new Date(now.getTime() + windowMinutes * 60_000).toISOString(),
      webhook_event_type: meta.eventType ?? null,
      webhook_received_at: now.toISOString(),
      tx_hash: meta.txHash ?? null,
    })
    .eq('id', grantId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toGrant(data as Row) : null;
}

/** Live passes on a share right now, for the max_active_passes check. */
export async function countLivePasses(shareId: string): Promise<number> {
  const { count, error } = await db()
    .from('iptv_share_grants')
    .select('id', { count: 'exact', head: true })
    .eq('share_id', shareId)
    .eq('status', 'paid')
    .gt('expires_at', new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Sessions — the concurrency cap
// ---------------------------------------------------------------------------

/** Sessions still counted as live: not ended, and heard from recently. */
export async function countLiveSessions(shareId: string): Promise<number> {
  const { count, error } = await db()
    .from('iptv_share_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('share_id', shareId)
    .is('ended_at', null)
    .gt('last_seen_at', staleCutoff());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function findLiveSession(
  grantId: string,
  channelId: string
): Promise<IptvShareSession | null> {
  const { data, error } = await db()
    .from('iptv_share_sessions')
    .select('*')
    .eq('grant_id', grantId)
    .eq('channel_id', channelId)
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSession(data as Row) : null;
}

export async function openSession(input: {
  grantId: string;
  shareId: string;
  channelId: string;
  channelName: string | null;
}): Promise<IptvShareSession> {
  const { data, error } = await db()
    .from('iptv_share_sessions')
    .insert({
      grant_id: input.grantId,
      share_id: input.shareId,
      channel_id: input.channelId,
      channel_name: input.channelName,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toSession(data as Row);
}

export async function touchSession(sessionId: string): Promise<void> {
  const { error } = await db()
    .from('iptv_share_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('ended_at', null);
  if (error) throw new Error(error.message);
}

export async function endSession(sessionId: string): Promise<void> {
  const { error } = await db()
    .from('iptv_share_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('ended_at', null);
  if (error) throw new Error(error.message);
}

/**
 * Close sessions nobody has heard from.
 *
 * Called before a capacity check rather than on a timer: a cron that has not run
 * yet would leave the line looking full, and the check is the only place the
 * answer actually matters.
 */
export async function reapStaleSessions(shareId: string): Promise<void> {
  const { error } = await db()
    .from('iptv_share_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('share_id', shareId)
    .is('ended_at', null)
    .lt('last_seen_at', staleCutoff());
  if (error) throw new Error(error.message);
}

export async function bumpShareCounters(
  shareId: string,
  patch: { views?: number; sessions?: number; earningsUsd?: number }
): Promise<void> {
  const share = await db().from('iptv_shares').select('*').eq('id', shareId).maybeSingle();
  if (share.error || !share.data) return;
  const row = share.data as Row;
  await db()
    .from('iptv_shares')
    .update({
      view_count: Number(row.view_count ?? 0) + (patch.views ?? 0),
      session_count: Number(row.session_count ?? 0) + (patch.sessions ?? 0),
      earnings_usd: Number(row.earnings_usd ?? 0) + (patch.earningsUsd ?? 0),
    })
    .eq('id', shareId);
}

/**
 * The owner's playlist behind a share, including its m3u_url.
 *
 * Service-role only, and the result must never be serialised to a buyer: the URL
 * usually embeds the owner's provider username and password.
 */
export async function getPlaylistForShare(
  playlistId: string
): Promise<{ id: string; name: string; m3uUrl: string; epgUrl: string | null } | null> {
  const { data, error } = await db()
    .from('iptv_playlists')
    .select('id, name, m3u_url, epg_url')
    .eq('id', playlistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Row;
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    m3uUrl: String(row.m3u_url),
    epgUrl: (row.epg_url as string | null) ?? null,
  };
}

/** Is this playlist owned by this account? Guards resale of someone else's line. */
export async function playlistBelongsTo(playlistId: string, ownerAccountId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('iptv_playlists')
    .select('id')
    .eq('id', playlistId)
    .eq('user_id', ownerAccountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getSession(sessionId: string): Promise<IptvShareSession | null> {
  const { data, error } = await db()
    .from('iptv_share_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toSession(data as Row) : null;
}

export async function getShareById(id: string): Promise<IptvShare | null> {
  const { data, error } = await db().from('iptv_shares').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toShare(data as Row) : null;
}

export async function markGrantStatus(grantId: string, status: IptvGrantStatus): Promise<void> {
  const { error } = await db().from('iptv_share_grants').update({ status }).eq('id', grantId);
  if (error) throw new Error(error.message);
}
