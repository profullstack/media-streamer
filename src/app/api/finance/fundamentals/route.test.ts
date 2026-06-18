/**
 * Tests for GET /api/finance/fundamentals
 *
 * Verifies paid gating runs first, symbol validation, and that a fetch/parse
 * failure soft-fails to `{ fundamentals: null }` rather than breaking the page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

const mockRequireActiveSubscription = vi.fn();
vi.mock('@/lib/subscription/guard', () => ({
  requireActiveSubscription: (req: NextRequest) => mockRequireActiveSubscription(req),
}));

const mockGetFinvizFundamentals = vi.fn();
vi.mock('@/lib/finance/market-data', () => ({
  getFinvizFundamentals: (symbol: string) => mockGetFinvizFundamentals(symbol),
}));

// Read-through cache: pass through to the fetcher so we exercise the provider.
vi.mock('@/lib/finance/market-data/cache', () => ({
  FUNDAMENTALS_TTL_SECONDS: 21600,
  readThrough: <T,>(_s: string, _k: string, _ttl: number, fetcher: () => Promise<T>) => fetcher(),
}));

function req(symbol?: string): NextRequest {
  const url = symbol
    ? `http://localhost/api/finance/fundamentals?symbol=${symbol}`
    : 'http://localhost/api/finance/fundamentals';
  return new NextRequest(url);
}

describe('GET /api/finance/fundamentals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the gate response when the subscription check fails (paid-gated)', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(
      NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    );
    const res = await GET(req('SPY'));
    expect(res.status).toBe(401);
    expect(mockGetFinvizFundamentals).not.toHaveBeenCalled();
  });

  it('400s on an invalid symbol', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(null);
    const res = await GET(req('!!!'));
    expect(res.status).toBe(400);
  });

  it('returns the fundamentals for a paid user', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(null);
    mockGetFinvizFundamentals.mockResolvedValueOnce({
      symbol: 'SPY',
      source: 'finviz',
      metrics: [{ label: 'Beta', value: '1.01', tone: null }],
      description: null,
      asOf: 1,
    });
    const res = await GET(req('spy'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fundamentals.symbol).toBe('SPY');
    expect(mockGetFinvizFundamentals).toHaveBeenCalledWith('SPY');
  });

  it('soft-fails to null when the source throws (never breaks the page)', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(null);
    mockGetFinvizFundamentals.mockRejectedValueOnce(new Error('403'));
    const res = await GET(req('SPY'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fundamentals).toBeNull();
  });
});
