import { describe, it, expect } from 'vitest';
import {
  parseSymbolList,
  sanitizeWatchlistName,
  formatSymbolsCsv,
  formatWatchlistsExport,
  parseWatchlistsExport,
  watchlistExportFilename,
  watchlistNameFromFilename,
  uniqueWatchlistName,
  MAX_WATCHLIST_NAME,
  DEFAULT_WATCHLIST_NAME,
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

describe('formatWatchlistsExport / parseWatchlistsExport', () => {
  const lists = [
    { name: 'Tech', symbols: ['NVDA', 'AAPL'] },
    { name: 'Energy', symbols: ['XOM'] },
  ];

  it('writes a header, one sorted line per list, tickers alphabetical', () => {
    expect(formatWatchlistsExport(lists)).toBe(['#watchlists', 'Energy,XOM', 'Tech,AAPL,NVDA'].join('\n'));
  });

  it('round-trips through the parser', () => {
    const parsed = parseWatchlistsExport(formatWatchlistsExport(lists));
    expect(parsed).toEqual([
      { name: 'Energy', symbols: ['XOM'] },
      { name: 'Tech', symbols: ['AAPL', 'NVDA'] },
    ]);
  });

  it('quotes and round-trips names containing commas or quotes', () => {
    const tricky = [{ name: 'Big, "risky" names', symbols: ['SPY'] }];
    const text = formatWatchlistsExport(tricky);
    expect(text).toContain('"Big, ""risky"" names",SPY');
    expect(parseWatchlistsExport(text)).toEqual(tricky);
  });

  it('keeps empty lists', () => {
    const text = formatWatchlistsExport([{ name: 'Empty', symbols: [] }]);
    expect(text).toBe('#watchlists\nEmpty');
    expect(parseWatchlistsExport(text)).toEqual([{ name: 'Empty', symbols: [] }]);
  });

  it('returns null for a plain ticker list, so it imports as a single list', () => {
    expect(parseWatchlistsExport('AAPL,NVDA,SPY')).toBeNull();
    expect(parseWatchlistsExport('AAPL\nNVDA')).toBeNull();
    expect(parseWatchlistsExport('')).toBeNull();
  });

  it('tolerates blank lines and CRLF', () => {
    expect(parseWatchlistsExport('#watchlists\r\n\r\nTech,AAPL\r\n')).toEqual([{ name: 'Tech', symbols: ['AAPL'] }]);
  });

  it('skips junk tickers within a line', () => {
    expect(parseWatchlistsExport('#watchlists\nTech,AAPL,$$$,NVDA')).toEqual([
      { name: 'Tech', symbols: ['AAPL', 'NVDA'] },
    ]);
  });
});

describe('watchlistNameFromFilename', () => {
  it('round-trips an exported file name back to the list name', () => {
    const file = watchlistExportFilename('My Tech List');
    expect(watchlistNameFromFilename(file)).toBe('My Tech List');
  });

  it('keeps the user\'s own capitalization', () => {
    expect(watchlistNameFromFilename('FAANG picks.txt')).toBe('FAANG picks');
  });

  it('strips directories, extensions and separators', () => {
    expect(watchlistNameFromFilename('/tmp/dir/high_beta-names.csv')).toBe('High Beta Names');
  });

  it('falls back for a nameless file', () => {
    expect(watchlistNameFromFilename('.csv')).toBe(DEFAULT_WATCHLIST_NAME);
  });

  it('caps the length', () => {
    expect(watchlistNameFromFilename(`${'x'.repeat(200)}.csv`)).toHaveLength(MAX_WATCHLIST_NAME);
  });
});

describe('uniqueWatchlistName', () => {
  it('passes through when there is no collision', () => {
    expect(uniqueWatchlistName('Tech', ['Energy'])).toBe('Tech');
  });

  it('suffixes past existing names, case-insensitively', () => {
    expect(uniqueWatchlistName('Tech', ['tech'])).toBe('Tech 2');
    expect(uniqueWatchlistName('Tech', ['Tech', 'Tech 2'])).toBe('Tech 3');
  });

  it('keeps the suffixed name within the length cap', () => {
    const long = 'x'.repeat(MAX_WATCHLIST_NAME);
    expect(uniqueWatchlistName(long, [long]).length).toBeLessThanOrEqual(MAX_WATCHLIST_NAME);
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
