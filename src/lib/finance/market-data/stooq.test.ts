import { describe, it, expect } from 'vitest';
import {
  StooqMarketDataProvider,
  normalizeSymbol,
  toStooqSymbol,
  parseStooqCsv,
  sliceToRange,
  quoteFromCandles,
} from './stooq';
import type { Candle } from './types';

const CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2026-06-10,100,105,99,104,1000',
  '2026-06-11,104,110,103,108,1200',
  '2026-06-12,108,109,101,102,1500',
].join('\n');

function makeProvider(csv: string, ok = true, status = 200): StooqMarketDataProvider {
  return new StooqMarketDataProvider({
    fetchFn: async () => ({ ok, status, text: async () => csv }),
  });
}

describe('normalizeSymbol', () => {
  it('uppercases and strips whitespace', () => {
    expect(normalizeSymbol('  nvda ')).toBe('NVDA');
    expect(normalizeSymbol('brk b')).toBe('BRKB');
  });
});

describe('toStooqSymbol', () => {
  it('adds .us suffix for bare US tickers', () => {
    expect(toStooqSymbol('NVDA')).toBe('nvda.us');
  });
  it('passes through symbols that already carry a market suffix', () => {
    expect(toStooqSymbol('CDR.PL')).toBe('cdr.pl');
  });
});

describe('parseStooqCsv', () => {
  it('parses sorted OHLCV candles in unix seconds', () => {
    const candles = parseStooqCsv(CSV);
    expect(candles).toHaveLength(3);
    expect(candles[0]).toEqual({
      time: Date.parse('2026-06-10T00:00:00Z') / 1000,
      open: 100,
      high: 105,
      low: 99,
      close: 104,
      volume: 1000,
    });
    // sorted ascending
    expect(candles[0].time).toBeLessThan(candles[2].time);
  });

  it('returns [] for empty / non-data payloads (Stooq error text)', () => {
    expect(parseStooqCsv('')).toEqual([]);
    expect(parseStooqCsv('No data')).toEqual([]);
  });

  it('drops rows with non-numeric or non-positive OHLC', () => {
    const bad = 'Date,Open,High,Low,Close,Volume\n2026-06-10,N/D,N/D,N/D,N/D,N/D';
    expect(parseStooqCsv(bad)).toEqual([]);
  });
});

describe('sliceToRange', () => {
  it('keeps only the trailing window', () => {
    const candles = parseStooqCsv(CSV);
    // 1D window is 2 days -> last bar plus the one ~1 day before
    const last = sliceToRange(candles, '1D');
    expect(last.length).toBeGreaterThanOrEqual(1);
    expect(last[last.length - 1].close).toBe(102);
    // 5Y keeps everything
    expect(sliceToRange(candles, '5Y')).toHaveLength(3);
  });

  it('handles empty input', () => {
    expect(sliceToRange([], '1Y')).toEqual([]);
  });
});

describe('quoteFromCandles', () => {
  it('derives last price and change vs previous close', () => {
    const candles = parseStooqCsv(CSV);
    const quote = quoteFromCandles('NVDA', candles);
    expect(quote).not.toBeNull();
    expect(quote?.symbol).toBe('NVDA');
    expect(quote?.price).toBe(102);
    expect(quote?.previousClose).toBe(108);
    expect(quote?.change).toBe(-6);
    expect(quote?.changePercent).toBeCloseTo((-6 / 108) * 100, 5);
    expect(quote?.asOf).toBe(Date.parse('2026-06-12T00:00:00Z') / 1000);
  });

  it('returns null with no candles', () => {
    expect(quoteFromCandles('NVDA', [] as Candle[])).toBeNull();
  });
});

describe('StooqMarketDataProvider', () => {
  it('exposes a stable id', () => {
    expect(makeProvider(CSV).id).toBe('stooq');
  });

  it('getCandles returns range-sliced candles', async () => {
    const candles = await makeProvider(CSV).getCandles('nvda', '5Y');
    expect(candles).toHaveLength(3);
  });

  it('getQuote returns a derived quote', async () => {
    const quote = await makeProvider(CSV).getQuote('nvda');
    expect(quote?.price).toBe(102);
    expect(quote?.symbol).toBe('NVDA');
  });

  it('throws on upstream failure', async () => {
    await expect(makeProvider('', false, 503).getQuote('nvda')).rejects.toThrow(/Stooq/);
  });

  it('search normalizes a single candidate and rejects junk', async () => {
    const provider = makeProvider(CSV);
    expect(await provider.search('  nvda ')).toEqual([{ symbol: 'NVDA' }]);
    expect(await provider.search('!!!')).toEqual([]);
  });
});
