/**
 * Finance — Stooq market-data adapter
 *
 * Keyless EOD (end-of-day) daily CSV source, chosen for M1 so the milestone
 * ships with zero vendor credentials. It is deliberately behind the
 * `MarketDataProvider` interface so we can swap to a richer/intraday vendor
 * later (PRD Open Question §10.1) without touching routes or UI.
 *
 * CSV endpoint: https://stooq.com/q/d/l/?s=<sym>&i=d
 *   Date,Open,High,Low,Close,Volume
 */

import {
  type Candle,
  type MarketDataProvider,
  type Quote,
  type SymbolSearchResult,
  type TickerRange,
  RANGE_WINDOW_DAYS,
} from './types';

type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

interface StooqProviderOptions {
  /** Injectable for tests. Defaults to global fetch. */
  fetchFn?: FetchFn;
}

const STOOQ_CSV_URL = 'https://stooq.com/q/d/l/';

/** Normalize user input into a canonical, displayable ticker (e.g. " nvda " -> "NVDA"). */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Map a canonical symbol to the Stooq query symbol. US equities/ETFs need a
 * `.us` market suffix; anything already carrying a `.suffix` is passed through.
 */
export function toStooqSymbol(symbol: string): string {
  const s = symbol.toLowerCase();
  return s.includes('.') ? s : `${s}.us`;
}

const DAY_SECONDS = 86_400;

function parseNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Convert a Stooq `YYYY-MM-DD` date to a UTC unix timestamp in seconds. */
function dateToUtcSeconds(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

/**
 * Parse Stooq daily CSV into sorted, validated candles. Rows with missing or
 * non-numeric OHLC are dropped (render defensively, PRD §6).
 */
export function parseStooqCsv(csv: string): Candle[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  if (!header.startsWith('date')) return [];

  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 5) continue;

    const [date, open, high, low, close, volume] = cols;
    const time = dateToUtcSeconds(date);
    const o = parseNumber(open);
    const h = parseNumber(high);
    const l = parseNumber(low);
    const c = parseNumber(close);
    const v = volume === undefined ? 0 : parseNumber(volume);

    if (!Number.isFinite(time) || [o, h, l, c].some((n) => !Number.isFinite(n) || n <= 0)) {
      continue;
    }

    candles.push({ time, open: o, high: h, low: l, close: c, volume: Number.isFinite(v) ? v : 0 });
  }

  candles.sort((a, b) => a.time - b.time);
  return candles;
}

/** Slice candles down to the trailing window for the requested range. */
export function sliceToRange(candles: Candle[], range: TickerRange): Candle[] {
  if (candles.length === 0) return [];
  const latest = candles[candles.length - 1].time;
  const cutoff = latest - RANGE_WINDOW_DAYS[range] * DAY_SECONDS;
  return candles.filter((candle) => candle.time >= cutoff);
}

/** Derive a key-stats quote from the most recent two daily bars. */
export function quoteFromCandles(symbol: string, candles: Candle[]): Quote | null {
  if (candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : null;
  const previousClose = prev ? prev.close : last.open;
  const change = last.close - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  return {
    symbol,
    price: last.close,
    change,
    changePercent,
    previousClose,
    open: last.open,
    high: last.high,
    low: last.low,
    volume: last.volume,
    asOf: last.time,
  };
}

export class StooqMarketDataProvider implements MarketDataProvider {
  readonly id = 'stooq';
  private readonly fetchFn: FetchFn;

  constructor(options: StooqProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((url) => fetch(url) as ReturnType<FetchFn>);
  }

  private async fetchCandles(symbol: string): Promise<Candle[]> {
    const stooqSymbol = toStooqSymbol(symbol);
    const url = `${STOOQ_CSV_URL}?s=${encodeURIComponent(stooqSymbol)}&i=d`;
    const res = await this.fetchFn(url);
    if (!res.ok) {
      throw new Error(`Stooq request failed: ${res.status}`);
    }
    return parseStooqCsv(await res.text());
  }

  async getCandles(symbol: string, range: TickerRange): Promise<Candle[]> {
    const candles = await this.fetchCandles(normalizeSymbol(symbol));
    return sliceToRange(candles, range);
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const canonical = normalizeSymbol(symbol);
    const candles = await this.fetchCandles(canonical);
    return quoteFromCandles(canonical, candles);
  }

  /**
   * Minimal keyless lookup for M1: validate/normalize the query into a single
   * candidate symbol. Richer typeahead (names, fuzzy match) is a follow-on once
   * a search-capable vendor is chosen (PRD §10.1).
   */
  async search(query: string): Promise<SymbolSearchResult[]> {
    const symbol = normalizeSymbol(query);
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) return [];
    return [{ symbol }];
  }
}
