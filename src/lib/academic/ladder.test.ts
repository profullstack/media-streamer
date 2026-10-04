import { describe, expect, it } from 'vitest';
import { LADDER_TB, budgetBytes, fillBudget, nextRung, rungFor, shouldClimb } from './ladder';

const TB = 1e12;

describe('ladder', () => {
  it('is Fibonacci from 2 TB past 500 TB', () => {
    for (let i = 2; i < LADDER_TB.length; i++) {
      expect(LADDER_TB[i]).toBe(LADDER_TB[i - 1] + LADDER_TB[i - 2]);
    }
    expect(LADDER_TB[0]).toBe(2);
    expect(LADDER_TB[LADDER_TB.length - 1]).toBeGreaterThanOrEqual(500);
  });

  it('finds the rung and the next one', () => {
    expect(rungFor(2)).toBe(2);
    expect(rungFor(4)).toBe(3);
    expect(nextRung(2)).toBe(3);
    expect(nextRung(610)).toBeNull();
  });

  it('budgets what is free minus headroom', () => {
    // 2 TB half full: 1.8 TB usable minus 1 TB used.
    expect(budgetBytes(2, 1 * TB)).toBe(0.8 * TB);
    expect(budgetBytes(2, 2 * TB)).toBe(0);
  });
});

describe('shouldClimb', () => {
  it('waits while there is room', () => {
    expect(shouldClimb(2, 1 * TB, 1000).climb).toBe(false);
  });

  it('will not climb on a full rung that does not pay for the next', () => {
    const advice = shouldClimb(2, 1.9 * TB, 1);
    expect(advice.climb).toBe(false);
    expect(advice.reason).toMatch(/does not cover/);
  });

  it('climbs when full and paid for', () => {
    expect(shouldClimb(2, 1.9 * TB, 10)).toMatchObject({ climb: true, next: 3 });
  });
});

describe('fillBudget', () => {
  it('skips what does not fit and keeps filling behind it', () => {
    const picked = fillBudget(
      [
        { infohash: 'a', size: 5 },
        { infohash: 'huge', size: 100 },
        { infohash: 'b', size: 4 },
        { infohash: 'unknown-size', size: 0 },
      ],
      10
    );
    expect(picked.map((p) => p.infohash)).toEqual(['a', 'b']);
  });
});
