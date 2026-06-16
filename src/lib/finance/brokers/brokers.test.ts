import { describe, it, expect, beforeAll } from 'vitest';
import { encryptJson, decryptJson } from './crypto';
import { AlpacaBrokerProvider } from './alpaca';
import { getBrokerProvider, SUPPORTED_BROKERS } from './index';
import type { BrokerCredentials } from './types';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-finance-brokers';
});

describe('broker credential crypto', () => {
  it('round-trips a JSON credential blob', () => {
    const creds = { apiKey: 'AK123', apiSecret: 'secret456', paper: true };
    const enc = encryptJson(creds);
    expect(enc.startsWith('fenc:v1:')).toBe(true);
    expect(enc).not.toContain('secret456'); // never plaintext
    expect(decryptJson<typeof creds>(enc)).toEqual(creds);
  });

  it('rejects a malformed blob', () => {
    expect(() => decryptJson('not-encrypted')).toThrow(/Invalid encrypted/);
  });
});

describe('getBrokerProvider', () => {
  it('returns the Alpaca provider and lists it as supported', () => {
    expect(SUPPORTED_BROKERS).toContain('alpaca');
    expect(getBrokerProvider('alpaca')?.id).toBe('alpaca');
    expect(getBrokerProvider('unknown')).toBeNull();
  });
});

describe('AlpacaBrokerProvider', () => {
  const creds: BrokerCredentials = { apiKey: 'AK', apiSecret: 'SK', paper: true };

  function provider(client: {
    getAccount?: () => Promise<unknown>;
    getPositions?: () => Promise<unknown>;
  }) {
    return new AlpacaBrokerProvider({
      clientFactory: () =>
        ({
          getAccount: client.getAccount ?? (async () => ({})),
          getPositions: client.getPositions ?? (async () => []),
        }) as never,
    });
  }

  it('verify returns false when getAccount throws', async () => {
    const p = provider({ getAccount: async () => { throw new Error('401'); } });
    expect(await p.verify(creds)).toBe(false);
  });

  it('verify returns true when getAccount resolves', async () => {
    const p = provider({ getAccount: async () => ({ portfolio_value: '1' }) });
    expect(await p.verify(creds)).toBe(true);
  });

  it('maps account + positions into a snapshot', async () => {
    const p = provider({
      getAccount: async () => ({ portfolio_value: '10500.25', cash: '500.00', currency: 'USD' }),
      getPositions: async () => [
        { symbol: 'nvda', qty: '10', avg_entry_price: '200.5', market_value: '2124.5' },
        { symbol: 'AAPL', qty: '5', avg_entry_price: '180', market_value: '950' },
        { qty: '1' }, // junk row dropped (no symbol)
      ],
    });
    const snap = await p.fetchSnapshot(creds);
    expect(snap.account).toEqual({ accountValue: 10500.25, cash: 500, currency: 'USD' });
    expect(snap.positions).toHaveLength(2);
    expect(snap.positions[0]).toEqual({ symbol: 'NVDA', quantity: 10, avgCost: 200.5, marketValue: 2124.5 });
  });

  it('propagates errors from the positions call', async () => {
    const p = provider({
      getAccount: async () => ({}),
      getPositions: async () => { throw new Error('Alpaca positions failed'); },
    });
    await expect(p.fetchSnapshot(creds)).rejects.toThrow(/positions/);
  });
});
