/**
 * Finance — broker provider registry (PRD §3.4).
 *
 * v1 ships Alpaca end-to-end behind the `BrokerProvider` contract; additional
 * `source-*` style adapters (Tradier, Schwab, IBKR…) are follow-on (M4).
 */

import { type BrokerProvider } from './types';
import { AlpacaBrokerProvider } from './alpaca';

const PROVIDERS: Record<string, () => BrokerProvider> = {
  alpaca: () => new AlpacaBrokerProvider(),
};

export const SUPPORTED_BROKERS = Object.keys(PROVIDERS);

export function getBrokerProvider(id: string): BrokerProvider | null {
  const factory = PROVIDERS[id];
  return factory ? factory() : null;
}

export * from './types';
export { encryptJson, decryptJson } from './crypto';
export { AlpacaBrokerProvider } from './alpaca';
