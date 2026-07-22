/**
 * Seedbox Rental service — orchestration for the pay-per-watch flow.
 *
 * Owner side: create/manage a public, temporary rental of their seedbox.
 * Renter side (anonymous): pay $0.25 → session pass → add a magnet → the
 * owner's box downloads it → stream it. Access is payer-scoped: a pass may only
 * stream torrents it added.
 *
 * See docs/prds/seedbox-pay-per-watch.md.
 */

import type { CryptoBlockchain } from '@/lib/coinpayportal/types';
import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';
import {
  isValidMagnet,
  loadAccountSeedboxConfig,
  sendTorrentToSeedbox,
} from '@/lib/seedbox';
import type { SeedboxConfig } from '@/lib/seedbox/config';
import { filesAuthHeaders } from '@/lib/seedbox/files';
import { buildAuthHeaders } from '@/lib/seedbox/http-transport';
import { streamSeedboxFile, type StreamOptions } from '@/lib/seedbox/stream';
import { parseMagnet } from './magnet';
import {
  generateGrantToken,
  generateShareSlug,
  hashGrantToken,
  parsePassCookieValue,
  passCookieName,
  verifyGrantToken,
} from './pass';
import * as repo from './repository';
import type {
  PublicShare,
  SeedboxShare,
  SeedboxShareDownload,
  SeedboxShareGrant,
  ShareInput,
} from './types';

// On-chain fees on a $0.25 payment can rival the amount, so restrict checkout to
// low-fee chains. Owners configure which of these their CoinPay merchant supports.
const LOW_FEE_BLOCKCHAINS: CryptoBlockchain[] = ['SOL', 'USDC_SOL', 'POL', 'USDC_POL'];
const DEFAULT_BLOCKCHAIN: CryptoBlockchain = 'SOL';

const MIN_PRICE_USD = 0.25;
const MAX_PRICE_USD = 100;

function appBaseUrl(fallbackOrigin?: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin || '').replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Owner: rental management
// ---------------------------------------------------------------------------

/** Does this account have the seedbox transports a rental needs (HTTP add + files)? */
export async function ownerSeedboxReady(config: SeedboxConfig | null): Promise<{
  ready: boolean;
  reason?: string;
}> {
  if (!config?.http) {
    return { ready: false, reason: 'Connect a seedbox with the HTTP (torlink) transport first.' };
  }
  if (!config.files) {
    return { ready: false, reason: 'Your seedbox needs a files server configured to stream playback.' };
  }
  return { ready: true };
}

function clampPrice(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return MIN_PRICE_USD;
  return Math.min(MAX_PRICE_USD, Math.max(MIN_PRICE_USD, Math.round(value * 100) / 100));
}

export async function createRental(ownerAccountId: string, input: ShareInput): Promise<SeedboxShare> {
  const config = await loadAccountSeedboxConfig(ownerAccountId);
  const ready = await ownerSeedboxReady(config);
  if (!ready.ready) {
    throw new RentalError(ready.reason ?? 'Seedbox not ready', 400);
  }
  return repo.insertShare({
    slug: generateShareSlug(),
    ownerAccountId,
    title: (input.title ?? 'Rent my seedbox').slice(0, 120),
    description: input.description?.slice(0, 2000) ?? null,
    priceUsd: clampPrice(input.priceUsd),
    passWindowMinutes: Math.max(5, Math.min(43200, input.passWindowMinutes ?? 1440)),
    maxDownloadsPerPass: Math.max(1, Math.min(20, input.maxDownloadsPerPass ?? 2)),
    maxDownloadSizeGb: input.maxDownloadSizeGb ?? null,
    expiresAt: input.expiresAt ?? null,
    payoutWalletAddress: input.payoutWalletAddress?.trim() || null,
    payoutBlockchain: input.payoutBlockchain?.trim() || null,
  });
}

export function listRentals(ownerAccountId: string): Promise<SeedboxShare[]> {
  return repo.listSharesByOwner(ownerAccountId);
}

export function getRental(id: string, ownerAccountId: string): Promise<SeedboxShare | null> {
  return repo.getShareByIdForOwner(id, ownerAccountId);
}

export async function updateRental(
  id: string,
  ownerAccountId: string,
  patch: ShareInput
): Promise<SeedboxShare | null> {
  const sanitized: ShareInput = { ...patch };
  if (patch.priceUsd !== undefined) sanitized.priceUsd = clampPrice(patch.priceUsd);
  if (patch.passWindowMinutes !== undefined) {
    sanitized.passWindowMinutes = Math.max(5, Math.min(43200, patch.passWindowMinutes));
  }
  if (patch.maxDownloadsPerPass !== undefined) {
    sanitized.maxDownloadsPerPass = Math.max(1, Math.min(20, patch.maxDownloadsPerPass));
  }
  return repo.updateShare(id, ownerAccountId, sanitized);
}

export function deleteRental(id: string, ownerAccountId: string): Promise<boolean> {
  return repo.deleteShare(id, ownerAccountId);
}

export async function getRentalActivity(
  id: string,
  ownerAccountId: string
): Promise<{ share: SeedboxShare; grants: SeedboxShareGrant[]; downloadCount: number } | null> {
  const share = await repo.getShareByIdForOwner(id, ownerAccountId);
  if (!share) return null;
  const [grants, downloadCount] = await Promise.all([
    repo.listGrantsByShare(share.id),
    repo.countDownloadsByShare(share.id),
  ]);
  return { share, grants, downloadCount };
}

// ---------------------------------------------------------------------------
// Public: share visibility
// ---------------------------------------------------------------------------

/** True when a rental is open for new business right now. */
export function isShareOpen(share: SeedboxShare): boolean {
  if (share.status !== 'active') return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

export function toPublicShare(share: SeedboxShare): PublicShare {
  return {
    slug: share.slug,
    title: share.title,
    description: share.description,
    priceUsd: share.priceUsd,
    passWindowMinutes: share.passWindowMinutes,
    maxDownloadsPerPass: share.maxDownloadsPerPass,
    maxDownloadSizeGb: share.maxDownloadSizeGb,
    active: isShareOpen(share),
  };
}

export async function getPublicShare(slug: string): Promise<PublicShare | null> {
  const share = await repo.getShareBySlug(slug);
  return share ? toPublicShare(share) : null;
}

/** True when `userId` owns the rental — used to give owners a free pass on their
 * own link (owners never pay to use their own seedbox). */
export async function isShareOwnedBy(slug: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const share = await repo.getShareBySlug(slug);
  return !!share && share.ownerAccountId === userId;
}

/**
 * Mint (or refresh) a free session pass for the rental's owner, so opening their
 * own /rent link isn't paywalled. Returns null when the caller isn't the owner.
 * Reuses one owner grant per owner, rotating its token each time.
 */
export async function mintOwnerPass(
  slug: string,
  ownerUserId: string
): Promise<{ cookie: { name: string; value: string }; grantId: string } | null> {
  const share = await repo.getShareBySlug(slug);
  if (!share || share.ownerAccountId !== ownerUserId) return null;

  const fingerprint = `owner:${ownerUserId}`;
  const token = generateGrantToken();
  const tokenHash = hashGrantToken(token);

  const existing = await repo.findActiveGrantByFingerprint(share.id, fingerprint);
  let grant: SeedboxShareGrant;
  if (existing) {
    await repo.updateGrantTokenHash(existing.id, tokenHash);
    grant = existing;
  } else {
    const expiresAt = new Date(
      Date.now() + Math.max(share.passWindowMinutes, 1440) * 60_000
    ).toISOString();
    grant = await repo.insertOwnerGrant({
      shareId: share.id,
      grantTokenHash: tokenHash,
      fingerprint,
      expiresAt,
    });
  }
  return { cookie: { name: passCookieName(share.slug), value: `${grant.id}.${token}` }, grantId: grant.id };
}

// ---------------------------------------------------------------------------
// Public: checkout → pending grant + CoinPay payment
// ---------------------------------------------------------------------------

export interface CheckoutResult {
  paymentUrl: string;
  grantId: string;
  /** Cookie the route should set (httpOnly). */
  cookie: { name: string; value: string };
}

export async function createCheckout(
  slug: string,
  opts: { blockchain?: string; fingerprint?: string | null; origin?: string }
): Promise<CheckoutResult> {
  const share = await repo.getShareBySlug(slug);
  if (!share) throw new RentalError('Rental not found', 404);
  if (!isShareOpen(share)) throw new RentalError('This rental is not currently available', 410);

  // If the owner set a payout wallet, forward the payment straight to it (on the
  // wallet's chain) so they're paid directly — CoinPay keeps its ~1% fee. With
  // no payout wallet, funds go to the platform's business wallet.
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
  const client = getCoinPayPortalClient();
  const payment = await client.createPayment({
    amount: share.priceUsd,
    blockchain,
    description: `Seedbox rental: ${share.title}`.slice(0, 140),
    metadata: { type: 'seedbox_share', shareId: share.id, grantId: grant.id },
    webhookUrl: base ? `${base}/api/webhooks/coinpayportal/share` : undefined,
    redirectUrl: base ? `${base}/rent/${share.slug}?grant=${grant.id}` : undefined,
    merchantWalletAddress: share.payoutWalletAddress ?? undefined,
  });

  await repo.setGrantPaymentId(grant.id, payment.payment.id);

  return {
    paymentUrl: payment.paymentUrl,
    grantId: grant.id,
    cookie: { name: passCookieName(share.slug), value: `${grant.id}.${token}` },
  };
}

function pickBlockchain(requested: string | undefined): CryptoBlockchain {
  if (requested && (LOW_FEE_BLOCKCHAINS as string[]).includes(requested)) {
    return requested as CryptoBlockchain;
  }
  return DEFAULT_BLOCKCHAIN;
}

// ---------------------------------------------------------------------------
// Public: session-pass resolution
// ---------------------------------------------------------------------------

export type PassResolution =
  | { ok: true; share: SeedboxShare; grant: SeedboxShareGrant }
  | { ok: false; status: number; message: string };

/**
 * Resolve a valid, paid, unexpired session pass for a share from its cookie
 * value. Used by every gated public route.
 */
export async function resolvePass(slug: string, cookieValue: string | undefined): Promise<PassResolution> {
  const share = await repo.getShareBySlug(slug);
  if (!share) return { ok: false, status: 404, message: 'Rental not found' };
  if (share.status === 'closed') return { ok: false, status: 410, message: 'This rental is closed' };

  const parsed = parsePassCookieValue(cookieValue);
  if (!parsed) return { ok: false, status: 402, message: 'Payment required' };

  const grant = await repo.getGrantById(parsed.grantId);
  if (!grant || grant.shareId !== share.id) {
    return { ok: false, status: 402, message: 'Payment required' };
  }
  if (!verifyGrantToken(parsed.token, grant.grantTokenHash)) {
    return { ok: false, status: 402, message: 'Payment required' };
  }
  if (grant.status !== 'paid') {
    return { ok: false, status: 402, message: 'Payment not confirmed yet' };
  }
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 402, message: 'Your session pass has expired' };
  }
  return { ok: true, share, grant };
}

/** Report a pass's status without requiring it be paid (for the poll endpoint). */
export async function getGrantStatus(
  slug: string,
  grantId: string
): Promise<{ status: SeedboxShareGrant['status']; expiresAt: string | null } | null> {
  const share = await repo.getShareBySlug(slug);
  if (!share) return null;
  const grant = await repo.getGrantById(grantId);
  if (!grant || grant.shareId !== share.id) return null;
  return { status: grant.status, expiresAt: grant.expiresAt };
}

// ---------------------------------------------------------------------------
// Public: add a download under a pass
// ---------------------------------------------------------------------------

export async function addDownload(
  share: SeedboxShare,
  grant: SeedboxShareGrant,
  magnet: string
): Promise<SeedboxShareDownload> {
  if (!isValidMagnet(magnet)) {
    throw new RentalError('That doesn’t look like a valid magnet link', 400);
  }
  const parsed = parseMagnet(magnet);
  if (!parsed) {
    throw new RentalError('Could not read the infohash from that magnet link', 400);
  }

  const existing = await repo.countDownloadsByGrant(grant.id);
  if (existing >= share.maxDownloadsPerPass) {
    throw new RentalError(
      `This pass allows up to ${share.maxDownloadsPerPass} download${share.maxDownloadsPerPass === 1 ? '' : 's'}.`,
      403
    );
  }

  const config = await loadAccountSeedboxConfig(share.ownerAccountId);
  if (!config?.http) {
    throw new RentalError('This seedbox can’t accept downloads right now', 502);
  }

  const result = await sendTorrentToSeedbox(magnet, parsed.name ?? '', 'http', config);
  if (!result.ok) {
    throw new RentalError(`Seedbox rejected the torrent: ${result.message}`, 502);
  }

  return repo.insertDownload({
    grantId: grant.id,
    shareId: share.id,
    infohash: parsed.infohash,
    name: parsed.name,
    magnet: magnet.trim(),
  });
}

// ---------------------------------------------------------------------------
// Public: list a pass's downloads with live progress
// ---------------------------------------------------------------------------

interface TorlinkEntry {
  id?: string;
  name?: string;
  status?: string;
  progress?: number;
  peers?: number;
  speed?: number;
}

export interface DownloadProgress {
  id: string;
  infohash: string;
  name: string | null;
  status: SeedboxShareDownload['status'];
  progress: number;
  peers: number;
  speed: number;
  ready: boolean;
}

async function fetchTorlinkStatus(config: SeedboxConfig): Promise<Map<string, TorlinkEntry> | null> {
  if (!config.http) return null;
  const url = `${config.http.baseUrl.replace(/\/+$/, '')}/status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: buildAuthHeaders(config.http),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { downloads?: TorlinkEntry[]; seeds?: TorlinkEntry[] };
    const map = new Map<string, TorlinkEntry>();
    for (const d of data.downloads ?? []) {
      if (d.id) map.set(d.id.toLowerCase(), { ...d, status: d.status ?? 'downloading' });
    }
    for (const s of data.seeds ?? []) {
      // A finished torrent moves to `seeds`; treat as complete.
      if (s.id) map.set(s.id.toLowerCase(), { ...s, status: 'seeding', progress: 100 });
    }
    return map;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function listDownloadsWithProgress(
  share: SeedboxShare,
  grant: SeedboxShareGrant
): Promise<DownloadProgress[]> {
  const downloads = await repo.listDownloadsByGrant(grant.id);
  if (downloads.length === 0) return [];

  const config = await loadAccountSeedboxConfig(share.ownerAccountId);
  const status = config ? await fetchTorlinkStatus(config) : null;

  const out: DownloadProgress[] = [];
  for (const d of downloads) {
    const live = status?.get(d.infohash.toLowerCase());
    const progress = Math.max(0, Math.min(100, typeof live?.progress === 'number' ? live.progress : 0));
    const seeding = live?.status === 'seeding';
    const complete = seeding || progress >= 100;
    const nextStatus: SeedboxShareDownload['status'] = complete
      ? 'complete'
      : live
        ? 'downloading'
        : d.status;
    const learnedName = live?.name && live.name !== '(unknown)' ? live.name : d.name;

    // Persist a learned name/status so streaming-scope checks work after the
    // renter navigates away and back (best effort; ignore write failures).
    if ((learnedName && learnedName !== d.name) || nextStatus !== d.status) {
      repo.updateDownloadMeta(d.id, { name: learnedName ?? undefined, status: nextStatus }).catch(() => {});
    }

    out.push({
      id: d.id,
      infohash: d.infohash,
      name: learnedName ?? null,
      status: nextStatus,
      progress,
      peers: live?.peers ?? 0,
      speed: live?.speed ?? 0,
      ready: complete,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public: payer-scoped streaming
// ---------------------------------------------------------------------------

function topSegment(filePath: string): string {
  const seg = filePath.split('/').filter(Boolean)[0] ?? '';
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/**
 * A pass may stream a file only if it belongs to a torrent that pass added.
 * torlink saves each torrent under its `name`, so a file's top-level path
 * segment (or the whole single-file path) must match one of the grant's
 * download names.
 */
function pathAllowedForGrant(filePath: string, names: string[]): boolean {
  const top = topSegment(filePath).toLowerCase();
  const full = filePath.replace(/^\/+/, '').toLowerCase();
  return names.some((raw) => {
    const n = raw.toLowerCase();
    return top === n || full === n || full.startsWith(`${n}/`);
  });
}

export async function streamForPass(
  share: SeedboxShare,
  grant: SeedboxShareGrant,
  filePath: string,
  opts: StreamOptions
): Promise<Response> {
  const downloads = await repo.listDownloadsByGrant(grant.id);
  const names = downloads.map((d) => d.name).filter((n): n is string => Boolean(n));
  if (names.length === 0 || !pathAllowedForGrant(filePath, names)) {
    return jsonError('That file isn’t part of your downloads', 403);
  }

  const config = await loadAccountSeedboxConfig(share.ownerAccountId);
  if (!config?.files) {
    return jsonError('This seedbox has no files server configured', 404);
  }
  return streamSeedboxFile(config.files, filePath, opts);
}

// ---------------------------------------------------------------------------
// Public: list playable files under a completed download
// ---------------------------------------------------------------------------

const VIDEO_EXTS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts', 'flv', 'wmv', 'mpg', 'mpeg', 'm2ts', 'ogv',
]);
const AUDIO_EXTS = new Set(['mp3', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wav', 'wma']);

export interface PlayableFile {
  path: string;
  name: string;
  kind: 'video' | 'audio';
}

function mediaKind(name: string): 'video' | 'audio' | null {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return null;
}

interface DirEntry {
  name?: string;
  size?: number;
  is_dir?: boolean;
  type?: string;
}

/** List a directory on the seedbox files server. Returns null on any failure. */
async function listSeedboxDir(
  files: NonNullable<SeedboxConfig['files']>,
  relDir: string
): Promise<DirEntry[] | null> {
  const base = files.baseUrl.replace(/\/+$/, '');
  const encoded = relDir
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
  const url = encoded ? `${base}/${encoded}/` : `${base}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: filesAuthHeaders(files),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { entries?: DirEntry[] };
    return Array.isArray(json.entries) ? json.entries : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Walk a torrent's folder collecting playable media files (bounded depth). */
async function walkPlayableFiles(
  files: NonNullable<SeedboxConfig['files']>,
  relDir: string,
  depth: number,
  acc: PlayableFile[]
): Promise<void> {
  if (depth > 3 || acc.length >= 200) return;
  const entries = await listSeedboxDir(files, relDir);
  if (!entries) return;
  for (const e of entries) {
    const name = e.name ?? '';
    if (!name) continue;
    const childPath = relDir ? `${relDir}/${name}` : name;
    const kind = mediaKind(name);
    const looksDir = e.is_dir === true || e.type === 'dir' || (kind == null && e.size == null);
    if (kind) {
      acc.push({ path: childPath, name, kind });
    } else if (looksDir) {
      await walkPlayableFiles(files, childPath, depth + 1, acc);
    }
  }
}

export async function listDownloadFiles(
  slug: string,
  cookieValue: string | undefined,
  downloadId: string
): Promise<{ ok: true; files: PlayableFile[] } | { ok: false; status: number; message: string }> {
  const pass = await resolvePass(slug, cookieValue);
  if (!pass.ok) return { ok: false, status: pass.status, message: pass.message };

  const download = await repo.getDownloadById(downloadId);
  if (!download || download.grantId !== pass.grant.id) {
    return { ok: false, status: 404, message: 'Download not found' };
  }
  if (!download.name) {
    return { ok: true, files: [] }; // torrent name not learned yet (still resolving)
  }

  const config = await loadAccountSeedboxConfig(pass.share.ownerAccountId);
  if (!config?.files) return { ok: false, status: 404, message: 'No files server configured' };

  const acc: PlayableFile[] = [];
  await walkPlayableFiles(config.files, download.name, 0, acc);
  acc.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, files: acc };
}

// ---------------------------------------------------------------------------
// Webhook: confirm payment
// ---------------------------------------------------------------------------

export interface WebhookOutcome {
  handled: boolean;
  action: string;
  grantId?: string;
}

export async function handleShareWebhook(payload: {
  type: string;
  paymentId: string;
  amountCrypto?: string | null;
  currency?: string | null;
  blockchain?: string | null;
  txHash?: string | null;
}): Promise<WebhookOutcome> {
  const grant = await repo.getGrantByPaymentId(payload.paymentId);
  if (!grant) return { handled: false, action: 'grant_not_found' };

  switch (payload.type) {
    case 'payment.confirmed':
    case 'payment.forwarded': {
      if (grant.status === 'paid') {
        return { handled: true, action: 'already_paid', grantId: grant.id };
      }
      const share = await repo.getShareById(grant.shareId);
      const windowMinutes = share?.passWindowMinutes ?? 1440;
      const expiresAt = new Date(Date.now() + windowMinutes * 60_000).toISOString();
      await repo.markGrantPaid(grant.id, {
        expiresAt,
        amountCrypto: payload.amountCrypto ?? null,
        cryptoCurrency: payload.currency ?? null,
        blockchain: payload.blockchain ?? null,
        txHash: payload.txHash ?? null,
        webhookEventType: payload.type,
      });
      await repo.incrementShareEarnings(grant.shareId, grant.amountUsd);
      return { handled: true, action: 'paid', grantId: grant.id };
    }
    case 'payment.failed':
    case 'payment.expired': {
      if (grant.status === 'pending') {
        await repo.markGrantStatus(grant.id, 'expired');
      }
      return { handled: true, action: 'expired', grantId: grant.id };
    }
    default:
      return { handled: true, action: `ignored:${payload.type}`, grantId: grant.id };
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class RentalError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RentalError';
    this.status = status;
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
