/**
 * IPTV Resale service — orchestration for the pay-per-game flow.
 *
 * Owner side: list one of your IPTV playlists for resale, priced and capped.
 * Buyer side (anonymous): pay ~$1 → pass → pick a channel → watch.
 *
 * Two things here are load-bearing and worth stating plainly.
 *
 * 1. The buyer never receives the upstream URL. The platform's generic
 *    /api/iptv-proxy takes the stream URL as a query parameter and its "encoding"
 *    is encodeURIComponent — fine when you are streaming your own playlist to
 *    yourself, fatal for resale, because the buyer would simply read the owner's
 *    provider credentials out of the query string, keep them, and never pay again.
 *    So a resale stream is addressed by an opaque session id and the upstream is
 *    resolved server-side, on every request.
 *
 * 2. Concurrency is enforced continuously. An IPTV subscription allows N
 *    simultaneous connections; exceeding it does not merely degrade playback, it
 *    is what gets the owner's account terminated by their provider. Sessions carry
 *    heartbeats and stale ones are reaped before every capacity check.
 */

import type { CryptoBlockchain } from '@/lib/coinpayportal/types';
import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';
import { parseM3U, type Channel } from '@/lib/iptv';
import { getIptvCacheReader } from '@/lib/iptv/cache-reader';
import {
  generateGrantToken,
  generateIptvShareSlug,
  hashGrantToken,
  iptvPassCookieName,
  parsePassCookieValue,
  verifyGrantToken,
} from './pass';
import * as repo from './repository';
import type {
  IptvCheckoutResult,
  IptvShare,
  IptvShareGrant,
  IptvShareInput,
  PublicIptvShare,
} from './types';

/** On-chain fees can rival a $1 payment, so checkout is restricted to low-fee chains. */
const LOW_FEE_BLOCKCHAINS: CryptoBlockchain[] = ['SOL', 'USDC_SOL', 'POL', 'USDC_POL'];
const DEFAULT_BLOCKCHAIN: CryptoBlockchain = 'SOL';

const MIN_PRICE_USD = 0.25;
const MAX_PRICE_USD = 100;
/** A pass is for a game, not a subscription. Anything longer is a resold account. */
const MAX_PASS_WINDOW_MINUTES = 24 * 60;

export class IptvResaleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'IptvResaleError';
    this.status = status;
  }
}

function appBaseUrl(fallbackOrigin?: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin || '').replace(/\/+$/, '');
}

function pickBlockchain(requested: string | undefined): CryptoBlockchain {
  if (requested && (LOW_FEE_BLOCKCHAINS as string[]).includes(requested)) {
    return requested as CryptoBlockchain;
  }
  return DEFAULT_BLOCKCHAIN;
}

// ---------------------------------------------------------------------------
// Owner: resale management
// ---------------------------------------------------------------------------

function validate(input: IptvShareInput): void {
  if (input.priceUsd !== undefined) {
    if (!Number.isFinite(input.priceUsd) || input.priceUsd < MIN_PRICE_USD || input.priceUsd > MAX_PRICE_USD) {
      throw new IptvResaleError(`Price must be between $${MIN_PRICE_USD} and $${MAX_PRICE_USD}`);
    }
  }
  if (input.passWindowMinutes !== undefined) {
    if (!Number.isInteger(input.passWindowMinutes) || input.passWindowMinutes <= 0) {
      throw new IptvResaleError('Pass window must be a positive number of minutes');
    }
    if (input.passWindowMinutes > MAX_PASS_WINDOW_MINUTES) {
      // Selling a month of access is not "pay per game" — it is subletting the
      // account, which is what providers actually ban people for.
      throw new IptvResaleError('Pass window cannot exceed 24 hours');
    }
  }
  if (input.maxConcurrentStreams !== undefined) {
    if (!Number.isInteger(input.maxConcurrentStreams) || input.maxConcurrentStreams < 1) {
      throw new IptvResaleError('Concurrent streams must be at least 1');
    }
  }
  if (input.allowedChannelIds !== undefined && input.allowedChannelIds !== null) {
    if (!Array.isArray(input.allowedChannelIds) || input.allowedChannelIds.length === 0) {
      throw new IptvResaleError('Channel restriction must list at least one channel');
    }
  }
}

export async function createResale(ownerAccountId: string, input: IptvShareInput): Promise<IptvShare> {
  if (!input?.playlistId) throw new IptvResaleError('A playlist is required');
  // Without this an owner could list someone else's playlist id and collect the money
  // while a stranger's provider account absorbed the load.
  if (!(await repo.playlistBelongsTo(input.playlistId, ownerAccountId))) {
    throw new IptvResaleError('That playlist does not belong to you', 403);
  }
  validate(input);
  return repo.insertShare(ownerAccountId, generateIptvShareSlug(), input);
}

export function listResales(ownerAccountId: string): Promise<IptvShare[]> {
  return repo.listSharesForOwner(ownerAccountId);
}

export function getResale(id: string, ownerAccountId: string): Promise<IptvShare | null> {
  return repo.getShareForOwner(id, ownerAccountId);
}

export async function updateResale(
  id: string,
  ownerAccountId: string,
  input: IptvShareInput
): Promise<IptvShare | null> {
  validate(input);
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.priceUsd !== undefined) patch.price_usd = input.priceUsd;
  if (input.passWindowMinutes !== undefined) patch.pass_window_minutes = input.passWindowMinutes;
  if (input.maxConcurrentStreams !== undefined) patch.max_concurrent_streams = input.maxConcurrentStreams;
  if (input.maxActivePasses !== undefined) patch.max_active_passes = input.maxActivePasses;
  if (input.allowedChannelIds !== undefined) patch.allowed_channel_ids = input.allowedChannelIds;
  if (input.status !== undefined) patch.status = input.status;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (input.payoutWalletAddress !== undefined) patch.payout_wallet_address = input.payoutWalletAddress;
  if (input.payoutBlockchain !== undefined) patch.payout_blockchain = input.payoutBlockchain;
  if (Object.keys(patch).length === 0) return repo.getShareForOwner(id, ownerAccountId);
  return repo.updateShare(id, ownerAccountId, patch);
}

export function deleteResale(id: string, ownerAccountId: string): Promise<boolean> {
  return repo.deleteShare(id, ownerAccountId);
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * Channels a share actually sells.
 *
 * Reads the worker's Redis cache first and falls back to fetching the M3U. The
 * returned objects keep their upstream `url`, so this is server-side only — see
 * `publicChannels` for what a buyer may be shown.
 */
export async function resolveShareChannels(share: IptvShare): Promise<Channel[]> {
  let channels: Channel[] = [];

  const cached = await getIptvCacheReader()
    .getPlaylistChannels(share.playlistId)
    .catch(() => null);
  if (cached?.data?.length) {
    channels = cached.data;
  } else {
    const playlist = await repo.getPlaylistForShare(share.playlistId);
    if (!playlist) throw new IptvResaleError('The playlist behind this listing is gone', 410);
    const res = await fetch(playlist.m3uUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new IptvResaleError('Could not read the playlist right now', 502);
    channels = parseM3U(await res.text());
  }

  if (share.allowedChannelIds && share.allowedChannelIds.length > 0) {
    const allowed = new Set(share.allowedChannelIds);
    channels = channels.filter((c) => allowed.has(c.id));
  }
  return channels;
}

/** Channels stripped of anything that would let a buyer stream without paying. */
export function publicChannels(channels: Channel[]): Array<Omit<Channel, 'url'>> {
  return channels.map(({ url: _url, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Public view
// ---------------------------------------------------------------------------

export function isShareOpen(share: IptvShare): boolean {
  if (share.status !== 'active') return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

export async function getPublicShare(slug: string): Promise<PublicIptvShare | null> {
  const share = await repo.getShareBySlug(slug);
  if (!share) return null;

  const channels = await resolveShareChannels(share).catch(() => [] as Channel[]);
  await repo.reapStaleSessions(share.id);
  const [liveSessions, livePasses] = await Promise.all([
    repo.countLiveSessions(share.id),
    repo.countLivePasses(share.id),
  ]);

  return {
    slug: share.slug,
    title: share.title,
    description: share.description,
    priceUsd: share.priceUsd,
    passWindowMinutes: share.passWindowMinutes,
    channelCount: channels.length,
    active: isShareOpen(share),
    // Shown before payment on purpose: selling a pass that cannot start a stream
    // is the fastest way to owe a refund.
    capacityAvailable:
      liveSessions < share.maxConcurrentStreams && livePasses < share.maxActivePasses,
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export async function createCheckout(
  slug: string,
  opts: { blockchain?: string; fingerprint?: string | null; origin?: string }
): Promise<IptvCheckoutResult> {
  const share = await repo.getShareBySlug(slug);
  if (!share) throw new IptvResaleError('Listing not found', 404);
  if (!isShareOpen(share)) throw new IptvResaleError('This listing is not currently available', 410);

  // Refuse the sale rather than take the money and fail at kickoff.
  await repo.reapStaleSessions(share.id);
  if ((await repo.countLivePasses(share.id)) >= share.maxActivePasses) {
    throw new IptvResaleError('This line is fully booked right now — try again shortly', 409);
  }

  const blockchain = share.payoutWalletAddress
    ? pickBlockchain(share.payoutBlockchain ?? undefined)
    : pickBlockchain(opts.blockchain);

  const token = generateGrantToken();
  const grant = await repo.insertPendingGrant({
    shareId: share.id,
    grantTokenHash: hashGrantToken(token),
    amountUsd: share.priceUsd,
    viewerFingerprint: opts.fingerprint ?? null,
  });

  const base = appBaseUrl(opts.origin);
  const payment = await getCoinPayPortalClient().createPayment({
    amount: share.priceUsd,
    blockchain,
    description: `IPTV pass: ${share.title}`.slice(0, 140),
    metadata: { type: 'iptv_share', shareId: share.id, grantId: grant.id },
    webhookUrl: base ? `${base}/api/webhooks/coinpayportal/iptv-share` : undefined,
    redirectUrl: base ? `${base}/watch/${share.slug}?grant=${grant.id}` : undefined,
    merchantWalletAddress: share.payoutWalletAddress ?? undefined,
  });

  await repo.setGrantPaymentId(grant.id, payment.payment.id);

  return {
    paymentUrl: payment.paymentUrl,
    grantId: grant.id,
    cookie: { name: iptvPassCookieName(share.slug), value: `${grant.id}.${token}` },
  };
}

// ---------------------------------------------------------------------------
// Pass resolution
// ---------------------------------------------------------------------------

export type IptvPassResolution =
  | { ok: true; share: IptvShare; grant: IptvShareGrant }
  | { ok: false; status: number; message: string };

export async function resolvePass(
  slug: string,
  cookieValue: string | undefined
): Promise<IptvPassResolution> {
  const share = await repo.getShareBySlug(slug);
  if (!share) return { ok: false, status: 404, message: 'Listing not found' };
  if (share.status === 'closed') return { ok: false, status: 410, message: 'This listing is closed' };

  const parsed = parsePassCookieValue(cookieValue);
  if (!parsed) return { ok: false, status: 401, message: 'No pass for this listing' };

  const grant = await repo.getGrant(parsed.grantId);
  if (!grant || grant.shareId !== share.id) {
    return { ok: false, status: 401, message: 'No pass for this listing' };
  }
  if (!verifyGrantToken(parsed.token, grant.grantTokenHash)) {
    return { ok: false, status: 401, message: 'No pass for this listing' };
  }
  if (grant.status !== 'paid') {
    return { ok: false, status: 402, message: 'Payment has not completed yet' };
  }
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 410, message: 'This pass has expired' };
  }
  return { ok: true, share, grant };
}

// ---------------------------------------------------------------------------
// Sessions — where the concurrency cap is actually applied
// ---------------------------------------------------------------------------

/**
 * Start (or resume) a stream, returning an opaque session id.
 *
 * Never returns the upstream URL. The player addresses the stream by session id
 * and the proxy resolves the real URL server-side each time; see
 * `resolveUpstreamForSession`.
 */
export async function startStream(
  slug: string,
  cookieValue: string | undefined,
  channelId: string
): Promise<{ sessionId: string; channelName: string | null }> {
  const pass = await resolvePass(slug, cookieValue);
  if (!pass.ok) throw new IptvResaleError(pass.message, pass.status);
  const { share, grant } = pass;

  const channels = await resolveShareChannels(share);
  const channel = channels.find((c) => c.id === channelId);
  // Also the authorisation check: a channel outside allowed_channel_ids is simply
  // not in this list, so asking for it is indistinguishable from asking for one
  // that does not exist.
  if (!channel) throw new IptvResaleError('That channel is not part of this listing', 404);

  // Reloading the page must reuse the slot rather than consume a second one.
  const existing = await repo.findLiveSession(grant.id, channelId);
  if (existing) {
    await repo.touchSession(existing.id);
    return { sessionId: existing.id, channelName: existing.channelName };
  }

  await repo.reapStaleSessions(share.id);
  if ((await repo.countLiveSessions(share.id)) >= share.maxConcurrentStreams) {
    // 409 rather than 403: nothing is wrong with the pass, the line is just busy.
    throw new IptvResaleError('All streams on this line are in use right now', 409);
  }

  const session = await repo.openSession({
    grantId: grant.id,
    shareId: share.id,
    channelId,
    channelName: channel.name ?? null,
  });
  await repo.bumpShareCounters(share.id, { sessions: 1 });
  return { sessionId: session.id, channelName: session.channelName };
}

export async function heartbeat(
  slug: string,
  cookieValue: string | undefined,
  sessionId: string
): Promise<void> {
  const pass = await resolvePass(slug, cookieValue);
  if (!pass.ok) throw new IptvResaleError(pass.message, pass.status);
  const session = await repo.getSession(sessionId);
  if (!session || session.grantId !== pass.grant.id) {
    throw new IptvResaleError('Unknown session', 404);
  }
  await repo.touchSession(sessionId);
}

export async function stopStream(
  slug: string,
  cookieValue: string | undefined,
  sessionId: string
): Promise<void> {
  const pass = await resolvePass(slug, cookieValue);
  if (!pass.ok) throw new IptvResaleError(pass.message, pass.status);
  const session = await repo.getSession(sessionId);
  if (!session || session.grantId !== pass.grant.id) return;
  await repo.endSession(sessionId);
}

/**
 * Resolve the real upstream URL for a live session. Server-side only.
 *
 * The returned URL carries the owner's provider credentials and must never appear
 * in a response body, a redirect Location, a log line, or an error message.
 */
export async function resolveUpstreamForSession(
  slug: string,
  cookieValue: string | undefined,
  sessionId: string
): Promise<{ url: string; share: IptvShare }> {
  const pass = await resolvePass(slug, cookieValue);
  if (!pass.ok) throw new IptvResaleError(pass.message, pass.status);

  const session = await repo.getSession(sessionId);
  if (!session || session.grantId !== pass.grant.id || session.endedAt) {
    throw new IptvResaleError('Unknown session', 404);
  }

  const channels = await resolveShareChannels(pass.share);
  const channel = channels.find((c) => c.id === session.channelId);
  if (!channel) throw new IptvResaleError('That channel is no longer available', 410);

  // Streaming counts as being alive; a viewer watching without the player's
  // heartbeat must not have their slot reaped out from under them.
  await repo.touchSession(sessionId);
  return { url: channel.url, share: pass.share };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface IptvWebhookOutcome {
  handled: boolean;
  action: string;
  grantId?: string;
}

/**
 * CoinPayPortal webhook for IPTV passes.
 *
 * Switches on the event type, not a status string: CoinPay sends
 * `payment.confirmed` / `payment.forwarded` for money that arrived and
 * `payment.detected` for money merely seen on-chain but not yet confirmed.
 * Treating "detected" as paid would hand out a pass for a transaction that can
 * still fail.
 */
export async function handleIptvShareWebhook(payload: {
  type: string;
  paymentId: string;
  amountCrypto?: string | null;
  currency?: string | null;
  blockchain?: string | null;
  txHash?: string | null;
}): Promise<IptvWebhookOutcome> {
  const grant = await repo.getGrantByPaymentId(payload.paymentId);
  if (!grant) return { handled: false, action: 'grant_not_found' };

  switch (payload.type) {
    case 'payment.confirmed':
    case 'payment.forwarded': {
      if (grant.status === 'paid') {
        // Redelivery. Returning early rather than re-marking is what stops a
        // replayed webhook extending a pass that is already running.
        return { handled: true, action: 'already_paid', grantId: grant.id };
      }
      const share = await repo.getShareById(grant.shareId);
      const paid = await repo.markGrantPaid(grant.id, share?.passWindowMinutes ?? 240, {
        eventType: payload.type,
        txHash: payload.txHash ?? null,
      });
      if (!paid) return { handled: true, action: 'already_paid', grantId: grant.id };
      await repo.bumpShareCounters(grant.shareId, { earningsUsd: grant.amountUsd });
      return { handled: true, action: 'paid', grantId: grant.id };
    }
    case 'payment.failed':
    case 'payment.expired': {
      if (grant.status === 'pending') await repo.markGrantStatus(grant.id, 'expired');
      return { handled: true, action: 'expired', grantId: grant.id };
    }
    default:
      return { handled: true, action: `ignored:${payload.type}`, grantId: grant.id };
  }
}
