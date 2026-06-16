import { describe, it, expect } from 'vitest';
import { FinnhubMarketDataProvider } from './finnhub';
import type { Candle, MarketDataProvider } from './types';

function jsonFetch(payload: unknown, ok = true, status = 200) {
  return async () => ({ ok, status, json: async () => payload });
}

const stubCandles: Candle[] = [
  { time: 1_700_000_000, open: 1, high: 2, low: 1, close: 2, volume: 10 },
];

const stubCandleProvider: MarketDataProvider = {
  id: 'stub-candles',
  getCandles: async () => stubCandles,
  getQuote: async () => null,
  search: async () => [],
};

describe('FinnhubMarketDataProvider', () => {
  it('maps a real-time /quote payload to a Quote', async () => {
    const provider = new FinnhubMarketDataProvider({
      apiKey: 'k',
      fetchFn: jsonFetch({ c: 212.45, d: 7.26, dp: 3.53, h: 212.7, l: 208.3, o: 208.9, pc: 205.19, t: 1781553600 }),
      candleProvider: stubCandleProvider,
    });
    const quote = await provider.getQuote('nvda');
    expect(quote).toMatchObject({
      symbol: 'NVDA',
      price: 212.45,
      change: 7.26,
      previousClose: 205.19,
      asOf: 1781553600,
    });
  });

  it('returns null when /quote is all-zero (unknown symbol)', async () => {
    const provider = new FinnhubMarketDataProvider({
      apiKey: 'k',
      fetchFn: jsonFetch({ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }),
      candleProvider: stubCandleProvider,
    });
    expect(await provider.getQuote('zzzz')).toBeNull();
  });

  it('maps /search results to symbol candidates, dropping non-US suffixes', async () => {
    const provider = new FinnhubMarketDataProvider({
      apiKey: 'k',
      fetchFn: jsonFetch({
        count: 2,
        result: [
          { symbol: 'NVDA', description: 'NVIDIA Corp', type: 'Common Stock' },
          { symbol: 'NVDA.MX', description: 'NVIDIA (Mexico)', type: 'Common Stock' },
        ],
      }),
      candleProvider: stubCandleProvider,
    });
    const results = await provider.search('nvidia');
    expect(results).toEqual([{ symbol: 'NVDA', name: 'NVIDIA Corp' }]);
  });

  it('delegates candles to the candle provider (Finnhub free blocks them)', async () => {
    const provider = new FinnhubMarketDataProvider({
      apiKey: 'k',
      fetchFn: jsonFetch({}),
      candleProvider: stubCandleProvider,
    });
    expect(await provider.getCandles('NVDA', '1Y')).toEqual(stubCandles);
  });

  it('throws on upstream quote failure', async () => {
    const provider = new FinnhubMarketDataProvider({
      apiKey: 'k',
      fetchFn: jsonFetch({}, false, 429),
      candleProvider: stubCandleProvider,
    });
    await expect(provider.getQuote('NVDA')).rejects.toThrow(/Finnhub/);
  });
});
