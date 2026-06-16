/**
 * Finance — Alpaca market-data adapter (candles via the official SDK).
 *
 * Uses app-level Alpaca keys (ALPACA_API_KEY/SECRET) and the free IEX feed to
 * pull OHLCV bars with `getBarsV2`. Quotes derive from the most recent bars;
 * symbol search is left to Finnhub (Alpaca has no fuzzy search), so this returns
 * [] there. Per the PRD §1 non-goals we use REST polling, not the websocket
 * stream (revisit later).
 */

import Alpaca from '@alpacahq/alpaca-trade-api';
import {
  type Candle,
  type MarketDataProvider,
  type Quote,
  type SymbolSearchResult,
  type TickerRange,
  RANGE_WINDOW_DAYS,
} from './types';
import { normalizeSymbol, quoteFromCandles } from './stooq';

interface AlpacaBarRaw {
  Timestamp?: string;
  OpenPrice?: number;
  HighPrice?: number;
  LowPrice?: number;
  ClosePrice?: number;
  Volume?: number;
}

/** Narrow slice of the SDK we use for market data. */
export interface AlpacaDataClient {
  getBarsV2(symbol: string, options: Record<string, unknown>): AsyncIterable<AlpacaBarRaw>;
  newTimeframe(amount: number, unit: string): string;
  // SDK enum keys are uppercase: MIN="Min", HOUR="Hour", DAY="Day".
  timeframeUnit: { MIN: string; HOUR: string; DAY: string };
}

export type AlpacaDataClientFactory = () => AlpacaDataClient;

const DAY_MS = 86_400_000;

/** Intraday for short ranges, daily otherwise. */
function resolutionFor(range: TickerRange, client: AlpacaDataClient): string {
  switch (range) {
    case '1D':
      return client.newTimeframe(5, client.timeframeUnit.MIN);
    case '5D':
      return client.newTimeframe(15, client.timeframeUnit.MIN);
    default:
      return client.newTimeframe(1, client.timeframeUnit.DAY);
  }
}

export class AlpacaMarketDataProvider implements MarketDataProvider {
  readonly id = 'alpaca';
  private readonly factory: AlpacaDataClientFactory;

  constructor(options: { apiKey?: string; apiSecret?: string; clientFactory?: AlpacaDataClientFactory }) {
    this.factory =
      options.clientFactory ??
      (() =>
        new Alpaca({
          keyId: options.apiKey,
          secretKey: options.apiSecret,
          paper: true,
        }) as unknown as AlpacaDataClient);
  }

  async getCandles(symbol: string, range: TickerRange): Promise<Candle[]> {
    const client = this.factory();
    const canonical = normalizeSymbol(symbol);
    const start = new Date(Date.now() - RANGE_WINDOW_DAYS[range] * DAY_MS).toISOString();

    const candles: Candle[] = [];
    const bars = client.getBarsV2(canonical, {
      start,
      timeframe: resolutionFor(range, client),
      feed: 'iex',
      limit: 10_000,
    });

    for await (const bar of bars) {
      const time = bar.Timestamp ? Math.floor(Date.parse(bar.Timestamp) / 1000) : NaN;
      const o = bar.OpenPrice;
      const h = bar.HighPrice;
      const l = bar.LowPrice;
      const c = bar.ClosePrice;
      if (
        !Number.isFinite(time) ||
        [o, h, l, c].some((n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0)
      ) {
        continue;
      }
      candles.push({
        time,
        open: o as number,
        high: h as number,
        low: l as number,
        close: c as number,
        volume: typeof bar.Volume === 'number' && Number.isFinite(bar.Volume) ? bar.Volume : 0,
      });
    }

    candles.sort((a, b) => a.time - b.time);
    return candles;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const canonical = normalizeSymbol(symbol);
    const candles = await this.getCandles(canonical, '5D');
    return quoteFromCandles(canonical, candles);
  }

  /** Alpaca has no fuzzy search; Finnhub handles typeahead. */
  async search(): Promise<SymbolSearchResult[]> {
    return [];
  }
}
