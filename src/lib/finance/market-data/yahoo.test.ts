import { describe, it, expect } from 'vitest';
import { YahooMarketDataProvider, marketSessionAt, quoteFromChart } from './yahoo';

// Trading-period windows mirroring Yahoo's currentTradingPeriod (unix seconds).
const PERIODS = {
  pre: { start: 1000, end: 2000 },
  regular: { start: 2000, end: 3000 },
  post: { start: 3000, end: 4000 },
};

describe('marketSessionAt', () => {
  it('classifies each window and the gaps around them', () => {
    expect(marketSessionAt(500, PERIODS)).toBe('CLOSED'); // before pre
    expect(marketSessionAt(1500, PERIODS)).toBe('PRE');
    expect(marketSessionAt(2500, PERIODS)).toBe('REGULAR');
    expect(marketSessionAt(3500, PERIODS)).toBe('POST');
    expect(marketSessionAt(5000, PERIODS)).toBe('CLOSED'); // after post
  });

  it('treats window boundaries as [start, end) and regular as authoritative', () => {
    expect(marketSessionAt(2000, PERIODS)).toBe('REGULAR'); // regular.start
    expect(marketSessionAt(3000, PERIODS)).toBe('POST'); // regular.end == post.start
  });

  it('is CLOSED when no trading period is known', () => {
    expect(marketSessionAt(2500, undefined)).toBe('CLOSED');
    expect(marketSessionAt(2500, {})).toBe('CLOSED');
  });
});

describe('quoteFromChart', () => {
  const result = {
    meta: {
      regularMarketPrice: 100,
      chartPreviousClose: 98,
      regularMarketDayHigh: 103,
      regularMarketDayLow: 97,
      regularMarketVolume: 5000,
      regularMarketTime: 2900,
      currentTradingPeriod: PERIODS,
    },
    timestamp: [1800, 2400, 3200],
    indicators: {
      quote: [
        {
          open: [99, 100, 101],
          high: [99.5, 102, 101.5],
          low: [98.5, 99, 100.5],
          close: [99, 101, 101.2], // last bar is a post-market print
          volume: [10, 4000, 990],
        },
      ],
    },
  };

  it('uses the latest (pre/post-inclusive) bar close as the live price', () => {
    const q = quoteFromChart('NVDA', result, 3200)!;
    expect(q.price).toBe(101.2); // post-market last print, not regularMarketPrice
    expect(q.previousClose).toBe(98);
    expect(q.change).toBeCloseTo(3.2, 6);
    expect(q.marketState).toBe('POST');
    // day high/low/volume come from meta, not the partial intraday series
    expect(q.high).toBe(103);
    expect(q.low).toBe(97);
    expect(q.volume).toBe(5000);
  });

  it('takes the regular-session open (the bar at/after regular.start)', () => {
    const q = quoteFromChart('NVDA', result, 2500)!;
    expect(q.open).toBe(100); // first bar with time >= regular.start (2400 < 2000? no -> 2400>=2000)
    expect(q.marketState).toBe('REGULAR');
  });

  it('falls back to regularMarketPrice when there are no usable bars', () => {
    const q = quoteFromChart('NVDA', { meta: { regularMarketPrice: 50, currentTradingPeriod: PERIODS } }, 2500)!;
    expect(q.price).toBe(50);
    expect(q.marketState).toBe('REGULAR');
  });

  it('returns null without meta or a price', () => {
    expect(quoteFromChart('NVDA', undefined, 2500)).toBeNull();
    expect(quoteFromChart('NVDA', { meta: {} }, 2500)).toBeNull();
  });
});

describe('YahooMarketDataProvider.getQuote', () => {
  it('builds a live quote from the chart endpoint', async () => {
    const provider = new YahooMarketDataProvider({
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 200,
                  chartPreviousClose: 195,
                  regularMarketDayHigh: 205,
                  regularMarketDayLow: 190,
                  regularMarketVolume: 12345,
                  regularMarketTime: 1781789400,
                  currentTradingPeriod: {
                    pre: { start: 0, end: 1 },
                    regular: { start: 1781789400, end: 1781812800 },
                    post: { start: 1781812800, end: 1781827200 },
                  },
                },
                timestamp: [1781789400],
                indicators: { quote: [{ open: [196], high: [201], low: [195], close: [200], volume: [12345] }] },
              },
            ],
          },
        }),
      }),
    });
    const q = await provider.getQuote('NVDA');
    expect(q?.price).toBe(200);
    expect(q?.previousClose).toBe(195);
    expect(['PRE', 'REGULAR', 'POST', 'CLOSED']).toContain(q?.marketState);
  });

  it('falls back to candle derivation when the quote fetch is not ok', async () => {
    let call = 0;
    const provider = new YahooMarketDataProvider({
      fetchFn: async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 500, json: async () => ({}) }; // quote attempt
        // candle fallback (getCandles 5D)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            chart: {
              result: [
                {
                  timestamp: [1, 2],
                  indicators: { quote: [{ open: [10, 11], high: [10, 11], low: [10, 11], close: [10, 11], volume: [1, 1] }] },
                },
              ],
            },
          }),
        };
      },
    });
    const q = await provider.getQuote('NVDA');
    expect(q?.price).toBe(11);
    expect(q?.marketState).toBeUndefined(); // candle fallback has no session
  });
});
