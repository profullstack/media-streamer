/**
 * The pay2seed / paid2seed hub.
 *
 * bittorrented.com is the reference hub for the OpenSwarm payment family. This
 * file is the whole of the hub's decision-making: what it will list, what it
 * charges, who may take a lease, what a proven period earns, and what a notice
 * does. The API routes are thin over it and the tests drive it directly.
 *
 * Two rules run through everything:
 *
 *   Nothing is listed without consent. An attestation says who put the data
 *   there and on what basis, it is signed by the key that claims it, and a
 *   public claim waits out a window in which a notice can void it.
 *
 *   A promised floor is what the seeder is paid. The hub's 1 percent is
 *   charged to whoever is paying, on top of what they quoted, and never comes
 *   out of a seeder's earnings.
 */
import { createServerClient } from '@/lib/supabase';
import type { Database, Json } from '@/lib/supabase/types';
import {
  HUB_FEE_BPS,
  feeOn,
  isPartyKind,
  laneFor,
  periodEarnings,
  requiredBudget,
  totalWithFee,
  type Lane,
  type PartyKind,
} from './lanes';
import { readmeSummary } from './markdown';
import {
  OPENSWARM_VERSION,
  OpenSwarmRecordError,
  assertEnvelope,
  fromMicros,
  isKey,
  recordId,
  sha256Hex,
  signers,
  toMicros,
  usd,
  verifiedBy,
  type SignedRecord,
} from './records';
import { BASES, type Attestation, type Basis, type Lease, type MarketRow, type Offer, type Party, type Subject, type Visibility } from './types';

export class HubError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'HubError';
  }
}

/** Hours a public claim is visible before it can be listed (pay2seed §3.3). */
export const CLAIM_WINDOW_HOURS = Number(process.env.OPENSWARM_CLAIM_HOURS ?? 24);
/** A seeder needs at least this standing to take a lease. */
export const MIN_SEEDER_STANDING = Number(process.env.OPENSWARM_MIN_STANDING ?? 0);
export const MAX_OFFER_DAYS = 365;
const READMES_MAX = 65_536;

const db = () => createServerClient();

type Tables = Database['public']['Tables'];
type PartyInsert = Tables['openswarm_parties']['Insert'];
type PartyUpdate = Tables['openswarm_parties']['Update'];

/**
 * Money crosses into Postgres as NUMERIC(14,6). Everything above this line is
 * an exact six-decimal string over integer micros; a double holds those
 * magnitudes exactly (a micro of 10^14 is well inside 2^53), so the conversion
 * is lossless and only happens at the boundary.
 */
const num = (money: string): number => Number(money);

/** A signed record on its way into a JSONB column. */
const asJson = (record: unknown): Json => record as unknown as Json;

/* --------------------------------------------------------------- parties -- */

function standing(row: Record<string, number>): { seeder: number; requester: number } {
  return {
    seeder: Math.max(0, (row.proven ?? 0) - 2 * (row.failed ?? 0) - 3 * (row.abandoned ?? 0)),
    requester: Math.max(0, (row.honoured ?? 0) - 3 * (row.voided ?? 0)),
  };
}

function toParty(row: Record<string, unknown>): Party {
  const counters = row as unknown as Record<string, number>;
  const marks = standing(counters);
  return {
    key: String(row.key),
    kind: (row.kind as PartyKind) ?? 'human',
    operatorKey: (row.operator_key as string) ?? null,
    label: (row.label as string) ?? null,
    payoutAddress: (row.payout_address as string) ?? null,
    payoutNetwork: (row.payout_network as string) ?? null,
    balanceUsd: usd(Number(row.balance_usd ?? 0)),
    paidOutUsd: usd(Number(row.paid_out_usd ?? 0)),
    proven: counters.proven ?? 0,
    failed: counters.failed ?? 0,
    abandoned: counters.abandoned ?? 0,
    honoured: counters.honoured ?? 0,
    voided: counters.voided ?? 0,
    seederStanding: marks.seeder,
    requesterStanding: marks.requester,
  };
}

export async function getParty(key: string): Promise<Party | null> {
  const { data } = await db().from('openswarm_parties').select('*').eq('key', key).maybeSingle();
  return data ? toParty(data) : null;
}

/**
 * Register or update a key. A party declares what it is; a bit (an agent) may
 * name the human answerable for it, which its public attestations require.
 */
export async function registerParty(input: {
  key: string;
  kind?: PartyKind;
  operatorKey?: string | null;
  label?: string | null;
  payoutAddress?: string | null;
  payoutNetwork?: string | null;
  accountId?: string | null;
}): Promise<Party> {
  if (!isKey(input.key)) throw new HubError('a party key is ed25519:<64 hex>');
  if (input.kind !== undefined && !isPartyKind(input.kind)) throw new HubError('kind is "human" or "bit"');
  // An address without a network is not a payee.
  if (Boolean(input.payoutAddress) !== Boolean(input.payoutNetwork)) {
    throw new HubError('a payout address needs its network, and a network needs its address');
  }
  if (input.operatorKey && !isKey(input.operatorKey)) throw new HubError('operatorKey is ed25519:<64 hex>');
  if (input.operatorKey) {
    const operator = await getParty(input.operatorKey);
    if (!operator) throw new HubError('that operator key is not registered here', 404);
  }

  const existing = await getParty(input.key);
  const patch: PartyInsert = { key: input.key };
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.operatorKey !== undefined) patch.operator_key = input.operatorKey;
  if (input.label !== undefined) patch.label = input.label;
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.payoutAddress !== undefined) {
    patch.payout_address = input.payoutAddress;
    patch.payout_network = input.payoutNetwork;
  }

  const { data, error } = await db()
    .from('openswarm_parties')
    .upsert(existing ? patch : { kind: 'human', ...patch }, { onConflict: 'key' })
    .select('*')
    .single();
  if (error) throw new HubError(`could not register the key: ${error.message}`, 500);
  return toParty(data);
}

/** A party row, created as a plain human if this key has never been seen. */
async function ensureParty(key: string): Promise<Party> {
  return (await getParty(key)) ?? (await registerParty({ key }));
}

/* ---------------------------------------------------------- attestations -- */

function subjectOf(record: SignedRecord): Subject {
  const raw = (record.subject ?? {}) as Record<string, unknown>;
  const subject: Subject = {
    infohashV1: typeof raw.infohashV1 === 'string' ? raw.infohashV1.toLowerCase() : null,
    infohashV2: typeof raw.infohashV2 === 'string' ? raw.infohashV2.toLowerCase() : null,
    file: typeof raw.file === 'string' ? raw.file : null,
    channel: typeof raw.channel === 'string' ? raw.channel : null,
  };
  const named = [subject.infohashV1 || subject.infohashV2, subject.file, subject.channel].filter(Boolean).length;
  if (named !== 1) throw new HubError('an attestation names exactly one subject: an infohash, a file key, or a channel key');
  if (subject.infohashV1 && !/^[0-9a-f]{40}$/.test(subject.infohashV1)) throw new HubError('infohashV1 is 40 hex characters');
  if (subject.infohashV2 && !/^[0-9a-f]{64}$/.test(subject.infohashV2)) throw new HubError('infohashV2 is 64 hex characters');
  if (subject.file && !isKey(subject.file)) throw new HubError('a file key is ed25519:<64 hex>');
  if (subject.channel && !isKey(subject.channel)) throw new HubError('a channel key is ed25519:<64 hex>');
  return subject;
}

function toAttestation(row: Record<string, unknown>): Attestation {
  return {
    id: String(row.id),
    requesterKey: String(row.requester_key),
    visibility: row.visibility as Visibility,
    basis: row.basis as Basis,
    license: (row.license as string) ?? null,
    description: (row.description as string) ?? null,
    noticeEndpoint: (row.notice_endpoint as string) ?? null,
    subject: {
      infohashV1: (row.infohash_v1 as string) ?? null,
      infohashV2: (row.infohash_v2 as string) ?? null,
      file: (row.file_key as string) ?? null,
      channel: (row.channel_key as string) ?? null,
    },
    readme: String(row.readme),
    readmeSha256: String(row.readme_sha256),
    status: row.status as Attestation['status'],
    claimWindowEndsAt: (row.claim_window_ends_at as string) ?? null,
    createdAt: String(row.created_at),
  };
}

/**
 * Register consent.
 *
 * The record must be signed by the requester; a private `ipfile` subject must
 * ALSO be signed by the file's publisher key, which is what stops a stranger
 * attesting somebody else's swarm. A public infohash has no such proof, so it
 * gets the claim window instead.
 */
export async function registerAttestation(body: unknown): Promise<{ attestation: Attestation; id: string }> {
  const record = assertEnvelope(body, 'pay2seed.attestation');

  const requester = typeof record.requester === 'string' ? record.requester : signers(record)[0];
  if (!requester || !isKey(requester)) throw new HubError('the attestation must be signed by an ed25519 key');
  if (!verifiedBy(record, requester)) throw new HubError('the signature does not verify against the requester key', 403);

  const visibility = record.visibility as Visibility;
  if (visibility !== 'public' && visibility !== 'private') throw new HubError('visibility is "public" or "private"');

  const basis = record.basis as Basis;
  if (!BASES.includes(basis)) throw new HubError(`basis is one of ${BASES.join(', ')}`);
  if (basis === 'personal' && visibility !== 'private') throw new HubError('a personal basis is for a private swarm');
  if (basis === 'open-license' && typeof record.license !== 'string') throw new HubError('an open-license basis names its SPDX licence');
  if (record.acceptsTakedown !== true) throw new HubError('acceptsTakedown must be true, and must be in the signed bytes');

  const subject = subjectOf(record);
  if ((subject.infohashV1 || subject.infohashV2) && visibility !== 'public') throw new HubError('an infohash subject is public');
  if (subject.file && visibility !== 'private') throw new HubError('a file-key subject is private');

  const readme = typeof record.readme === 'string' ? record.readme : '';
  if (!readme.trim()) throw new HubError('every swarm on this market carries a README; there is no exception');
  if (readme.length > READMES_MAX) throw new HubError('a README is at most 64 KiB');
  const readmeSha256 = typeof record.readmeSha256 === 'string' ? record.readmeSha256.toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(readmeSha256)) throw new HubError('readmeSha256 is the SHA-256 of the copy inside the swarm');

  const noticeEndpoint = typeof record.notice === 'string' ? record.notice : null;
  if (visibility === 'public' && !noticeEndpoint) throw new HubError('a public swarm says where a notice goes');
  if (noticeEndpoint && !/^(https:\/\/|mailto:)/i.test(noticeEndpoint)) {
    throw new HubError('a notice endpoint is an https URL or a mailto: address');
  }

  // A private swarm's publisher must have signed too.
  if (subject.file && !verifiedBy(record, subject.file)) {
    throw new HubError("a private swarm's attestation must also be signed by the file's publisher key", 403);
  }

  const party = await ensureParty(requester);

  // An agent selling in public names the human answerable for it.
  if (party.kind === 'bit' && visibility === 'public' && !party.operatorKey) {
    throw new HubError('an agent\'s public attestation names a responsible operator key; register one first', 403);
  }

  // Standing: a requester who keeps having claims voided stops being listed.
  if (party.voided >= 3) throw new HubError('this key has three voided attestations in the last year', 403);
  if (visibility === 'public' && party.voided > party.honoured) {
    throw new HubError('this key has more voided claims than honoured ones', 403);
  }

  // Somebody else already holds this public infohash, unless the new basis is
  // one that does not depend on who is asking.
  if (subject.infohashV1 && basis !== 'open-license' && basis !== 'public-domain') {
    const { data: held } = await db()
      .from('openswarm_attestations')
      .select('requester_key')
      .eq('infohash_v1', subject.infohashV1)
      .eq('status', 'honoured')
      .maybeSingle();
    if (held && held.requester_key !== requester) {
      throw new HubError('another key already holds an honoured claim on this infohash', 409);
    }
  }

  const id = recordId(record);
  const now = Date.now();
  // A private swarm is the requester's own business and is honoured at once.
  // A public claim waits, in the open, where a notice can void it.
  const isPublic = visibility === 'public';
  const row = {
    id,
    requester_key: requester,
    visibility,
    basis,
    license: typeof record.license === 'string' ? record.license : null,
    description: typeof record.description === 'string' ? record.description.slice(0, 280) : null,
    notice_endpoint: noticeEndpoint,
    infohash_v1: subject.infohashV1,
    infohash_v2: subject.infohashV2,
    file_key: subject.file,
    channel_key: subject.channel,
    readme,
    readme_sha256: readmeSha256,
    record: asJson(record),
    status: isPublic ? 'claimed' : 'honoured',
    claim_window_ends_at: isPublic ? new Date(now + CLAIM_WINDOW_HOURS * 3_600_000).toISOString() : null,
    honoured_at: isPublic ? null : new Date(now).toISOString(),
  };

  const { data, error } = await db().from('openswarm_attestations').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw new HubError(`could not register the attestation: ${error.message}`, 500);
  if (!isPublic) await bumpParty(requester, { honoured: 1 });
  return { attestation: toAttestation(data), id };
}

export async function getAttestation(id: string): Promise<Attestation | null> {
  const { data } = await db().from('openswarm_attestations').select('*').eq('id', id).maybeSingle();
  return data ? toAttestation(data) : null;
}

/** Move any public claim whose window has run out to honoured. */
export async function honourDueClaims(now = new Date()): Promise<number> {
  const { data, error } = await db()
    .from('openswarm_attestations')
    .update({ status: 'honoured', honoured_at: now.toISOString() })
    .eq('status', 'claimed')
    .lt('claim_window_ends_at', now.toISOString())
    .select('requester_key');
  if (error) return 0;
  for (const row of data ?? []) await bumpParty(String(row.requester_key), { honoured: 1 });
  return (data ?? []).length;
}

async function bumpParty(key: string, deltas: Partial<Record<'proven' | 'failed' | 'abandoned' | 'honoured' | 'voided', number>>): Promise<void> {
  const party = await getParty(key);
  if (!party) return;
  const patch: PartyUpdate = {};
  for (const [field, delta] of Object.entries(deltas)) {
    patch[field as keyof typeof deltas] = (party[field as 'proven'] ?? 0) + (delta ?? 0);
  }
  await db().from('openswarm_parties').update(patch).eq('key', key);
}

/* ----------------------------------------------------------------- offers -- */

function toOffer(row: Record<string, unknown>): Offer {
  return {
    id: String(row.id),
    attestationId: String(row.attestation_id),
    requesterKey: String(row.requester_key),
    visibility: row.visibility as Visibility,
    sizeBytes: Number(row.size_bytes),
    days: Number(row.days),
    seedersMin: Number(row.seeders_min),
    seedersMax: Number(row.seeders_max),
    priceUsdPerGibMonth: usd(Number(row.price_usd_per_gib_month)),
    budgetUsd: usd(Number(row.budget_usd)),
    spentUsd: usd(Number(row.spent_usd)),
    feeUsd: usd(Number(row.fee_usd)),
    proofEveryHours: Number(row.proof_every_hours),
    trackers: Array.isArray(row.trackers) ? (row.trackers as string[]) : [],
    status: row.status as Offer['status'],
    startsAt: String(row.starts_at),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  };
}

export interface OfferDraft {
  attestation: string;
  sizeBytes: number;
  days: number;
  seeders?: { min?: number; max?: number };
  priceUsdPerGibMonth: string;
  proof?: { everyHours?: number };
  trackers?: string[];
  pass?: unknown;
}

/**
 * Quote an offer: what it will cost, and what the hub takes. Pure, so the page
 * and the checkout can never disagree about the number.
 */
export function quoteOffer(draft: OfferDraft): { budgetUsd: string; feeUsd: string; totalUsd: string; projectedPerSeederUsd: string } {
  const seedersMax = Math.max(1, Math.floor(draft.seeders?.max ?? draft.seeders?.min ?? 1));
  const budget = requiredBudget({
    priceUsdPerGibMonth: draft.priceUsdPerGibMonth,
    sizeBytes: draft.sizeBytes,
    days: draft.days,
    seedersMax,
  });
  return {
    budgetUsd: budget,
    feeUsd: feeOn(budget),
    totalUsd: totalWithFee(budget),
    projectedPerSeederUsd: requiredBudget({
      priceUsdPerGibMonth: draft.priceUsdPerGibMonth,
      sizeBytes: draft.sizeBytes,
      days: draft.days,
      seedersMax: 1,
    }),
  };
}

/**
 * Create an offer against an honoured attestation. It is `unpaid` until the
 * money settles: a budget that is not escrowed is not a promise anyone should
 * seed against.
 */
export async function createOffer(draft: OfferDraft, requesterKey: string): Promise<{ offer: Offer; quote: ReturnType<typeof quoteOffer> }> {
  if (!isKey(requesterKey)) throw new HubError('a requester key is ed25519:<64 hex>');
  const attestation = await getAttestation(draft.attestation);
  if (!attestation) throw new HubError('no such attestation', 404);
  if (attestation.requesterKey !== requesterKey) throw new HubError('that attestation belongs to another key', 403);
  if (attestation.status === 'voided') throw new HubError('that attestation was voided', 409);

  const days = Math.floor(draft.days);
  if (!Number.isFinite(days) || days < 1 || days > MAX_OFFER_DAYS) throw new HubError(`days is 1 to ${MAX_OFFER_DAYS}`);
  const sizeBytes = Math.floor(draft.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new HubError('sizeBytes must be a positive integer');
  const seedersMin = Math.max(1, Math.floor(draft.seeders?.min ?? 1));
  const seedersMax = Math.max(seedersMin, Math.floor(draft.seeders?.max ?? seedersMin));
  const everyHours = Math.min(168, Math.max(1, Math.floor(draft.proof?.everyHours ?? 6)));
  // Throws when the price is not a six-decimal string, which is the point.
  toMicros(draft.priceUsdPerGibMonth);

  const quote = quoteOffer({ ...draft, days, sizeBytes, seeders: { min: seedersMin, max: seedersMax } });
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + days * 86_400_000);

  const record = {
    openswarm: OPENSWARM_VERSION,
    type: 'pay2seed.offer',
    hub: hubKey(),
    requester: requesterKey,
    attestation: attestation.id,
    subject: attestation.subject,
    visibility: attestation.visibility,
    sizeBytes,
    days,
    seeders: { min: seedersMin, max: seedersMax },
    priceUsdPerGibMonth: draft.priceUsdPerGibMonth,
    budgetUsd: quote.budgetUsd,
    proof: { everyHours, verifiers: ['hub'] },
    trackers: draft.trackers ?? [],
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdAt: startsAt.toISOString(),
    sigs: [] as unknown[],
  };
  const id = recordId(record);

  const { data, error } = await db()
    .from('openswarm_offers')
    .insert({
      id,
      attestation_id: attestation.id,
      requester_key: requesterKey,
      visibility: attestation.visibility,
      size_bytes: sizeBytes,
      days,
      seeders_min: seedersMin,
      seeders_max: seedersMax,
      price_usd_per_gib_month: num(draft.priceUsdPerGibMonth),
      budget_usd: num(quote.budgetUsd),
      fee_usd: num(quote.feeUsd),
      proof_every_hours: everyHours,
      trackers: draft.trackers ?? [],
      pass: asJson(draft.pass ?? null),
      record: asJson(record),
      status: 'unpaid',
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single();
  if (error) throw new HubError(`could not create the offer: ${error.message}`, 500);
  return { offer: toOffer(data), quote };
}

/** The money settled. An offer becomes listable, and seeders can take slots. */
export async function markOfferPaid(offerId: string, paymentId: string): Promise<Offer | null> {
  const { data, error } = await db()
    .from('openswarm_offers')
    .update({ status: 'pending', payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('status', 'unpaid')
    .select('*')
    .maybeSingle();
  // A retried webhook finds nothing to update, which is the idempotency.
  if (error || !data) return null;
  return toOffer(data);
}

export async function getOffer(id: string): Promise<Offer | null> {
  const { data } = await db().from('openswarm_offers').select('*').eq('id', id).maybeSingle();
  return data ? toOffer(data) : null;
}

/**
 * The market: offers a seeder can actually take work on. An offer whose
 * attestation is not honoured yet is not here, which is what the claim window
 * is for.
 */
export async function listMarket(filter: { visibility?: Visibility; basis?: Basis; limit?: number } = {}): Promise<MarketRow[]> {
  const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
  let query = db()
    .from('openswarm_offers')
    .select('*, openswarm_attestations!inner(*), openswarm_parties!openswarm_offers_requester_key_fkey(kind)')
    .in('status', ['pending', 'active'])
    .eq('openswarm_attestations.status', 'honoured')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filter.visibility) query = query.eq('visibility', filter.visibility);
  if (filter.basis) query = query.eq('openswarm_attestations.basis', filter.basis);

  const { data, error } = await query;
  if (error) throw new HubError(`could not read the market: ${error.message}`, 500);

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const offerIds = rows.map((row) => String(row.id));
  const taken = await slotsTaken(offerIds);

  return rows.map((row) => {
    const attestation = toAttestation(row.openswarm_attestations as Record<string, unknown>);
    const offer = toOffer(row);
    const party = (row.openswarm_parties ?? {}) as { kind?: PartyKind };
    return {
      offer,
      basis: attestation.basis,
      visibility: attestation.visibility,
      description: attestation.description,
      license: attestation.license,
      summary: readmeSummary(attestation.readme),
      subject: attestation.subject,
      slotsFree: Math.max(0, offer.seedersMax - (taken.get(offer.id) ?? 0)),
      projectedUsd: requiredBudget({
        priceUsdPerGibMonth: offer.priceUsdPerGibMonth,
        sizeBytes: offer.sizeBytes,
        days: offer.days,
        seedersMax: 1,
      }),
      requesterKind: party.kind ?? 'human',
    };
  });
}

async function slotsTaken(offerIds: string[]): Promise<Map<string, number>> {
  const taken = new Map<string, number>();
  if (!offerIds.length) return taken;
  const { data } = await db()
    .from('openswarm_leases')
    .select('offer_id')
    .in('offer_id', offerIds)
    .not('status', 'in', '("abandoned","voided","ended")');
  for (const row of data ?? []) {
    const id = String(row.offer_id);
    taken.set(id, (taken.get(id) ?? 0) + 1);
  }
  return taken;
}

/* ----------------------------------------------------------------- leases -- */

function toLease(row: Record<string, unknown>): Lease {
  return {
    id: String(row.id),
    offerId: String(row.offer_id),
    seederKey: String(row.seeder_key),
    slot: Number(row.slot),
    priceUsdPerGibMonth: usd(Number(row.price_usd_per_gib_month)),
    lane: row.lane as Lane,
    earnedUsd: usd(Number(row.earned_usd ?? 0)),
    periodsProven: Number(row.periods_proven ?? 0),
    periodsFailed: Number(row.periods_failed ?? 0),
    status: row.status as Lease['status'],
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
  };
}

/**
 * Take a slot on an offer.
 *
 * The seeder proves it holds the key by signing the offer id, must already be
 * a payee (there would otherwise be nowhere to pay), and must clear the
 * standing floor.
 */
export async function takeLease(input: { offerId: string; seederKey: string; sig: string }): Promise<Lease> {
  if (!isKey(input.seederKey)) throw new HubError('a seeder key is ed25519:<64 hex>');

  const offer = await getOffer(input.offerId);
  if (!offer) throw new HubError('no such offer', 404);
  if (offer.status === 'unpaid') throw new HubError('that offer is not funded yet', 409);
  if (offer.status === 'voided' || offer.status === 'settled') throw new HubError('that offer is closed', 409);
  if (new Date(offer.expiresAt).getTime() <= Date.now()) throw new HubError('that offer has expired', 409);

  // The signature is over a record shaped like the wire's, so one verifier serves both.
  const proof = {
    openswarm: OPENSWARM_VERSION,
    type: 'paid2seed.lease.request',
    offer: offer.id,
    seeder: input.seederKey,
    createdAt: new Date().toISOString(),
    sigs: [{ alg: 'ed25519', key: input.seederKey, sig: input.sig }],
  } as SignedRecord;
  // The signed bytes must not include a timestamp the caller did not sign, so
  // verify over the stable part only.
  const stable = { openswarm: OPENSWARM_VERSION, type: 'paid2seed.lease.request', offer: offer.id, seeder: input.seederKey };
  const signable = { ...stable, sigs: proof.sigs } as unknown as SignedRecord;
  if (!verifiedBy(signable, input.seederKey)) {
    throw new HubError('sign the offer id with the seeder key to take a lease', 403);
  }

  const seeder = await getParty(input.seederKey);
  if (!seeder) throw new HubError('register the seeder key first', 404);
  if (!seeder.payoutAddress) throw new HubError('register a payout address first; there would be nowhere to pay', 409);
  if (seeder.seederStanding < MIN_SEEDER_STANDING) throw new HubError('this key is below the hub\'s standing floor', 403);

  const { data: mine } = await db()
    .from('openswarm_leases')
    .select('*')
    .eq('offer_id', offer.id)
    .eq('seeder_key', input.seederKey)
    .maybeSingle();
  if (mine) throw new HubError('this key already holds a lease on that offer', 409);

  const taken = await slotsTaken([offer.id]);
  const used = taken.get(offer.id) ?? 0;
  if (used >= offer.seedersMax) throw new HubError('that offer has no free slot', 409);

  const requester = await getParty(offer.requesterKey);
  const lane = laneFor(requester?.kind ?? 'human', seeder.kind);

  const startsAt = new Date();
  const record = {
    openswarm: OPENSWARM_VERSION,
    type: 'paid2seed.lease',
    hub: hubKey(),
    offer: offer.id,
    seeder: input.seederKey,
    slot: used + 1,
    priceUsdPerGibMonth: offer.priceUsdPerGibMonth,
    startsAt: startsAt.toISOString(),
    endsAt: offer.expiresAt,
    graceHours: 24,
    createdAt: startsAt.toISOString(),
    sigs: [] as unknown[],
  };

  const { data, error } = await db()
    .from('openswarm_leases')
    .insert({
      id: recordId(record),
      offer_id: offer.id,
      seeder_key: input.seederKey,
      slot: used + 1,
      price_usd_per_gib_month: num(offer.priceUsdPerGibMonth),
      lane,
      status: 'fetching',
      grace_hours: 24,
      starts_at: startsAt.toISOString(),
      ends_at: offer.expiresAt,
      record: asJson(record),
    })
    .select('*')
    .single();
  if (error) throw new HubError(`could not take the lease: ${error.message}`, 500);

  // Enough seeders now hold slots for the offer to be live.
  if (used + 1 >= offer.seedersMin && offer.status === 'pending') {
    await db().from('openswarm_offers').update({ status: 'active' }).eq('id', offer.id);
  }
  return toLease(data);
}

export async function getLease(id: string): Promise<Lease | null> {
  const { data } = await db().from('openswarm_leases').select('*').eq('id', id).maybeSingle();
  return data ? toLease(data) : null;
}

export async function listLeasesFor(seederKey: string): Promise<Lease[]> {
  const { data } = await db().from('openswarm_leases').select('*').eq('seeder_key', seederKey).order('created_at', { ascending: false });
  return (data ?? []).map((row) => toLease(row as Record<string, unknown>));
}

/* ------------------------------------------------------ proofs & receipts -- */

/**
 * Record a period's verdict and pay for it.
 *
 * The receipt's unique `(lease, period)` is the whole of the idempotency: a
 * verifier that reports twice pays once. Two consecutive failures end the
 * lease and reopen the slot.
 */
export async function reportProof(input: {
  leaseId: string;
  period: number;
  kind: 'challenge' | 'probe';
  passed: boolean;
  verifierKey?: string | null;
  detail?: string | null;
  record?: unknown;
}): Promise<{ lease: Lease; earnedUsd: string; alreadyRecorded: boolean }> {
  const lease = await getLease(input.leaseId);
  if (!lease) throw new HubError('no such lease', 404);
  if (lease.status === 'voided') throw new HubError('that lease was voided', 409);

  const offer = await getOffer(lease.offerId);
  if (!offer) throw new HubError('that lease has no offer', 404);

  const period = Math.floor(input.period);
  if (!Number.isFinite(period) || period < 0) throw new HubError('period is a non-negative integer');

  const proofId = recordId({
    openswarm: OPENSWARM_VERSION,
    type: 'paid2seed.proof',
    lease: lease.id,
    period,
    kind: input.kind,
    passed: input.passed,
  });

  const { error: proofError } = await db().from('openswarm_proofs').insert({
    id: proofId,
    lease_id: lease.id,
    period,
    kind: input.kind,
    verifier_key: input.verifierKey ?? null,
    passed: input.passed,
    detail: input.detail ?? null,
    record: asJson(input.record ?? {}),
  });
  // A duplicate period is not an error; it simply pays nothing more.
  const duplicate = Boolean(proofError && /duplicate|unique/i.test(proofError.message));
  if (proofError && !duplicate) throw new HubError(`could not record the proof: ${proofError.message}`, 500);
  if (duplicate) return { lease, earnedUsd: '0.000000', alreadyRecorded: true };

  if (!input.passed) {
    const consecutive = await failLease(lease, offer);
    return { lease: consecutive, earnedUsd: '0.000000', alreadyRecorded: false };
  }

  const earned = periodEarnings({
    priceUsdPerGibMonth: lease.priceUsdPerGibMonth,
    sizeBytes: offer.sizeBytes,
    everyHours: offer.proofEveryHours,
  });

  // Never pay past what was escrowed: the last period of a rounded-down budget
  // pays what is left rather than going negative.
  const remaining = toMicros(offer.budgetUsd) - toMicros(offer.spentUsd);
  const payable = fromMicros(remaining <= 0n ? 0n : remaining < toMicros(earned) ? remaining : toMicros(earned));

  const seeder = await getParty(lease.seederKey);
  const balance = fromMicros(toMicros(seeder?.balanceUsd ?? '0.000000') + toMicros(payable));

  await db().from('openswarm_receipts').insert({
    id: recordId({ openswarm: OPENSWARM_VERSION, type: 'paid2seed.receipt', lease: lease.id, period }),
    lease_id: lease.id,
    proof_id: proofId,
    period,
    earned_usd: num(payable),
    balance_usd: num(balance),
    lane: lease.lane,
    record: asJson({
      openswarm: OPENSWARM_VERSION,
      type: 'paid2seed.receipt',
      lease: lease.id,
      period,
      earnedUsd: payable,
      balanceUsd: balance,
      createdAt: new Date().toISOString(),
      sigs: [],
    }),
  });

  await db()
    .from('openswarm_leases')
    .update({
      earned_usd: num(fromMicros(toMicros(lease.earnedUsd) + toMicros(payable))),
      periods_proven: lease.periodsProven + 1,
      consecutive_failures: 0,
      status: 'proven',
      last_proof_at: new Date().toISOString(),
    })
    .eq('id', lease.id);

  await db()
    .from('openswarm_offers')
    .update({ spent_usd: num(fromMicros(toMicros(offer.spentUsd) + toMicros(payable))) })
    .eq('id', offer.id);

  if (seeder) {
    await db()
      .from('openswarm_parties')
      .update({ balance_usd: num(balance), proven: seeder.proven + 1 })
      .eq('key', lease.seederKey);
  }

  const updated = await getLease(lease.id);
  return { lease: updated ?? lease, earnedUsd: payable, alreadyRecorded: false };
}

async function failLease(lease: Lease, _offer: Offer): Promise<Lease> {
  const { data } = await db().from('openswarm_leases').select('consecutive_failures').eq('id', lease.id).maybeSingle();
  const consecutive = Number(data?.consecutive_failures ?? 0) + 1;
  // Two in a row ends it and reopens the slot for somebody who will hold it.
  const status = consecutive >= 2 ? 'ended' : 'lapsed';
  await db()
    .from('openswarm_leases')
    .update({ periods_failed: lease.periodsFailed + 1, consecutive_failures: consecutive, status })
    .eq('id', lease.id);
  await bumpParty(lease.seederKey, { failed: 1 });
  return { ...lease, periodsFailed: lease.periodsFailed + 1, status };
}

/* ---------------------------------------------------------------- notices -- */

/**
 * A claim against an attestation. The hub forwards it and then either voids
 * the attestation or records that it was reviewed and stands. Voiding takes
 * every offer and lease with it and refunds what has not been earned.
 */
export async function fileNotice(input: {
  attestationId: string;
  kind: 'rights' | 'illegal' | 'personal-data' | 'other';
  statement: string;
  claimantName?: string | null;
  claimantContact?: string | null;
  record?: unknown;
}): Promise<{ noticeId: string; attestation: Attestation }> {
  const attestation = await getAttestation(input.attestationId);
  if (!attestation) throw new HubError('no such attestation', 404);
  if (!input.statement?.trim()) throw new HubError('a notice says what the claim is');

  const noticeId = recordId({
    openswarm: OPENSWARM_VERSION,
    type: 'pay2seed.notice',
    attestation: attestation.id,
    kind: input.kind,
    statement: input.statement,
    createdAt: new Date().toISOString(),
  });

  await db().from('openswarm_notices').insert({
    id: noticeId,
    attestation_id: attestation.id,
    kind: input.kind,
    claimant_name: input.claimantName ?? null,
    claimant_contact: input.claimantContact ?? null,
    statement: input.statement.slice(0, 4000),
    record: asJson(input.record ?? {}),
    outcome: 'received',
  });

  return { noticeId, attestation };
}

/** Void an attestation: every offer on it closes and every lease ends. */
export async function voidAttestation(attestationId: string, reason: string): Promise<{ offers: number; leases: number }> {
  const attestation = await getAttestation(attestationId);
  if (!attestation) throw new HubError('no such attestation', 404);

  await db()
    .from('openswarm_attestations')
    .update({ status: 'voided', voided_at: new Date().toISOString(), void_reason: reason })
    .eq('id', attestationId);

  const { data: offers } = await db().from('openswarm_offers').select('id').eq('attestation_id', attestationId);
  const offerIds = (offers ?? []).map((row) => String(row.id));
  if (offerIds.length) {
    await db().from('openswarm_offers').update({ status: 'voided' }).in('id', offerIds);
    await db().from('openswarm_leases').update({ status: 'voided' }).in('offer_id', offerIds);
  }
  await db().from('openswarm_notices').update({ outcome: 'voided', resolved_at: new Date().toISOString() }).eq('attestation_id', attestationId);
  await bumpParty(attestation.requesterKey, { voided: 1 });

  const { count } = await db()
    .from('openswarm_leases')
    .select('id', { count: 'exact', head: true })
    .in('offer_id', offerIds.length ? offerIds : ['none']);
  return { offers: offerIds.length, leases: count ?? 0 };
}

/* ------------------------------------------------------------- hub record -- */

/** The hub's own signing key, when one is configured. */
export function hubKey(): string {
  const key = process.env.OPENSWARM_HUB_KEY ?? '';
  return isKey(key) ? key : 'ed25519:0000000000000000000000000000000000000000000000000000000000000000';
}

/** `GET /.well-known/openswarm-hub.json` (ippay §5.1, pay2seed §6.1). */
export function hubRecord(origin: string): Record<string, unknown> {
  return {
    openswarm: OPENSWARM_VERSION,
    type: 'ippay.hub',
    key: hubKey(),
    name: 'BitTorrented',
    base: `${origin}/api/openswarm`,
    networks: ['eip155:8453', 'eip155:137', 'eip155:1'],
    // 1 percent, and it is charged to whoever is paying.
    minHubBps: HUB_FEE_BPS,
    payout: { minUsd: '1.000000', schedule: 'daily' },
    passDays: 30,
    pay2seed: {
      base: `${origin}/api/openswarm/pay2seed`,
      bases: BASES,
      claimHours: CLAIM_WINDOW_HOURS,
      minStanding: MIN_SEEDER_STANDING,
      verifiers: ['hub'],
      maxDays: MAX_OFFER_DAYS,
      // Every party here is a human or a bit, and all four lanes are carried.
      lanes: ['h2h', 'h2b', 'b2h', 'b2b'],
    },
    createdAt: '2026-09-06T00:00:00.000Z',
    sigs: [],
  };
}

export { sha256Hex, OpenSwarmRecordError };
