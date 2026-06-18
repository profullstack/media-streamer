/**
 * Finance — Market Data Provider factory
 *
 * Single entry point so routes never name a concrete vendor. Swap the adapter
 * here (or branch on an env var) when the M1 vendor decision lands (PRD §10.1).
 */

import { type MarketDataProvider } from './types';
import { YahooMarketDataProvider } from './yahoo';
import { FinnhubMarketDataProvider } from './finnhub';
import { AlpacaMarketDataProvider } from './alpaca';

let provider: MarketDataProvider | null = null;

/**
 * Compose the app-level default provider from whatever credentials are set:
 *   - candles: Alpaca (`ALPACA_API_KEY`/`ALPACA_API_SECRET`) else keyless Yahoo
 *   - quotes + symbol search: Finnhub (`FINNHUB_API_KEY`) when present, wrapping
 *     the candle source; otherwise the candle provider serves quotes/search too.
 * (Per-profile resolution prefers the user's CONNECTED broker — see for-profile.ts.)
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (!provider) {
    const { ALPACA_API_KEY, ALPACA_API_SECRET, FINNHUB_API_KEY } = process.env;

    const candleProvider: MarketDataProvider =
      ALPACA_API_KEY && ALPACA_API_SECRET
        ? new AlpacaMarketDataProvider({ apiKey: ALPACA_API_KEY, apiSecret: ALPACA_API_SECRET })
        : new YahooMarketDataProvider();

    provider = FINNHUB_API_KEY
      ? new FinnhubMarketDataProvider({ apiKey: FINNHUB_API_KEY, candleProvider })
      : candleProvider;
  }
  return provider;
}

/** Keyless provider that always works without credentials (Yahoo). */
export function getFallbackMarketDataProvider(): MarketDataProvider {
  return new YahooMarketDataProvider();
}

/** Test/seam hook to reset the cached singleton. */
export function resetMarketDataProvider(): void {
  provider = null;
}

export * from './types';
export { StooqMarketDataProvider } from './stooq';
export { YahooMarketDataProvider } from './yahoo';
export { FinnhubMarketDataProvider } from './finnhub';
export { AlpacaMarketDataProvider } from './alpaca';
export { getFinvizFundamentals, parseFinvizSnapshot } from './finviz';
