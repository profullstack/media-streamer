/**
 * Finance — Yahoo Finance market-data adapter (keyless).
 *
 * Replaces the old Stooq fallback, which now serves an anti-bot JS challenge
 * instead of CSV. Yahoo's chart endpoint returns OHLCV JSON without a key and
 * supports intraday + daily, so it's a solid keyless default and last-resort
 * fallback. (Display-to-authenticated-user only; respect Yahoo ToS.)
 */

import {
  type Candle,
  type MarketDataProvider,
  type Quote,
  type SymbolSearchResult,
  type TickerRange,
} from './types';
import { normalizeSymbol, quoteFromCandles } from './stooq';

type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface YahooProviderOptions {
  fetchFn?: FetchFn;
}

const CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const SEARCH_BASE = 'https://query1.finance.yahoo.com/v1/finance/search';

/** Yahoo range + interval per chart range. */
const RANGE_PARAMS: Record<TickerRange, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '5m' },
  '5D': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
};

interface YahooChartResult {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
    error?: unknown;
  };
}

interface YahooSearchResult {
  quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly id = 'yahoo';
  private readonly fetchFn: FetchFn;

  constructor(options: YahooProviderOptions = {}) {
    // Yahoo rejects requests without a browser-like UA.
    this.fetchFn =
      options.fetchFn ??
      ((url) => fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }) as ReturnType<FetchFn>);
  }

  async getCandles(symbol: string, range: TickerRange): Promise<Candle[]> {
    const canonical = normalizeSymbol(symbol);
    const { range: r, interval } = RANGE_PARAMS[range];
    const url = `${CHART_BASE}/${encodeURIComponent(canonical)}?range=${r}&interval=${interval}`;
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`Yahoo chart failed: ${res.status}`);

    const data = (await res.json()) as YahooChartResult;
    const result = data.chart?.result?.[0];
    const ts = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!ts || !q) return [];

    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const time = ts[i];
      const o = num(q.open?.[i]);
      const h = num(q.high?.[i]);
      const l = num(q.low?.[i]);
      const c = num(q.close?.[i]);
      if (!Number.isFinite(time) || o === null || h === null || l === null || c === null || c <= 0) {
        continue;
      }
      candles.push({ time, open: o, high: h, low: l, close: c, volume: num(q.volume?.[i]) ?? 0 });
    }
    candles.sort((a, b) => a.time - b.time);
    return candles;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const canonical = normalizeSymbol(symbol);
    // Derive from recent daily candles (keeps a single code path).
    const candles = await this.getCandles(canonical, '5D');
    return quoteFromCandles(canonical, candles);
  }

  async search(query: string): Promise<SymbolSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const res = await this.fetchFn(`${SEARCH_BASE}?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`);
    if (!res.ok) return [];
    const data = (await res.json()) as YahooSearchResult;
    return (data.quotes ?? [])
      .filter((r) => typeof r.symbol === 'string' && r.quoteType === 'EQUITY' && !r.symbol.includes('.'))
      .slice(0, 12)
      .map((r) => ({ symbol: String(r.symbol).toUpperCase(), name: r.shortname ?? r.longname }));
  }
}
