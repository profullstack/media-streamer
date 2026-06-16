/**
 * Finance — BrokerProvider contract (PRD §3.4, §7).
 *
 * Mirrors b1dz's `source-*` packages in spirit. v1 is strictly READ-ONLY:
 * providers expose account + positions only. There is NO order/trade/withdraw
 * surface here by design — we never request or store write scope.
 */

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
  /** Alpaca paper vs live; other brokers ignore. */
  paper?: boolean;
}

export interface BrokerAccount {
  /** Total account/portfolio value. */
  accountValue: number | null;
  cash: number | null;
  currency: string;
}

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  avgCost: number | null;
  marketValue: number | null;
}

export interface BrokerSnapshot {
  account: BrokerAccount;
  positions: BrokerPosition[];
}

export interface BrokerProvider {
  /** Stable id stored on the connection row, e.g. 'alpaca'. */
  readonly id: string;
  /** Human label for the UI. */
  readonly label: string;
  /** Validate credentials with a read-only call; true if usable. */
  verify(creds: BrokerCredentials): Promise<boolean>;
  /** Fetch read-only account value + positions. */
  fetchSnapshot(creds: BrokerCredentials): Promise<BrokerSnapshot>;
}
