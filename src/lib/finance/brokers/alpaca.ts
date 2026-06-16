/**
 * Finance — Alpaca read-only broker adapter (PRD §3.4, M3).
 *
 * Uses the official `@alpacahq/alpaca-trade-api` SDK with the user's own API
 * key/secret, but ONLY the read methods (`getAccount`, `getPositions`). We never
 * call any order/trade method. Paper and live are selected via the `paper` flag.
 *
 * The SDK client is created behind an injectable factory so this is unit-testable
 * without the network.
 */

import Alpaca from '@alpacahq/alpaca-trade-api';
import {
  type BrokerAccount,
  type BrokerCredentials,
  type BrokerPosition,
  type BrokerProvider,
  type BrokerSnapshot,
} from './types';

/** The narrow slice of the Alpaca SDK we use — read-only. */
export interface AlpacaTradingClient {
  getAccount(): Promise<{ portfolio_value?: string; cash?: string; currency?: string }>;
  getPositions(): Promise<
    Array<{ symbol?: string; qty?: string; avg_entry_price?: string; market_value?: string }>
  >;
}

export type AlpacaTradingClientFactory = (creds: BrokerCredentials) => AlpacaTradingClient;

const defaultFactory: AlpacaTradingClientFactory = (creds) =>
  new Alpaca({
    keyId: creds.apiKey,
    secretKey: creds.apiSecret,
    paper: creds.paper ?? false,
  }) as unknown as AlpacaTradingClient;

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

export class AlpacaBrokerProvider implements BrokerProvider {
  readonly id = 'alpaca';
  readonly label = 'Alpaca';
  private readonly factory: AlpacaTradingClientFactory;

  constructor(options: { clientFactory?: AlpacaTradingClientFactory } = {}) {
    this.factory = options.clientFactory ?? defaultFactory;
  }

  async verify(creds: BrokerCredentials): Promise<boolean> {
    try {
      await this.factory(creds).getAccount();
      return true;
    } catch {
      return false;
    }
  }

  async fetchSnapshot(creds: BrokerCredentials): Promise<BrokerSnapshot> {
    const client = this.factory(creds);
    const [accountData, positionsData] = await Promise.all([
      client.getAccount(),
      client.getPositions(),
    ]);

    const account: BrokerAccount = {
      accountValue: num(accountData.portfolio_value),
      cash: num(accountData.cash),
      currency: accountData.currency ?? 'USD',
    };

    const positions: BrokerPosition[] = (Array.isArray(positionsData) ? positionsData : [])
      .map((p): BrokerPosition | null => {
        const symbol = typeof p.symbol === 'string' ? p.symbol.toUpperCase() : null;
        const quantity = num(p.qty);
        if (!symbol || quantity === null) return null;
        return {
          symbol,
          quantity,
          avgCost: num(p.avg_entry_price),
          marketValue: num(p.market_value),
        };
      })
      .filter((p): p is BrokerPosition => p !== null);

    return { account, positions };
  }
}
