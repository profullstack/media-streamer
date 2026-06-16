/**
 * Finance — Market Data Provider types
 *
 * A vendor-agnostic surface so the quotes/candles source is swappable (PRD §7).
 * v1 ships one concrete adapter (Stooq, keyless EOD) behind this interface.
 */

/** Selectable chart ranges on the ticker page (PRD §3.2). */
export type TickerRange = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y';

export const TICKER_RANGES: readonly TickerRange[] = ['1D', '5D', '1M', '6M', '1Y', '5Y'];

export function isTickerRange(value: string): value is TickerRange {
  return (TICKER_RANGES as readonly string[]).includes(value);
}

/** One OHLCV bar. `time` is a UTC unix timestamp in seconds (lightweight-charts native). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Last price + the key stats we can render defensively (PRD §3.2). */
export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  /** UTC unix seconds of the latest bar backing this quote. */
  asOf: number;
}

/** Symbol typeahead result (PRD §3.1). */
export interface SymbolSearchResult {
  symbol: string;
  name?: string;
  exchange?: string;
}

export interface MarketDataProvider {
  /** Stable identifier used in cache keys and logs. */
  readonly id: string;
  getCandles(symbol: string, range: TickerRange): Promise<Candle[]>;
  getQuote(symbol: string): Promise<Quote | null>;
  search(query: string): Promise<SymbolSearchResult[]>;
}

/** Approximate trailing-day window for each range (daily EOD bars). */
export const RANGE_WINDOW_DAYS: Record<TickerRange, number> = {
  '1D': 2,
  '5D': 7,
  '1M': 31,
  '6M': 186,
  '1Y': 372,
  '5Y': 1830,
};
