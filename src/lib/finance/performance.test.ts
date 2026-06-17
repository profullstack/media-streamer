import { describe, it, expect } from 'vitest';
import { computeChanges, pctChangeOverDays, EMPTY_CHANGES } from './performance';
import type { Candle } from './market-data/types';

const DAY = 86_400;

/** Build a daily candle series ending "today" from a list of closes. */
function series(closes: number[], endTime = 1_700_000_000): Candle[] {
  const n = closes.length;
  return closes.map((close, i) => ({
    time: endTime - (n - 1 - i) * DAY,
    open: close,
    high: close,
    low: close,
    close,
    volume: 0,
  }));
}

describe('pctChangeOverDays', () => {
  it('computes the 1-day change from the prior trading day', () => {
    const candles = series([100, 110]); // yesterday 100 → today 110
    expect(pctChangeOverDays(candles, 1)).toBeCloseTo(10, 5);
  });

  it('computes the 5-day change against the bar ~5 days back', () => {
    const candles = series([100, 101, 102, 103, 104, 120]);
    // last.time - 5d lands on the first bar (close 100): (120-100)/100 = 20%
    expect(pctChangeOverDays(candles, 5)).toBeCloseTo(20, 5);
  });

  it('handles a 30-day window, picking the nearest prior bar', () => {
    const closes = Array.from({ length: 31 }, (_, i) => 100 + i); // 100..130
    const candles = series(closes);
    // 30 days back == first bar (100): (130-100)/100 = 30%
    expect(pctChangeOverDays(candles, 30)).toBeCloseTo(30, 5);
  });

  it('falls back to the oldest bar when history is too short', () => {
    const candles = series([50, 75]); // only 1 day apart, asked for 30
    expect(pctChangeOverDays(candles, 30)).toBeCloseTo(50, 5);
  });

  it('returns null for insufficient data', () => {
    expect(pctChangeOverDays([], 1)).toBeNull();
    expect(pctChangeOverDays(series([100]), 1)).toBeNull();
  });

  it('returns negative values for losses', () => {
    expect(pctChangeOverDays(series([200, 150]), 1)).toBeCloseTo(-25, 5);
  });
});

describe('computeChanges', () => {
  it('returns all three windows', () => {
    const closes = Array.from({ length: 31 }, (_, i) => 100 + i);
    const changes = computeChanges(series(closes));
    expect(changes.d1).toBeCloseTo((130 - 129) / 129 * 100, 5);
    expect(changes.d5).toBeCloseTo((130 - 125) / 125 * 100, 5);
    expect(changes.d30).toBeCloseTo(30, 5);
  });

  it('sorts unordered candles before computing', () => {
    const ordered = series([100, 110]);
    const shuffled = [ordered[1], ordered[0]];
    expect(computeChanges(shuffled).d1).toBeCloseTo(10, 5);
  });

  it('returns empty changes for too-short input', () => {
    expect(computeChanges([])).toEqual(EMPTY_CHANGES);
    expect(computeChanges(series([100]))).toEqual(EMPTY_CHANGES);
  });
});
