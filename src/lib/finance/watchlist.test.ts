import { describe, it, expect } from 'vitest';
import {
  parseSymbolList,
  sanitizeWatchlistName,
  formatSymbolsCsv,
  watchlistExportFilename,
  MAX_WATCHLIST_NAME,
} from './watchlist';

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

describe('formatSymbolsCsv', () => {
  it('sorts alphabetically and joins with commas', () => {
    expect(formatSymbolsCsv(['TSLA', 'AAPL', 'NVDA'])).toBe('AAPL,NVDA,TSLA');
  });

  it('normalizes and de-dupes', () => {
    expect(formatSymbolsCsv([' nvda ', 'NVDA', 'aapl'])).toBe('AAPL,NVDA');
  });

  it('returns an empty string for an empty list', () => {
    expect(formatSymbolsCsv([])).toBe('');
  });

  it('round-trips through parseSymbolList', () => {
    const csv = formatSymbolsCsv(['spy', 'AAPL', 'brk-b']);
    expect(csv).toBe('AAPL,BRK-B,SPY');
    expect(parseSymbolList(csv).valid).toEqual(['AAPL', 'BRK-B', 'SPY']);
  });
});

describe('watchlistExportFilename', () => {
  it('slugifies the list name', () => {
    expect(watchlistExportFilename('My Tech List')).toBe('my-tech-list.csv');
  });

  it('falls back when the name has no usable characters', () => {
    expect(watchlistExportFilename('  ***  ')).toBe('watchlist.csv');
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
