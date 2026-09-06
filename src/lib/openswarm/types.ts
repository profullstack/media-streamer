/** Shapes the hub stores and returns. The wire records live in `records.ts`. */
import type { Lane, PartyKind } from './lanes';

export type Visibility = 'public' | 'private';
export type Basis = 'own' | 'licensed' | 'open-license' | 'public-domain' | 'personal';
export type AttestationStatus = 'claimed' | 'honoured' | 'voided';
export type OfferStatus = 'unpaid' | 'pending' | 'active' | 'settled' | 'voided';
export type LeaseStatus = 'fetching' | 'proven' | 'lapsed' | 'abandoned' | 'ended' | 'voided';

export const BASES: readonly Basis[] = ['own', 'licensed', 'open-license', 'public-domain', 'personal'];

export interface Party {
  key: string;
  kind: PartyKind;
  operatorKey: string | null;
  label: string | null;
  payoutAddress: string | null;
  payoutNetwork: string | null;
  balanceUsd: string;
  paidOutUsd: string;
  proven: number;
  failed: number;
  abandoned: number;
  honoured: number;
  voided: number;
  /** paid2seed §6.3: proven - 2·failed - 3·abandoned, floored at zero. */
  seederStanding: number;
  /** honoured - 3·voided, floored at zero. */
  requesterStanding: number;
}

export interface Subject {
  infohashV1?: string | null;
  infohashV2?: string | null;
  file?: string | null;
  channel?: string | null;
}

export interface Attestation {
  id: string;
  requesterKey: string;
  visibility: Visibility;
  basis: Basis;
  license: string | null;
  description: string | null;
  noticeEndpoint: string | null;
  subject: Subject;
  readme: string;
  readmeSha256: string;
  status: AttestationStatus;
  claimWindowEndsAt: string | null;
  createdAt: string;
}

export interface Offer {
  id: string;
  attestationId: string;
  requesterKey: string;
  visibility: Visibility;
  sizeBytes: number;
  days: number;
  seedersMin: number;
  seedersMax: number;
  priceUsdPerGibMonth: string;
  budgetUsd: string;
  spentUsd: string;
  feeUsd: string;
  proofEveryHours: number;
  trackers: string[];
  status: OfferStatus;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface Lease {
  id: string;
  offerId: string;
  seederKey: string;
  slot: number;
  priceUsdPerGibMonth: string;
  lane: Lane;
  earnedUsd: string;
  periodsProven: number;
  periodsFailed: number;
  status: LeaseStatus;
  startsAt: string;
  endsAt: string;
}

export interface MarketRow {
  offer: Offer;
  basis: Basis;
  visibility: Visibility;
  description: string | null;
  license: string | null;
  summary: string;
  subject: Subject;
  slotsFree: number;
  /** What a seeder would earn holding this for the whole term. */
  projectedUsd: string;
  requesterKind: PartyKind;
}
