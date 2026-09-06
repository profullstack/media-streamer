/**
 * Lanes, and the hub's cut.
 *
 * Every party on this layer is a key, and a key is either a **human** or a
 * **bit**: an autonomous agent that holds its own key, earns its own money and
 * answers for its own consent. Because both sides of a payment can be either,
 * there are exactly four lanes:
 *
 *   h2h  a person pays a person          someone rents a stranger's disk
 *   h2b  a person pays an agent          you buy access to what an agent made
 *   b2h  an agent pays a person          an agent keeps its archive on your box
 *   b2b  an agent pays an agent          the one nobody else is serving
 *
 * The lane is stamped on a lease and on every receipt at the moment the money
 * is agreed, so it survives a party later changing kind, and so we can see
 * which lane is actually growing rather than guessing.
 *
 * The hub takes **1 percent** of what crosses it. It is charged to whoever is
 * paying, on top of what they quoted, and is never taken out of a seeder's or
 * a relay's earnings: a promised floor is what the seeder is paid.
 */
import { fromMicros, toMicros } from './records';

export type PartyKind = 'human' | 'bit';
export type Lane = 'h2h' | 'h2b' | 'b2h' | 'b2b';

export const LANES: readonly Lane[] = ['h2h', 'h2b', 'b2h', 'b2b'];

/** The reference hub's cut, in basis points. 100 bps is 1 percent. */
export const HUB_FEE_BPS = 100;

export function isPartyKind(value: unknown): value is PartyKind {
  return value === 'human' || value === 'bit';
}

/** The lane a payment runs on: who pays, then who is paid. */
export function laneFor(payer: PartyKind, payee: PartyKind): Lane {
  return `${payer === 'bit' ? 'b' : 'h'}2${payee === 'bit' ? 'b' : 'h'}` as Lane;
}

export function describeLane(lane: Lane): string {
  switch (lane) {
    case 'h2h':
      return 'person to person';
    case 'h2b':
      return 'person to agent';
    case 'b2h':
      return 'agent to person';
    case 'b2b':
      return 'agent to agent';
  }
}

/**
 * The hub's fee on an amount, rounded UP to the micro so a fraction of a cent
 * is never quietly the hub's loss, and never more than a micro of anyone's.
 */
export function feeOn(amount: string, bps = HUB_FEE_BPS): string {
  const micros = toMicros(amount);
  const fee = (micros * BigInt(bps) + 9_999n) / 10_000n;
  return fromMicros(fee);
}

/** What a requester actually pays: the budget they set, plus the hub's cut. */
export function totalWithFee(budget: string, bps = HUB_FEE_BPS): string {
  return fromMicros(toMicros(budget) + toMicros(feeOn(budget, bps)));
}

/**
 * What one proven period earns (paid2seed §5.1):
 *
 *   price per GiB-month × (bytes / 2^30) × (hours / 720)
 *
 * All of it in integer micro-USD, rounding down, so a hub and a seeder
 * computing it separately always agree and the hub never over-pays itself out
 * of a rounding difference.
 */
export function periodEarnings(args: {
  priceUsdPerGibMonth: string;
  sizeBytes: number | bigint;
  everyHours: number;
}): string {
  const price = toMicros(args.priceUsdPerGibMonth);
  const bytes = BigInt(args.sizeBytes);
  const hours = BigInt(Math.max(0, Math.floor(args.everyHours)));
  const GIB = 1_073_741_824n;
  return fromMicros((price * bytes * hours) / (GIB * 720n));
}

/**
 * The budget an offer must escrow to cover every slot for its whole term.
 * Rounded up, so an offer can never run out mid-period and leave a proven
 * seeder unpaid.
 */
export function requiredBudget(args: {
  priceUsdPerGibMonth: string;
  sizeBytes: number | bigint;
  days: number;
  seedersMax: number;
}): string {
  const price = toMicros(args.priceUsdPerGibMonth);
  const bytes = BigInt(args.sizeBytes);
  const days = BigInt(Math.max(1, Math.floor(args.days)));
  const seats = BigInt(Math.max(1, Math.floor(args.seedersMax)));
  const GIB = 1_073_741_824n;
  const denominator = GIB * 30n;
  const numerator = price * bytes * days * seats;
  return fromMicros((numerator + denominator - 1n) / denominator);
}
