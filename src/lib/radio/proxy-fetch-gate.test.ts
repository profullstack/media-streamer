import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const undiciFetch = vi.fn();
vi.mock('undici', () => ({ fetch: (...args: unknown[]) => undiciFetch(...args) }));

import { proxyFetch } from './proxy-fetch';
import { ProxyBudgetError, proxyBudgetCounts, resetProxyBudget, withProxyScope } from './proxy-budget';
import { withSiriusXmUser } from './siriusxm-auth';

function body(bytes: number): Response {
  return new Response(new Uint8Array(bytes), { status: 200 });
}

beforeEach(() => {
  resetProxyBudget();
  undiciFetch.mockReset();
  undiciFetch.mockImplementation(async () => body(64));
});
afterEach(() => resetProxyBudget());

describe('proxyFetch is the gate onto the paid proxy', () => {
  it('a plain fetch (no dispatcher) is neither gated nor counted', async () => {
    const res = await proxyFetch('https://example.test/');
    expect(res.status).toBe(200);
    expect(undiciFetch).toHaveBeenCalledTimes(1);
    expect(proxyBudgetCounts('user:x').globalBytes).toBe(0);
  });

  it('a proxied fetch outside any scope is refused before it leaves', async () => {
    const dispatcher = {} as never;
    await expect(proxyFetch('https://example.test/', { dispatcher })).rejects.toThrowError(
      ProxyBudgetError,
    );
    expect(undiciFetch).not.toHaveBeenCalled();
  });

  it('withSiriusXmUser establishes the scope and the bytes are charged to that user', async () => {
    const dispatcher = {} as never;
    await withSiriusXmUser('u1', async () => {
      const res = await proxyFetch('https://example.test/seg.aac', { dispatcher });
      await res.arrayBuffer();
    });
    expect(proxyBudgetCounts('user:u1')).toMatchObject({ scopeBytes: 64, scopeInFlight: 0 });
  });

  it('a network failure releases the slot', async () => {
    const dispatcher = {} as never;
    undiciFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
    await withProxyScope('user:u2', async () => {
      await expect(proxyFetch('https://example.test/', { dispatcher })).rejects.toThrow('ECONNRESET');
    });
    expect(proxyBudgetCounts('user:u2').scopeInFlight).toBe(0);
  });
});
