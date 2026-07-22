/**
 * VOD Monetization service — orchestration.
 *
 * Provider side: connect a VOD source, price it, sync the catalog.
 * Viewer side (anonymous): browse the catalog, pay $1/week (whole catalog) or
 * $1 per title (stream or download, provider's choice), then watch/download.
 * Access is tied to an anonymous viewer cookie. See docs/prds/vod-monetization.md.
 */

import type { CryptoBlockchain } from '@/lib/coinpayportal/types';
import { getCoinPayPortalClient } from '@/lib/coinpayportal/client';
import { encryptOptional } from '@/lib/seedbox/crypto';
import { streamRemoteMedia, type StreamOptions } from '@/lib/seedbox/stream';
import { validateStreamUrl } from '@/lib/iptv-proxy/iptv-proxy';
import * as adapters from './adapters';
import { resolveSource } from './config';
import { VodError } from './errors';
import { generateProviderSlug, generateViewerKey, hashViewerKey, vodViewerCookieName } from './pass';
import * as repo from './repository';
import { syncProviderCatalog, type SyncResult } from './sync';
import type {
  AccessMode,
  ProviderInput,
  PublicProvider,
  PublicTitle,
  SourceKind,
  VodGrant,
  VodProvider,
  VodTitle,
} from './types';

const LOW_FEE_BLOCKCHAINS: CryptoBlockchain[] = ['SOL', 'USDC_SOL', 'POL', 'USDC_POL'];
const DEFAULT_BLOCKCHAIN: CryptoBlockchain = 'SOL';
const MIN_PRICE = 0.25;
const MAX_PRICE = 1000;
const RESERVED_SLUGS = new Set(['manage', 'new', 'api']);

function appBaseUrl(origin?: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || origin || '').replace(/\/+$/, '');
}

function clampPriceOrNull(value: number | null | undefined, fallback: number | null): number | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  if (Number.isNaN(value)) return fallback;
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, Math.round(value * 100) / 100));
}

function pickBlockchain(requested: string | undefined): CryptoBlockchain {
  if (requested && (LOW_FEE_BLOCKCHAINS as string[]).includes(requested)) {
    return requested as CryptoBlockchain;
  }
  return DEFAULT_BLOCKCHAIN;
}

function uniqueSlug(): string {
  let slug = generateProviderSlug();
  while (RESERVED_SLUGS.has(slug)) slug = generateProviderSlug();
  return slug;
}

// ---------------------------------------------------------------------------
// Provider CRUD (owner)
// ---------------------------------------------------------------------------

function validSourceKind(kind: string | undefined): kind is SourceKind {
  return kind === 'xtream' || kind === 'm3u' || kind === 'http_library' || kind === 'manifest';
}

export async function createProvider(ownerId: string, input: ProviderInput): Promise<VodProvider> {
  if (!validSourceKind(input.sourceKind)) {
    throw new VodError('Choose a source type (xtream, m3u, http_library, manifest)', 400);
  }
  if (!input.sourceUrl?.trim()) {
    throw new VodError('A source URL is required', 400);
  }
  if (input.sourceKind === 'xtream' && (!input.sourceUsername?.trim() || !input.sourcePassword?.trim())) {
    throw new VodError('Xtream sources need a username and password', 400);
  }

  return repo.insertProvider({
    slug: uniqueSlug(),
    owner_account_id: ownerId,
    title: (input.title ?? 'My VOD library').slice(0, 120),
    description: input.description?.slice(0, 2000) ?? null,
    source_kind: input.sourceKind,
    source_url: input.sourceUrl.trim(),
    source_username: input.sourceUsername?.trim() || null,
    source_password_encrypted: encryptOptional(input.sourcePassword),
    source_auth: input.sourceAuth ?? 'none',
    source_token_encrypted: encryptOptional(input.sourceToken),
    source_header_name: input.sourceHeaderName?.trim() || null,
    weekly_price_usd: clampPriceOrNull(input.weeklyPriceUsd, 1),
    per_title_price_usd: clampPriceOrNull(input.perTitlePriceUsd, 1),
    pass_window_minutes: Math.max(60, Math.min(43200, input.passWindowMinutes ?? 10080)),
    default_access_mode: input.defaultAccessMode ?? 'stream',
    payout_wallet_address: input.payoutWalletAddress?.trim() || null,
    payout_blockchain: input.payoutBlockchain?.trim() || null,
  });
}

export function listProviders(ownerId: string): Promise<VodProvider[]> {
  return repo.listProvidersByOwner(ownerId);
}

export function getProvider(id: string, ownerId: string): Promise<VodProvider | null> {
  return repo.getProviderByIdForOwner(id, ownerId);
}

export async function updateProvider(
  id: string,
  ownerId: string,
  input: ProviderInput
): Promise<VodProvider | null> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.slice(0, 120);
  if (input.description !== undefined) patch.description = input.description?.slice(0, 2000) ?? null;
  if (input.sourceUrl !== undefined) patch.source_url = input.sourceUrl?.trim() || null;
  if (input.sourceUsername !== undefined) patch.source_username = input.sourceUsername?.trim() || null;
  if (input.sourceAuth !== undefined) patch.source_auth = input.sourceAuth;
  if (input.sourceHeaderName !== undefined) patch.source_header_name = input.sourceHeaderName?.trim() || null;
  // Secrets: only overwrite when a non-empty value is provided.
  if (input.sourcePassword) patch.source_password_encrypted = encryptOptional(input.sourcePassword);
  if (input.sourceToken) patch.source_token_encrypted = encryptOptional(input.sourceToken);
  if (input.weeklyPriceUsd !== undefined) patch.weekly_price_usd = clampPriceOrNull(input.weeklyPriceUsd, 1);
  if (input.perTitlePriceUsd !== undefined) patch.per_title_price_usd = clampPriceOrNull(input.perTitlePriceUsd, 1);
  if (input.passWindowMinutes !== undefined) {
    patch.pass_window_minutes = Math.max(60, Math.min(43200, input.passWindowMinutes));
  }
  if (input.defaultAccessMode !== undefined) patch.default_access_mode = input.defaultAccessMode;
  if (input.payoutWalletAddress !== undefined) patch.payout_wallet_address = input.payoutWalletAddress?.trim() || null;
  if (input.payoutBlockchain !== undefined) patch.payout_blockchain = input.payoutBlockchain?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  return repo.updateProvider(id, ownerId, patch);
}

export function deleteProvider(id: string, ownerId: string): Promise<boolean> {
  return repo.deleteProvider(id, ownerId);
}

/** Sync after verifying the caller owns the provider. */
export async function syncProvider(id: string, ownerId: string): Promise<SyncResult> {
  const provider = await repo.getProviderByIdForOwner(id, ownerId);
  if (!provider) throw new VodError('Provider not found', 404);
  return syncProviderCatalog(provider.id);
}

export async function getProviderActivity(
  id: string,
  ownerId: string
): Promise<{ provider: VodProvider; grants: VodGrant[] } | null> {
  const provider = await repo.getProviderByIdForOwner(id, ownerId);
  if (!provider) return null;
  const grants = await repo.listGrantsByProvider(provider.id);
  return { provider, grants };
}

// ---------------------------------------------------------------------------
// Public: provider + catalog
// ---------------------------------------------------------------------------

export function isProviderOpen(p: VodProvider): boolean {
  return p.status === 'active';
}

export function toPublicProvider(p: VodProvider): PublicProvider {
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    weeklyPriceUsd: p.weeklyPriceUsd,
    perTitlePriceUsd: p.perTitlePriceUsd,
    passWindowMinutes: p.passWindowMinutes,
    catalogCount: p.catalogCount,
    active: isProviderOpen(p),
  };
}

export async function getPublicProvider(slug: string): Promise<PublicProvider | null> {
  const p = await repo.getProviderBySlug(slug);
  return p ? toPublicProvider(p) : null;
}

export async function isProviderOwnedBy(slug: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const p = await repo.getProviderBySlug(slug);
  return !!p && p.ownerAccountId === userId;
}

function toPublicTitle(t: VodTitle): PublicTitle {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    posterUrl: t.posterUrl,
    plot: t.plot,
    rating: t.rating,
    category: t.category,
  };
}

export async function browseCatalog(
  slug: string,
  opts: { q?: string; page: number; pageSize: number }
): Promise<{ titles: PublicTitle[]; total: number; page: number; pageSize: number } | null> {
  const p = await repo.getProviderBySlug(slug);
  if (!p) return null;
  const pageSize = Math.max(1, Math.min(60, opts.pageSize));
  const page = Math.max(1, opts.page);
  const { titles, total } = await repo.listTitles(p.id, {
    q: opts.q?.trim() || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { titles: titles.map(toPublicTitle), total, page, pageSize };
}

// ---------------------------------------------------------------------------
// Public: checkout
// ---------------------------------------------------------------------------

export interface VodCheckoutResult {
  paymentUrl: string;
  grantId: string;
  cookie: { name: string; value: string };
}

export async function createCheckout(
  slug: string,
  opts: {
    kind: 'weekly' | 'title';
    titleId?: string;
    viewerKey?: string;
    blockchain?: string;
    origin?: string;
  }
): Promise<VodCheckoutResult> {
  const provider = await repo.getProviderBySlug(slug);
  if (!provider) throw new VodError('Provider not found', 404);
  if (!isProviderOpen(provider)) throw new VodError('This library is not currently available', 410);

  let amount: number;
  let accessMode: AccessMode;
  let titleId: string | null = null;

  if (opts.kind === 'weekly') {
    if (provider.weeklyPriceUsd == null) throw new VodError('A weekly pass is not offered here', 400);
    amount = provider.weeklyPriceUsd;
    accessMode = 'stream';
  } else {
    if (!opts.titleId) throw new VodError('A title is required', 400);
    const title = await repo.getTitleForProvider(opts.titleId, provider.id);
    if (!title) throw new VodError('Title not found', 404);
    const price = title.priceUsd ?? provider.perTitlePriceUsd;
    if (price == null) throw new VodError('Per-title purchase is not offered here', 400);
    amount = price;
    accessMode = title.accessMode ?? provider.defaultAccessMode;
    titleId = title.id;
  }

  const viewerKey = opts.viewerKey || generateViewerKey();
  const grant = await repo.insertPendingGrant({
    providerId: provider.id,
    grantKind: opts.kind,
    titleId,
    accessMode,
    viewerKeyHash: hashViewerKey(viewerKey),
    amountUsd: amount,
  });

  // Forward straight to the provider's payout wallet (on its chain) when set, so
  // they're paid directly — CoinPay keeps its ~1% fee. Otherwise funds land in
  // the platform's business wallet.
  const blockchain = provider.payoutWalletAddress
    ? pickBlockchain(provider.payoutBlockchain ?? undefined)
    : pickBlockchain(opts.blockchain);

  const base = appBaseUrl(opts.origin);
  const payment = await getCoinPayPortalClient().createPayment({
    amount,
    blockchain,
    description: `${provider.title}: ${opts.kind === 'weekly' ? 'weekly pass' : 'title'}`.slice(0, 140),
    metadata: { type: 'vod', providerId: provider.id, grantId: grant.id },
    webhookUrl: base ? `${base}/api/webhooks/coinpayportal/vod` : undefined,
    redirectUrl: base ? `${base}/vod/${provider.slug}?grant=${grant.id}` : undefined,
    merchantWalletAddress: provider.payoutWalletAddress ?? undefined,
  });
  await repo.setGrantPaymentId(grant.id, payment.payment.id);

  return {
    paymentUrl: payment.paymentUrl,
    grantId: grant.id,
    cookie: { name: vodViewerCookieName(provider.slug), value: viewerKey },
  };
}

export async function getGrantStatus(
  slug: string,
  grantId: string
): Promise<{ status: VodGrant['status']; expiresAt: string | null } | null> {
  const provider = await repo.getProviderBySlug(slug);
  if (!provider) return null;
  const grant = await repo.getGrantById(grantId);
  if (!grant || grant.providerId !== provider.id) return null;
  return { status: grant.status, expiresAt: grant.expiresAt };
}

// ---------------------------------------------------------------------------
// Public: access resolution
// ---------------------------------------------------------------------------

export interface ViewerAccess {
  weeklyActive: boolean;
  /** titleId → best access mode held (download implies stream). */
  titleModes: Record<string, AccessMode>;
}

export async function resolveAccess(providerId: string, viewerKey: string | undefined): Promise<ViewerAccess> {
  if (!viewerKey) return { weeklyActive: false, titleModes: {} };
  const grants = await repo.listActiveGrantsForViewer(providerId, hashViewerKey(viewerKey));
  const access: ViewerAccess = { weeklyActive: false, titleModes: {} };
  for (const g of grants) {
    if (g.grantKind === 'weekly') {
      access.weeklyActive = true;
    } else if (g.titleId) {
      const cur = access.titleModes[g.titleId];
      // download beats stream
      access.titleModes[g.titleId] = cur === 'download' ? cur : g.accessMode;
    }
  }
  return access;
}

/** Public access summary for the page (what the viewer can play/download). */
export async function getAccessSummary(
  slug: string,
  viewerKey: string | undefined
): Promise<{ weeklyActive: boolean; titles: { id: string; mode: AccessMode }[] } | null> {
  const provider = await repo.getProviderBySlug(slug);
  if (!provider) return null;
  const access = await resolveAccess(provider.id, viewerKey);
  return {
    weeklyActive: access.weeklyActive,
    titles: Object.entries(access.titleModes).map(([id, mode]) => ({ id, mode })),
  };
}

// ---------------------------------------------------------------------------
// Public: streaming / download
// ---------------------------------------------------------------------------

async function resolveTitleStream(
  provider: VodProvider,
  title: VodTitle
): Promise<adapters.ResolvedStream> {
  const row = await repo.getProviderSourceRow(provider.id);
  const source = row ? resolveSource(row) : null;
  if (!source) throw new VodError('This library’s source is not configured', 502);
  const resolved = await adapters.resolveStream(source, {
    streamRef: title.streamRef,
    extension: title.extension,
    title: title.title,
  });
  if (!resolved) throw new VodError('Could not resolve this title', 502);
  if (!validateStreamUrl(resolved.url, process.env.NODE_ENV === 'production')) {
    throw new VodError('This title’s stream URL is not allowed', 403);
  }
  return resolved;
}

export async function streamTitle(
  slug: string,
  viewerKey: string | undefined,
  titleId: string,
  opts: StreamOptions,
  currentUserId?: string | null
): Promise<Response> {
  const provider = await repo.getProviderBySlug(slug);
  if (!provider) return jsonError('Provider not found', 404);
  if (provider.status === 'closed') return jsonError('This library is closed', 410);
  const title = await repo.getTitleForProvider(titleId, provider.id);
  if (!title) return jsonError('Title not found', 404);

  const isOwner = !!currentUserId && currentUserId === provider.ownerAccountId;
  if (!isOwner) {
    const access = await resolveAccess(provider.id, viewerKey);
    const allowed = access.weeklyActive || Boolean(access.titleModes[title.id]);
    if (!allowed) return jsonError('Payment required', 402);
  }

  try {
    const resolved = await resolveTitleStream(provider, title);
    return streamRemoteMedia(resolved, opts);
  } catch (error) {
    if (error instanceof VodError) return jsonError(error.message, error.status);
    const detail = error instanceof Error ? error.message : String(error);
    return jsonError(detail, 502);
  }
}

export async function downloadTitle(
  slug: string,
  viewerKey: string | undefined,
  titleId: string,
  currentUserId?: string | null
): Promise<Response> {
  const provider = await repo.getProviderBySlug(slug);
  if (!provider) return jsonError('Provider not found', 404);
  const title = await repo.getTitleForProvider(titleId, provider.id);
  if (!title) return jsonError('Title not found', 404);

  const isOwner = !!currentUserId && currentUserId === provider.ownerAccountId;
  if (!isOwner) {
    const access = await resolveAccess(provider.id, viewerKey);
    if (access.titleModes[title.id] !== 'download') {
      return jsonError('A download purchase is required for this title', 402);
    }
  }

  let resolved: adapters.ResolvedStream;
  try {
    resolved = await resolveTitleStream(provider, title);
  } catch (error) {
    if (error instanceof VodError) return jsonError(error.message, error.status);
    return jsonError('Could not resolve title', 502);
  }

  let upstream: Response;
  try {
    upstream = await fetch(resolved.url, { headers: resolved.headers, redirect: 'follow' });
  } catch {
    return jsonError('Could not reach the upstream file', 502);
  }
  if (!upstream.ok || !upstream.body) return jsonError('Upstream file unavailable', 502);

  const ext = title.extension ? `.${title.extension}` : '';
  const safeName = title.title.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'download';
  const headers = new Headers();
  const ct = upstream.headers.get('content-type');
  const cl = upstream.headers.get('content-length');
  if (ct) headers.set('content-type', ct);
  if (cl) headers.set('content-length', cl);
  headers.set('content-disposition', `attachment; filename="${safeName}${ext}"`);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(upstream.body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface WebhookOutcome {
  handled: boolean;
  action: string;
  grantId?: string;
}

export async function handleVodWebhook(payload: {
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
      if (grant.status === 'paid') return { handled: true, action: 'already_paid', grantId: grant.id };
      const provider = await repo.getProviderById(grant.providerId);
      // A per-title *download* purchase is permanent; everything else is windowed.
      const permanent = grant.grantKind === 'title' && grant.accessMode === 'download';
      const windowMin = provider?.passWindowMinutes ?? 10080;
      const expiresAt = permanent ? null : new Date(Date.now() + windowMin * 60_000).toISOString();
      await repo.markGrantPaid(grant.id, {
        expiresAt,
        amountCrypto: payload.amountCrypto ?? null,
        cryptoCurrency: payload.currency ?? null,
        blockchain: payload.blockchain ?? null,
        txHash: payload.txHash ?? null,
        webhookEventType: payload.type,
      });
      await repo.incrementProviderEarnings(grant.providerId, grant.amountUsd);
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

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
