import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProxyBudgetError,
  admitProxiedRequest,
  evaluateProxyBudget,
  meterResponse,
  proxyBudgetCounts,
  proxyBudgetResponse,
  resetProxyBudget,
  withProxyScope,
  type ProxyBudgetConfig,
} from './proxy-budget';

const config: ProxyBudgetConfig = {
  bytesPerScopePerDay: 1000,
  bytesGlobalPerDay: 2500,
  requestsPerScopePerMinute: 3,
  maxConcurrentPerScope: 2,
  maxConcurrentGlobal: 3,
};

function streamOf(...chunks: number[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const n of chunks) controller.enqueue(new Uint8Array(n));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'audio/aac' } },
  );
}

async function drain(res: Response): Promise<number> {
  return (await res.arrayBuffer()).byteLength;
}

beforeEach(() => resetProxyBudget());
afterEach(() => resetProxyBudget());

describe('evaluateProxyBudget (pure policy)', () => {
  const zero = { scopeBytes: 0, globalBytes: 0, scopeRequests: 0, scopeInFlight: 0, globalInFlight: 0 };

  it('allows when everything is under cap', () => {
    expect(evaluateProxyBudget(zero, config)).toEqual({ allowed: true });
  });

  it('the global byte cap wins over everything else', () => {
    expect(evaluateProxyBudget({ ...zero, globalBytes: 2500, scopeInFlight: 9 }, config)).toEqual({
      allowed: false,
      kind: 'bytes',
      level: 'global',
    });
  });

  it('refuses a scope that has spent its bytes', () => {
    expect(evaluateProxyBudget({ ...zero, scopeBytes: 1000 }, config)).toMatchObject({
      allowed: false,
      kind: 'bytes',
      level: 'scope',
    });
  });

  it('refuses on concurrency before requests-per-minute', () => {
    expect(evaluateProxyBudget({ ...zero, scopeInFlight: 2, scopeRequests: 99 }, config)).toMatchObject({
      kind: 'concurrency',
      level: 'scope',
    });
    expect(evaluateProxyBudget({ ...zero, globalInFlight: 3 }, config)).toMatchObject({
      kind: 'concurrency',
      level: 'global',
    });
  });

  it('refuses a scope making too many requests', () => {
    expect(evaluateProxyBudget({ ...zero, scopeRequests: 3 }, config)).toMatchObject({
      kind: 'requests',
    });
  });
});

describe('admitProxiedRequest (gate)', () => {
  it('refuses a proxied request outside any scope', () => {
    expect(() => admitProxiedRequest(null, config)).toThrowError(ProxyBudgetError);
    try {
      admitProxiedRequest(null, config);
    } catch (err) {
      expect((err as ProxyBudgetError).kind).toBe('ungated');
    }
  });

  it('takes the scope from withProxyScope', async () => {
    await withProxyScope('user:a', async () => {
      const lease = admitProxiedRequest(undefined, config);
      expect(lease.scope).toBe('user:a');
      expect(proxyBudgetCounts('user:a').scopeInFlight).toBe(1);
      lease.release();
      lease.release(); // idempotent
      expect(proxyBudgetCounts('user:a').scopeInFlight).toBe(0);
    });
  });

  it('caps concurrent streams per scope and globally', () => {
    const a1 = admitProxiedRequest('user:a', config);
    admitProxiedRequest('user:a', config);
    expect(() => admitProxiedRequest('user:a', config)).toThrowError(/streams open for this account/);

    admitProxiedRequest('user:b', config);
    expect(() => admitProxiedRequest('user:c', config)).toThrowError(/streams open right now/);

    a1.release();
    expect(() => admitProxiedRequest('user:c', config)).not.toThrow();
  });

  it('caps requests per minute per scope, releasing slots as it goes', () => {
    for (let i = 0; i < 3; i++) admitProxiedRequest('user:a', config).release();
    expect(() => admitProxiedRequest('user:a', config)).toThrowError(/Too many proxied requests/);
    // Another scope is unaffected.
    expect(() => admitProxiedRequest('user:b', config)).not.toThrow();
  });

  it('charges bytes to the scope and to the global pool', () => {
    const lease = admitProxiedRequest('user:a', config);
    lease.charge(400);
    lease.release();
    expect(proxyBudgetCounts('user:a')).toMatchObject({ scopeBytes: 400, globalBytes: 400 });
    expect(proxyBudgetCounts('user:b')).toMatchObject({ scopeBytes: 0, globalBytes: 400 });
  });

  it('throws mid-stream once the scope budget is spent, with a Retry-After', () => {
    const lease = admitProxiedRequest('user:a', config);
    lease.charge(999);
    expect(() => lease.charge(1)).toThrowError(ProxyBudgetError);
    lease.release();

    expect(() => admitProxiedRequest('user:a', config)).toThrowError(/budget exhausted for this account/);
    try {
      admitProxiedRequest('user:a', config);
    } catch (err) {
      const e = err as ProxyBudgetError;
      expect(e.retryAfterSeconds).toBeGreaterThanOrEqual(60);
      expect(e.retryAfterSeconds).toBeLessThanOrEqual(24 * 60 * 60);
      const res = proxyBudgetResponse(e);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe(String(e.retryAfterSeconds));
    }
  });

  it('forgets bytes after 24 hours', () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.parse('2026-09-04T00:00:00Z');
      vi.setSystemTime(t0);
      const lease = admitProxiedRequest('user:a', config, t0);
      lease.charge(999);
      lease.release();
      expect(proxyBudgetCounts('user:a', t0).scopeBytes).toBe(999);
      expect(proxyBudgetCounts('user:a', t0 + 23 * 60 * 60 * 1000).scopeBytes).toBe(999);
      expect(proxyBudgetCounts('user:a', t0 + 24 * 60 * 60 * 1000 + 60_000).scopeBytes).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('meterResponse', () => {
  it('charges every chunk as it streams and releases the slot at the end', async () => {
    const lease = admitProxiedRequest('user:a', config);
    const res = meterResponse(streamOf(100, 200, 50), lease);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/aac');
    expect(proxyBudgetCounts('user:a').scopeInFlight).toBe(1);

    expect(await drain(res)).toBe(350);
    expect(proxyBudgetCounts('user:a')).toMatchObject({ scopeBytes: 350, scopeInFlight: 0 });
  });

  it('cuts the stream off when the budget runs out mid-body', async () => {
    const lease = admitProxiedRequest('user:a', config);
    const res = meterResponse(streamOf(600, 600, 600), lease);

    await expect(drain(res)).rejects.toThrowError(ProxyBudgetError);
    expect(proxyBudgetCounts('user:a').scopeInFlight).toBe(0);
    // The chunk that crossed the line is still counted as sent.
    expect(proxyBudgetCounts('user:a').scopeBytes).toBe(1200);
  });

  it('releases the slot when the reader cancels (listener went away)', async () => {
    const lease = admitProxiedRequest('user:a', config);
    const res = meterResponse(streamOf(10, 10, 10), lease);
    await res.body!.cancel();
    expect(proxyBudgetCounts('user:a').scopeInFlight).toBe(0);
  });

  it('releases immediately for a body-less response', () => {
    const lease = admitProxiedRequest('user:a', config);
    meterResponse(new Response(null, { status: 204 }), lease);
    expect(proxyBudgetCounts('user:a').scopeInFlight).toBe(0);
  });
});
