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
  type MarketSession,
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

interface YahooTradingPeriod {
  start?: number;
  end?: number;
}

interface YahooMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  currentTradingPeriod?: {
    pre?: YahooTradingPeriod;
    regular?: YahooTradingPeriod;
    post?: YahooTradingPeriod;
  };
}

interface YahooChartResultEntry {
  meta?: YahooMeta;
  timestamp?: number[];
  indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
}

interface YahooChartResult {
  chart?: {
    result?: YahooChartResultEntry[];
    error?: unknown;
  };
}

interface YahooSearchResult {
  quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }>;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parse a Yahoo chart result entry's OHLCV arrays into clean ascending candles. */
function parseCandles(result: YahooChartResultEntry | undefined): Candle[] {
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

/**
 * Classify the trading session from Yahoo's `currentTradingPeriod` windows and
 * the current time. Regular hours take precedence; outside all windows = closed.
 * Exported for unit testing.
 */
export function marketSessionAt(nowSeconds: number, ctp?: YahooMeta['currentTradingPeriod']): MarketSession {
  const within = (p?: YahooTradingPeriod): boolean =>
    !!p && typeof p.start === 'number' && typeof p.end === 'number' && nowSeconds >= p.start && nowSeconds < p.end;

  if (within(ctp?.regular)) return 'REGULAR';
  if (within(ctp?.pre)) return 'PRE';
  if (within(ctp?.post)) return 'POST';
  return 'CLOSED';
}

/**
 * Build a live quote from a chart result's `meta` plus the (pre/post-inclusive)
 * intraday series. The latest non-null bar close is the live last price — so it
 * reflects pre/post-market moves — falling back to `regularMarketPrice`.
 * Exported for unit testing. Returns null when `meta` lacks a usable price.
 */
export function quoteFromChart(
  symbol: string,
  result: YahooChartResultEntry | undefined,
  nowSeconds: number,
): Quote | null {
  const meta = result?.meta;
  if (!meta) return null;

  const series = parseCandles(result);
  const lastBar = series[series.length - 1];
  const price = (lastBar ? lastBar.close : null) ?? num(meta.regularMarketPrice);
  if (price === null) return null;

  const previousClose = num(meta.chartPreviousClose) ?? num(meta.previousClose) ?? price;
  const change = price - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  const regularStart = meta.currentTradingPeriod?.regular?.start;
  const regularOpen =
    typeof regularStart === 'number' ? series.find((c) => c.time >= regularStart)?.open : undefined;

  return {
    symbol,
    price,
    change,
    changePercent,
    previousClose,
    open: regularOpen ?? num(meta.regularMarketPrice) ?? previousClose,
    high: num(meta.regularMarketDayHigh) ?? (lastBar?.high ?? price),
    low: num(meta.regularMarketDayLow) ?? (lastBar?.low ?? price),
    volume: num(meta.regularMarketVolume) ?? (lastBar?.volume ?? 0),
    asOf: num(meta.regularMarketTime) ?? (lastBar?.time ?? nowSeconds),
    marketState: marketSessionAt(nowSeconds, meta.currentTradingPeriod),
  };
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
    return parseCandles(data.chart?.result?.[0]);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const canonical = normalizeSymbol(symbol);
    // Use the intraday chart with pre/post bars: `meta` carries the live
    // regular-market price + trading-period windows (for the session), and the
    // included pre/post bars give the true last traded price outside RTH.
    const url = `${CHART_BASE}/${encodeURIComponent(canonical)}?range=1d&interval=5m&includePrePost=true`;
    try {
      const res = await this.fetchFn(url);
      if (res.ok) {
        const data = (await res.json()) as YahooChartResult;
        const quote = quoteFromChart(canonical, data.chart?.result?.[0], Math.floor(Date.now() / 1000));
        if (quote) return quote;
      }
    } catch {
      // Fall through to the daily-candle derivation below.
    }
    // Fallback: derive from recent daily candles (no session info).
    return quoteFromCandles(canonical, await this.getCandles(canonical, '5D'));
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
