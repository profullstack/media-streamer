import { describe, it, expect } from 'vitest';
import { parseSymbolList, sanitizeWatchlistName, MAX_WATCHLIST_NAME } from './watchlist';

describe('parseSymbolList', () => {
  it('parses a comma-separated string, normalizing + de-duping', () => {
    const { valid, invalid } = parseSymbolList(' nvda, AAPL ,tsla,  nvda ');
    expect(valid).toEqual(['NVDA', 'AAPL', 'TSLA']);
    expect(invalid).toEqual([]);
  });

  it('splits on whitespace, newlines and semicolons too', () => {
    const { valid } = parseSymbolList('NVDA AAPL\nMSFT;GOOG\tSPY');
    expect(valid).toEqual(['NVDA', 'AAPL', 'MSFT', 'GOOG', 'SPY']);
  });

  it('accepts an array input', () => {
    expect(parseSymbolList(['nvda', 'aapl']).valid).toEqual(['NVDA', 'AAPL']);
  });

  it('collects invalid tokens separately', () => {
    const { valid, invalid } = parseSymbolList('NVDA, $$$, 123, , TSLA');
    expect(valid).toEqual(['NVDA', 'TSLA']);
    expect(invalid).toContain('$$$');
    expect(invalid).toContain('123');
  });

  it('returns empty for empty input', () => {
    expect(parseSymbolList('   ')).toEqual({ valid: [], invalid: [] });
  });
});

describe('sanitizeWatchlistName', () => {
  it('trims and collapses internal whitespace', () => {
    expect(sanitizeWatchlistName('  My   Tech  List ')).toBe('My Tech List');
  });

  it('rejects empty / non-string input', () => {
    expect(sanitizeWatchlistName('   ')).toBeNull();
    expect(sanitizeWatchlistName('')).toBeNull();
    expect(sanitizeWatchlistName(null)).toBeNull();
    expect(sanitizeWatchlistName(42)).toBeNull();
  });

  it('caps the length', () => {
    expect(sanitizeWatchlistName('x'.repeat(200))).toHaveLength(MAX_WATCHLIST_NAME);
  });
});
