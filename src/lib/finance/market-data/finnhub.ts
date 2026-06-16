/**
 * Finance — Finnhub market-data adapter.
 *
 * Finnhub's FREE tier provides real-time US `/quote` and `/search`, but blocks
 * `/stock/candle` (premium). So this adapter serves live quotes + real symbol
 * search from Finnhub and delegates candles to the keyless Stooq adapter. When
 * a Finnhub paid plan is added, point `getCandles` at Finnhub too.
 */

import {
  type Candle,
  type MarketDataProvider,
  type Quote,
  type SymbolSearchResult,
  type TickerRange,
} from './types';
import { StooqMarketDataProvider, normalizeSymbol } from './stooq';

type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface FinnhubProviderOptions {
  apiKey: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchFn?: FetchFn;
  /** Candle source (defaults to Stooq, since Finnhub free blocks candles). */
  candleProvider?: MarketDataProvider;
}

const BASE = 'https://finnhub.io/api/v1';

interface FinnhubQuote {
  c?: number; // current
  d?: number; // change
  dp?: number; // percent change
  h?: number; // high
  l?: number; // low
  o?: number; // open
  pc?: number; // previous close
  t?: number; // unix seconds
}

interface FinnhubSearchResult {
  count?: number;
  result?: Array<{ symbol?: string; description?: string; displaySymbol?: string; type?: string }>;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export class FinnhubMarketDataProvider implements MarketDataProvider {
  readonly id = 'finnhub';
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;
  private readonly candleProvider: MarketDataProvider;

  constructor(options: FinnhubProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? ((url) => fetch(url) as ReturnType<FetchFn>);
    this.candleProvider = options.candleProvider ?? new StooqMarketDataProvider();
  }

  private url(path: string, params: Record<string, string>): string {
    const qs = new URLSearchParams({ ...params, token: this.apiKey });
    return `${BASE}${path}?${qs.toString()}`;
  }

  /** Candles come from the delegate (Stooq EOD) — Finnhub free blocks them. */
  async getCandles(symbol: string, range: TickerRange): Promise<Candle[]> {
    return this.candleProvider.getCandles(symbol, range);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const canonical = normalizeSymbol(symbol);
    const res = await this.fetchFn(this.url('/quote', { symbol: canonical }));
    if (!res.ok) {
      throw new Error(`Finnhub quote failed: ${res.status}`);
    }
    const data = (await res.json()) as FinnhubQuote;

    // Finnhub returns all-zero for unknown symbols.
    if (!data || num(data.c) <= 0) return null;

    return {
      symbol: canonical,
      price: num(data.c),
      change: num(data.d),
      changePercent: num(data.dp),
      previousClose: num(data.pc),
      open: num(data.o),
      high: num(data.h),
      low: num(data.l),
      volume: 0, // /quote does not include volume; key-stat renders defensively
      asOf: num(data.t) || Math.floor(Date.now() / 1000),
    };
  }

  async search(query: string): Promise<SymbolSearchResult[]> {
    const q = query.trim();
    if (!q) return [];
    const res = await this.fetchFn(this.url('/search', { q }));
    if (!res.ok) {
      throw new Error(`Finnhub search failed: ${res.status}`);
    }
    const data = (await res.json()) as FinnhubSearchResult;
    const results = Array.isArray(data.result) ? data.result : [];

    return results
      // US common stocks / ETFs only: skip symbols with exchange suffixes (e.g. NVDA.MX).
      .filter((r) => typeof r.symbol === 'string' && !r.symbol.includes('.'))
      .slice(0, 15)
      .map((r) => ({
        symbol: String(r.symbol).toUpperCase(),
        name: r.description,
      }));
  }
}
