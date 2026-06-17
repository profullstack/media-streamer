/**
 * Finance — per-profile market-data provider resolution.
 *
 * If the profile has connected a broker (Alpaca), use THEIR credentials for
 * candles/quotes so the data comes from the account the user actually linked
 * (matching the keys they entered). Otherwise fall back to the app-level default
 * provider (Finnhub/Stooq/etc).
 *
 * SERVER-ONLY (decrypts broker credentials).
 */

import { type MarketDataProvider } from './types';
import { getMarketDataProvider } from './index';
import { AlpacaMarketDataProvider } from './alpaca';
import { getActiveBrokerCreds } from '@/lib/finance/brokers/service';

export async function getMarketDataProviderForProfile(
  profileId: string | null,
): Promise<MarketDataProvider> {
  if (profileId) {
    const alpaca = await getActiveBrokerCreds(profileId, 'alpaca');
    if (alpaca) {
      return new AlpacaMarketDataProvider({
        apiKey: alpaca.apiKey,
        apiSecret: alpaca.apiSecret,
      });
    }
  }
  return getMarketDataProvider();
}
