/**
 * VOD Monetization — shared types. See docs/prds/vod-monetization.md.
 *
 * A "provider" is an owner's connected VOD source (Xtream / M3U / HTTP media
 * library / JSON manifest) with pricing. A "title" is one synced catalog item.
 * A "grant" is paid access — a whole-catalog weekly pass or a single title.
 */

export type SourceKind = 'xtream' | 'm3u' | 'http_library' | 'manifest';
export type SourceAuthKind = 'none' | 'bearer' | 'basic' | 'header';
export type AccessMode = 'stream' | 'download';
export type ProviderStatus = 'active' | 'paused' | 'closed';
export type TitleKind = 'movie' | 'series' | 'live' | 'other';
export type GrantKind = 'weekly' | 'title';
export type GrantStatus = 'pending' | 'paid' | 'expired' | 'refunded';

export interface VodProvider {
  id: string;
  slug: string;
  ownerAccountId: string;
  title: string;
  description: string | null;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  sourceUsername: string | null;
  sourceAuth: SourceAuthKind;
  sourceHeaderName: string | null;
  hasPassword: boolean;
  hasToken: boolean;
  weeklyPriceUsd: number | null;
  perTitlePriceUsd: number | null;
  passWindowMinutes: number;
  defaultAccessMode: AccessMode;
  payoutWalletAddress: string | null;
  payoutBlockchain: string | null;
  status: ProviderStatus;
  catalogCount: number;
  lastSyncedAt: string | null;
  sessionCount: number;
  earningsUsd: number;
  createdAt: string;
  updatedAt: string;
}

/** Secret-free public view of a provider. */
export interface PublicProvider {
  slug: string;
  title: string;
  description: string | null;
  weeklyPriceUsd: number | null;
  perTitlePriceUsd: number | null;
  passWindowMinutes: number;
  catalogCount: number;
  active: boolean;
}

export interface VodTitle {
  id: string;
  providerId: string;
  externalId: string;
  title: string;
  kind: TitleKind;
  posterUrl: string | null;
  plot: string | null;
  rating: string | null;
  category: string | null;
  streamRef: string;
  extension: string | null;
  accessMode: AccessMode | null;
  priceUsd: number | null;
  createdAt: string;
}

/** Public (secret-free) title card. */
export interface PublicTitle {
  id: string;
  title: string;
  kind: TitleKind;
  posterUrl: string | null;
  plot: string | null;
  rating: string | null;
  category: string | null;
}

export interface VodGrant {
  id: string;
  providerId: string;
  grantKind: GrantKind;
  titleId: string | null;
  accessMode: AccessMode;
  coinpayportalPaymentId: string | null;
  viewerKeyHash: string;
  status: GrantStatus;
  amountUsd: number;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Owner input for creating/updating a provider (plaintext secrets). */
export interface ProviderInput {
  title?: string;
  description?: string | null;
  sourceKind?: SourceKind;
  sourceUrl?: string | null;
  sourceUsername?: string | null;
  sourcePassword?: string | null; // secret; blank = keep
  sourceAuth?: SourceAuthKind;
  sourceToken?: string | null; // secret; blank = keep
  sourceHeaderName?: string | null;
  weeklyPriceUsd?: number | null;
  perTitlePriceUsd?: number | null;
  passWindowMinutes?: number;
  defaultAccessMode?: AccessMode;
  payoutWalletAddress?: string | null;
  payoutBlockchain?: string | null;
  status?: ProviderStatus;
}

/** One catalog item produced by a source adapter during sync. */
export interface CatalogItem {
  externalId: string;
  title: string;
  kind: TitleKind;
  posterUrl?: string | null;
  plot?: string | null;
  rating?: string | null;
  category?: string | null;
  streamRef: string;
  extension?: string | null;
}
