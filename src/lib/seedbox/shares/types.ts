/**
 * Seedbox Rental (pay-per-watch) — shared types.
 *
 * A "share" is an owner's public, temporary rental of their seedbox. A "grant"
 * is a paid session pass bought by an anonymous visitor. A "download" is a
 * torrent that visitor added under their pass — the dynamic scope of what the
 * pass may stream. See docs/prds/seedbox-pay-per-watch.md.
 */

export type ShareStatus = 'active' | 'paused' | 'expired' | 'closed';
export type GrantStatus = 'pending' | 'paid' | 'expired' | 'refunded';
export type DownloadStatus = 'added' | 'downloading' | 'complete' | 'error';

export interface SeedboxShare {
  id: string;
  slug: string;
  ownerAccountId: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  maxDownloadsPerPass: number;
  maxDownloadSizeGb: number | null;
  status: ShareStatus;
  expiresAt: string | null;
  payoutWalletAddress: string | null;
  payoutBlockchain: string | null;
  viewCount: number;
  sessionCount: number;
  earningsUsd: number;
  createdAt: string;
  updatedAt: string;
}

/** Secret-free public view of a share (what an anonymous visitor may see). */
export interface PublicShare {
  slug: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  maxDownloadsPerPass: number;
  maxDownloadSizeGb: number | null;
  active: boolean;
}

export interface SeedboxShareGrant {
  id: string;
  shareId: string;
  coinpayportalPaymentId: string | null;
  grantTokenHash: string;
  status: GrantStatus;
  amountUsd: number;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface SeedboxShareDownload {
  id: string;
  grantId: string;
  shareId: string;
  infohash: string;
  name: string | null;
  magnet: string;
  status: DownloadStatus;
  createdAt: string;
}

/** Input for creating/updating a rental from the owner UI. */
export interface ShareInput {
  title?: string;
  description?: string | null;
  priceUsd?: number;
  passWindowMinutes?: number;
  maxDownloadsPerPass?: number;
  maxDownloadSizeGb?: number | null;
  expiresAt?: string | null;
  payoutWalletAddress?: string | null;
  payoutBlockchain?: string | null;
  status?: ShareStatus;
}
