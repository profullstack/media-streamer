/**
 * Finance — Market Data Provider factory
 *
 * Single entry point so routes never name a concrete vendor. Swap the adapter
 * here (or branch on an env var) when the M1 vendor decision lands (PRD §10.1).
 */

import { type MarketDataProvider } from './types';
import { StooqMarketDataProvider } from './stooq';
import { FinnhubMarketDataProvider } from './finnhub';
import { AlpacaMarketDataProvider } from './alpaca';

let provider: MarketDataProvider | null = null;

/**
 * Compose the active provider from whatever credentials are configured:
 *   - candles: Alpaca (`ALPACA_API_KEY`/`ALPACA_API_SECRET`, real bars) else Stooq EOD
 *   - quotes + symbol search: Finnhub (`FINNHUB_API_KEY`, real-time) when present,
 *     wrapping the candle source; otherwise the candle provider serves quotes too.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (!provider) {
    const { ALPACA_API_KEY, ALPACA_API_SECRET, FINNHUB_API_KEY } = process.env;

    const candleProvider: MarketDataProvider =
      ALPACA_API_KEY && ALPACA_API_SECRET
        ? new AlpacaMarketDataProvider({ apiKey: ALPACA_API_KEY, apiSecret: ALPACA_API_SECRET })
        : new StooqMarketDataProvider();

    provider = FINNHUB_API_KEY
      ? new FinnhubMarketDataProvider({ apiKey: FINNHUB_API_KEY, candleProvider })
      : candleProvider;
  }
  return provider;
}

/** Test/seam hook to reset the cached singleton. */
export function resetMarketDataProvider(): void {
  provider = null;
}

export * from './types';
export { StooqMarketDataProvider } from './stooq';
export { FinnhubMarketDataProvider } from './finnhub';
export { AlpacaMarketDataProvider } from './alpaca';
