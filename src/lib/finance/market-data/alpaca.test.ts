import { describe, it, expect } from 'vitest';
import { AlpacaMarketDataProvider, type AlpacaDataClient } from './alpaca';

function makeClient(bars: Array<Partial<Record<string, unknown>>>): AlpacaDataClient {
  return {
    timeframeUnit: { MIN: 'Min', HOUR: 'Hour', DAY: 'Day' },
    newTimeframe: (amount: number, unit: string) => `${amount}${unit}`,
    async *getBarsV2() {
      for (const b of bars) yield b as never;
    },
  };
}

const BARS = [
  { Timestamp: '2026-06-12T00:00:00Z', OpenPrice: 108, HighPrice: 109, LowPrice: 101, ClosePrice: 102, Volume: 1500 },
  { Timestamp: '2026-06-10T00:00:00Z', OpenPrice: 100, HighPrice: 105, LowPrice: 99, ClosePrice: 104, Volume: 1000 },
  { Timestamp: '2026-06-11T00:00:00Z', OpenPrice: 104, HighPrice: 110, LowPrice: 103, ClosePrice: 108, Volume: 1200 },
];

describe('AlpacaMarketDataProvider', () => {
  it('maps and sorts bars into candles (unix seconds)', async () => {
    const p = new AlpacaMarketDataProvider({ clientFactory: () => makeClient(BARS) });
    const candles = await p.getCandles('nvda', '1Y');
    expect(candles).toHaveLength(3);
    expect(candles[0].time).toBeLessThan(candles[2].time);
    expect(candles[2]).toMatchObject({ close: 102, volume: 1500 });
  });

  it('drops malformed bars defensively', async () => {
    const p = new AlpacaMarketDataProvider({
      clientFactory: () => makeClient([
        { Timestamp: 'bad', OpenPrice: 1, HighPrice: 1, LowPrice: 1, ClosePrice: 1 },
        { Timestamp: '2026-06-10T00:00:00Z', OpenPrice: 0, HighPrice: 0, LowPrice: 0, ClosePrice: 0 },
      ]),
    });
    expect(await p.getCandles('nvda', '1M')).toEqual([]);
  });

  it('derives a quote from recent bars', async () => {
    const p = new AlpacaMarketDataProvider({ clientFactory: () => makeClient(BARS) });
    const quote = await p.getQuote('nvda');
    expect(quote?.symbol).toBe('NVDA');
    expect(quote?.price).toBe(102);
    expect(quote?.previousClose).toBe(108);
  });

  it('uses an intraday timeframe for 1D and daily for 1Y', async () => {
    const seen: string[] = [];
    const client: AlpacaDataClient = {
      timeframeUnit: { MIN: 'Min', HOUR: 'Hour', DAY: 'Day' },
      newTimeframe: (amount: number, unit: string) => `${amount}${unit}`,
      async *getBarsV2(_symbol: string, options: Record<string, unknown>) {
        seen.push(String(options.timeframe));
        yield* [];
      },
    };
    const p = new AlpacaMarketDataProvider({ clientFactory: () => client });
    await p.getCandles('NVDA', '1D');
    await p.getCandles('NVDA', '1Y');
    expect(seen[0]).toBe('5Min');
    expect(seen[1]).toBe('1Day');
  });

  it('returns [] for search (Finnhub owns typeahead)', async () => {
    const p = new AlpacaMarketDataProvider({ clientFactory: () => makeClient(BARS) });
    expect(await p.search()).toEqual([]);
  });

  it('maps asset metadata from getAsset', async () => {
    const client: AlpacaDataClient = {
      ...makeClient(BARS),
      getAsset: async (symbol: string) => ({
        symbol,
        name: 'NVIDIA Corporation',
        exchange: 'NASDAQ',
        class: 'us_equity',
        status: 'active',
        tradable: true,
        marginable: true,
        shortable: true,
        easy_to_borrow: true,
        fractionable: true,
        attributes: ['options_enabled'],
      }),
    };
    const p = new AlpacaMarketDataProvider({ clientFactory: () => client });
    const asset = await p.getAsset('nvda');
    expect(asset).toMatchObject({
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      exchange: 'NASDAQ',
      assetClass: 'us_equity',
      status: 'active',
      tradable: true,
      fractionable: true,
      hasOptions: true,
    });
  });

  it('returns null asset when the SDK lacks getAsset', async () => {
    const p = new AlpacaMarketDataProvider({ clientFactory: () => makeClient(BARS) });
    expect(await p.getAsset('nvda')).toBeNull();
  });

  it('returns null asset when getAsset throws', async () => {
    const client: AlpacaDataClient = {
      ...makeClient(BARS),
      getAsset: async () => {
        throw new Error('not found');
      },
    };
    const p = new AlpacaMarketDataProvider({ clientFactory: () => client });
    expect(await p.getAsset('zzzz')).toBeNull();
  });
});
