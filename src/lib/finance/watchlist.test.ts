import { describe, it, expect } from 'vitest';
import {
  parseSymbolList,
  sanitizeWatchlistName,
  formatSymbolsCsv,
  formatWatchlistsCsv,
  parseWatchlistsCsv,
  parseWatchlistsExport,
  WATCHLIST_CSV_COLUMNS,
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

describe('formatWatchlistsCsv', () => {
  const lists = [
    { name: 'Tech', symbols: ['NVDA', 'AAPL'] },
    { name: 'Energy', symbols: ['XOM'] },
  ];

  const header = WATCHLIST_CSV_COLUMNS.join(',');

  it('puts the ticker leftmost, one row per stock, lists and tickers sorted', () => {
    const rows = formatWatchlistsCsv(lists).split('\n');
    expect(rows[0]).toBe(header);
    expect(rows.slice(1).map((r) => r.split(',').slice(0, 2).join(','))).toEqual([
      'XOM,Energy',
      'AAPL,Tech',
      'NVDA,Tech',
    ]);
  });

  it('fills the price columns from quote + change data', () => {
    const text = formatWatchlistsCsv([{ name: 'Tech', symbols: ['AAPL'] }], {
      quotes: {
        AAPL: {
          price: 123.456,
          change: -1.2,
          changePercent: -0.964,
          open: 124,
          high: 125,
          low: 122.5,
          previousClose: 124.656,
          volume: 54_321_000,
          asOf: Date.parse('2026-08-01T00:00:00Z') / 1000,
        },
      },
      changes: { AAPL: { d1: -0.96, d5: 2.115, d30: null } },
    });
    expect(text.split('\n')[1]).toBe(
      'AAPL,Tech,123.46,-1.20,-0.96,-0.96,2.12,,124.00,125.00,122.50,124.66,54321000,2026-08-01',
    );
  });

  it('leaves price cells blank when the provider has no data', () => {
    const row = formatWatchlistsCsv([{ name: 'Tech', symbols: ['AAPL'] }]).split('\n')[1];
    expect(row).toBe(`AAPL,Tech${','.repeat(WATCHLIST_CSV_COLUMNS.length - 2)}`);
  });

  it('quotes list names containing commas or quotes', () => {
    const text = formatWatchlistsCsv([{ name: 'Big, "risky" names', symbols: ['SPY'] }]);
    expect(text).toContain('SPY,"Big, ""risky"" names"');
  });
});

describe('parseWatchlistsCsv', () => {
  it('round-trips an exported file back into lists', () => {
    const lists = [
      { name: 'Energy', symbols: ['XOM'] },
      { name: 'Tech', symbols: ['AAPL', 'NVDA'] },
    ];
    expect(parseWatchlistsCsv(formatWatchlistsCsv(lists), 'ignored')).toEqual(lists);
  });

  it('round-trips list names that needed quoting', () => {
    const lists = [{ name: 'Big, "risky" names', symbols: ['SPY'] }];
    expect(parseWatchlistsCsv(formatWatchlistsCsv(lists), 'ignored')).toEqual(lists);
  });

  it('keeps empty lists', () => {
    const text = formatWatchlistsCsv([{ name: 'Empty', symbols: [] }]);
    expect(parseWatchlistsCsv(text, 'ignored')).toEqual([{ name: 'Empty', symbols: [] }]);
  });

  it('ignores the price columns and tolerates extra ones', () => {
    const text = 'Symbol,List,Price,Notes\nAAPL,Tech,123.45,buy more\nXOM,Energy,98.10,\n';
    expect(parseWatchlistsCsv(text, 'ignored')).toEqual([
      { name: 'Tech', symbols: ['AAPL'] },
      { name: 'Energy', symbols: ['XOM'] },
    ]);
  });

  it('falls back to the file name when there is no List column or the cell is blank', () => {
    expect(parseWatchlistsCsv('Symbol,Price\nAAPL,1\nNVDA,2\n', 'My File')).toEqual([
      { name: 'My File', symbols: ['AAPL', 'NVDA'] },
    ]);
    expect(parseWatchlistsCsv('Symbol,List\nAAPL,\n', 'My File')).toEqual([{ name: 'My File', symbols: ['AAPL'] }]);
  });

  it('de-dupes repeated tickers and skips junk ones', () => {
    const text = 'Symbol,List\nAAPL,Tech\naapl,Tech\n$$$,Tech\nNVDA,Tech\n';
    expect(parseWatchlistsCsv(text, 'ignored')).toEqual([{ name: 'Tech', symbols: ['AAPL', 'NVDA'] }]);
  });

  it('tolerates CRLF and blank lines', () => {
    expect(parseWatchlistsCsv('Symbol,List\r\n\r\nAAPL,Tech\r\n', 'ignored')).toEqual([
      { name: 'Tech', symbols: ['AAPL'] },
    ]);
  });

  it('recognizes a UTF-8 byte order mark before the header', () => {
    expect(parseWatchlistsCsv('\uFEFFSymbol,List\nAAPL,Tech\n', 'ignored')).toEqual([
      { name: 'Tech', symbols: ['AAPL'] },
    ]);
  });

  it('returns null for a plain ticker list, so it imports as a single list', () => {
    expect(parseWatchlistsCsv('AAPL,NVDA,SPY', 'f')).toBeNull();
    expect(parseWatchlistsCsv('AAPL\nNVDA', 'f')).toBeNull();
    expect(parseWatchlistsCsv('', 'f')).toBeNull();
  });
});

describe('parseWatchlistsExport (legacy #watchlists files)', () => {
  it('still restores files exported before the CSV format', () => {
    expect(parseWatchlistsExport('#watchlists\nEnergy,XOM\nTech,AAPL,NVDA')).toEqual([
      { name: 'Energy', symbols: ['XOM'] },
      { name: 'Tech', symbols: ['AAPL', 'NVDA'] },
    ]);
  });

  it('unquotes names that carried commas or quotes', () => {
    expect(parseWatchlistsExport('#watchlists\n"Big, ""risky"" names",SPY')).toEqual([
      { name: 'Big, "risky" names', symbols: ['SPY'] },
    ]);
  });

  it('keeps empty lists', () => {
    expect(parseWatchlistsExport('#watchlists\nEmpty')).toEqual([{ name: 'Empty', symbols: [] }]);
  });

  it('returns null for anything without the sentinel', () => {
    expect(parseWatchlistsExport('AAPL,NVDA,SPY')).toBeNull();
    expect(parseWatchlistsExport('Symbol,List\nAAPL,Tech')).toBeNull();
    expect(parseWatchlistsExport('')).toBeNull();
  });

  it('tolerates blank lines and CRLF', () => {
    expect(parseWatchlistsExport('#watchlists\r\n\r\nTech,AAPL\r\n')).toEqual([{ name: 'Tech', symbols: ['AAPL'] }]);
  });

  it('recognizes a UTF-8 byte order mark before the sentinel', () => {
    expect(parseWatchlistsExport('\uFEFF#watchlists\nTech,AAPL')).toEqual([{ name: 'Tech', symbols: ['AAPL'] }]);
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
