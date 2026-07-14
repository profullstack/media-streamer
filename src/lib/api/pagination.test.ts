import { describe, expect, it } from 'vitest';
import { parseIntegerParam } from './pagination';

describe('parseIntegerParam', () => {
  it('rejects missing, partial, fractional, and unsafe values', () => {
    expect(parseIntegerParam(null)).toBeNull();
    expect(parseIntegerParam('')).toBeNull();
    expect(parseIntegerParam('10abc')).toBeNull();
    expect(parseIntegerParam('1.5')).toBeNull();
    expect(parseIntegerParam('9007199254740992')).toBeNull();
  });

  it('enforces optional bounds', () => {
    expect(parseIntegerParam('10', { min: 1, max: 100 })).toBe(10);
    expect(parseIntegerParam('0', { min: 1, max: 100 })).toBeNull();
    expect(parseIntegerParam('101', { min: 1, max: 100 })).toBeNull();
  });

  it('trims valid integer input', () => {
    expect(parseIntegerParam(' 25 ', { min: 0 })).toBe(25);
  });
});
