/**
 * The storage ladder for the dataset mirror: Fibonacci steps from 2 TB to past
 * 500 TB, climbed only when the mirror pays for the next rung.
 *
 * 2 → 3 → 5 → 8 → 13 → 21 → 34 → 55 → 89 → 144 → 233 → 377 → 610 TB.
 * Each rung is roughly 1.6x the last, so a step up is affordable from what
 * the previous rung earns, and no single purchase is a leap of faith.
 */

export const LADDER_TB = [2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610] as const;

/** Leave this share of a rung free for filesystem slack and in-flight downloads. */
export const HEADROOM = 0.1;

/** Climb once used space reaches this share of the current rung. */
export const CLIMB_AT = 0.8;

/**
 * Rough cost of a mirrored TB-month on rented dedicated storage with unmetered
 * transfer (Hetzner SX class, 2026). An estimate for the climb rule, not a quote.
 */
export const USD_PER_TB_MONTH = 2;

const TB = 1e12;

/** The rung that holds `capacityTb`: the largest one not above it. */
export function rungFor(capacityTb: number): number {
  let rung: number = LADDER_TB[0];
  for (const tb of LADDER_TB) if (tb <= capacityTb) rung = tb;
  return rung;
}

export function nextRung(capacityTb: number): number | null {
  return LADDER_TB.find((tb) => tb > capacityTb) ?? null;
}

/** Bytes the mirror may still fill on this rung. */
export function budgetBytes(capacityTb: number, usedBytes: number): number {
  return Math.max(0, Math.floor(capacityTb * TB * (1 - HEADROOM) - usedBytes));
}

export interface ClimbAdvice {
  climb: boolean;
  next: number | null;
  reason: string;
}

/**
 * Whether to buy the next rung. Two conditions, both required: the current one
 * is nearly full, and monthly revenue from the mirror already covers what the
 * next one costs. Full but unpaid means prune or wait, not spend.
 */
export function shouldClimb(capacityTb: number, usedBytes: number, monthlyRevenueUsd: number): ClimbAdvice {
  const next = nextRung(capacityTb);
  if (next === null) return { climb: false, next, reason: 'top of the ladder' };
  const used = usedBytes / (capacityTb * TB);
  if (used < CLIMB_AT) {
    return { climb: false, next, reason: `${Math.round(used * 100)}% used; climb at ${CLIMB_AT * 100}%` };
  }
  const cost = next * USD_PER_TB_MONTH;
  if (monthlyRevenueUsd < cost) {
    return { climb: false, next, reason: `full, but $${monthlyRevenueUsd}/mo does not cover ${next} TB at ~$${cost}/mo` };
  }
  return { climb: true, next, reason: `full and paid for: ${next} TB costs ~$${cost}/mo against $${monthlyRevenueUsd}/mo` };
}

export interface Sized {
  infohash: string;
  size: number;
}

/**
 * Which datasets to mirror into the remaining budget. Callers pass candidates
 * in priority order; anything that does not fit is skipped rather than ending
 * the walk, so one huge dataset never blocks the small ones behind it.
 */
export function fillBudget<T extends Sized>(candidates: readonly T[], budget: number): T[] {
  const picked: T[] = [];
  let left = budget;
  for (const c of candidates) {
    if (c.size > 0 && c.size <= left) {
      picked.push(c);
      left -= c.size;
    }
  }
  return picked;
}
