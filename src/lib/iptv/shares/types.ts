/**
 * IPTV Resale (pay-per-game) — shared types.
 *
 * A "share" is an owner's public, priced resale of one of their IPTV playlists.
 * A "grant" is a paid pass bought by an anonymous visitor. A "session" is one live
 * stream under a pass — sessions are what enforce the upstream provider's
 * concurrency cap.
 *
 * Mirrors the seedbox rental types; see src/lib/seedbox/shares/types.ts.
 */

export type IptvShareStatus = 'active' | 'paused' | 'expired' | 'closed';
export type IptvGrantStatus = 'pending' | 'paid' | 'expired' | 'refunded';

export interface IptvShare {
  id: string;
  slug: string;
  ownerAccountId: string;
  playlistId: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  maxConcurrentStreams: number;
  maxActivePasses: number;
  /** null means every channel in the playlist. */
  allowedChannelIds: string[] | null;
  status: IptvShareStatus;
  expiresAt: string | null;
  payoutWalletAddress: string | null;
  payoutBlockchain: string | null;
  viewCount: number;
  sessionCount: number;
  earningsUsd: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * What an anonymous visitor may see.
 *
 * Deliberately omits playlistId and everything derived from the owner's actual
 * subscription: the entire point of proxying is that a buyer never learns the
 * upstream M3U credentials they are paying to borrow.
 */
export interface PublicIptvShare {
  slug: string;
  title: string;
  description: string | null;
  priceUsd: number;
  passWindowMinutes: number;
  channelCount: number;
  active: boolean;
  /** Whether a pass bought right now could actually start watching. */
  capacityAvailable: boolean;
}

export interface IptvShareGrant {
  id: string;
  shareId: string;
  coinpayportalPaymentId: string | null;
  grantTokenHash: string;
  status: IptvGrantStatus;
  amountUsd: number;
  viewerFingerprint: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IptvShareSession {
  id: string;
  grantId: string;
  shareId: string;
  channelId: string;
  channelName: string | null;
  lastSeenAt: string;
  startedAt: string;
  endedAt: string | null;
}

export interface IptvShareInput {
  playlistId: string;
  title?: string;
  description?: string | null;
  priceUsd?: number;
  passWindowMinutes?: number;
  maxConcurrentStreams?: number;
  maxActivePasses?: number;
  allowedChannelIds?: string[] | null;
  expiresAt?: string | null;
  payoutWalletAddress?: string | null;
  payoutBlockchain?: string | null;
  status?: IptvShareStatus;
}

export interface IptvCheckoutResult {
  paymentUrl: string;
  grantId: string;
  cookie: { name: string; value: string };
}
