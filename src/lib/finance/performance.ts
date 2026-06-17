/**
 * Finance — trailing % change helpers for the watchlist.
 *
 * Given a series of daily EOD candles (ascending by time), compute the percent
 * gain/loss over the trailing 1, 5, and 30 calendar days. We look back by
 * calendar days (not bar count) and pick the latest bar at-or-before the cutoff,
 * so weekends/holidays/gaps resolve to the nearest prior trading day.
 */

import type { Candle } from './market-data/types';

export interface WatchlistChanges {
  /** Trailing 1-day % change (previous trading day → latest). */
  d1: number | null;
  /** Trailing 5-day % change. */
  d5: number | null;
  /** Trailing 30-day % change. */
  d30: number | null;
}

export const EMPTY_CHANGES: WatchlistChanges = { d1: null, d5: null, d30: null };

const DAY_SECONDS = 86_400;

/** Percent change over `days` calendar days, or null if not derivable. */
export function pctChangeOverDays(candles: Candle[], days: number): number | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  if (!last?.close) return null;

  const cutoff = last.time - days * DAY_SECONDS;
  let base: Candle | undefined;
  for (let i = candles.length - 2; i >= 0; i--) {
    if (candles[i].time <= cutoff) {
      base = candles[i];
      break;
    }
  }
  // Not enough history to reach the full lookback: fall back to the oldest bar
  // we have so a partial window still surfaces a (smaller) change.
  if (!base) base = candles[0];
  if (!base.close) return null;

  return ((last.close - base.close) / base.close) * 100;
}

/** Compute trailing 1/5/30-day changes from a daily candle series. */
export function computeChanges(candles: Candle[]): WatchlistChanges {
  if (!candles || candles.length < 2) return EMPTY_CHANGES;
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  return {
    d1: pctChangeOverDays(sorted, 1),
    d5: pctChangeOverDays(sorted, 5),
    d30: pctChangeOverDays(sorted, 30),
  };
}
