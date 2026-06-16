/**
 * Tests for GET /api/finance/quote
 *
 * Verifies paid gating runs first and the quote shape on success.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';

const mockRequireActiveSubscription = vi.fn();
vi.mock('@/lib/subscription/guard', () => ({
  requireActiveSubscription: (req: NextRequest) => mockRequireActiveSubscription(req),
}));

const mockGetQuote = vi.fn();
vi.mock('@/lib/finance/market-data', () => ({
  getMarketDataProvider: () => ({ id: 'stub', getQuote: mockGetQuote }),
}));

// Read-through cache: pass through to the fetcher so we exercise the provider.
vi.mock('@/lib/finance/market-data/cache', () => ({
  QUOTE_TTL_SECONDS: 300,
  readThrough: <T,>(_s: string, _k: string, _ttl: number, fetcher: () => Promise<T>) => fetcher(),
}));

function req(symbol?: string): NextRequest {
  const url = symbol ? `http://localhost/api/finance/quote?symbol=${symbol}` : 'http://localhost/api/finance/quote';
  return new NextRequest(url);
}

describe('GET /api/finance/quote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the gate response when subscription check fails (paid-gated)', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(
      NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    );

    const res = await GET(req('NVDA'));
    expect(res.status).toBe(401);
    expect(mockGetQuote).not.toHaveBeenCalled();
  });

  it('400s on missing symbol', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(400);
  });

  it('400s on invalid symbol', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(null);
    const res = await GET(req('!!!'));
    expect(res.status).toBe(400);
  });

  it('404s when the provider has no data', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(null);
    mockGetQuote.mockResolvedValueOnce(null);
    const res = await GET(req('NVDA'));
    expect(res.status).toBe(404);
  });

  it('returns the quote for a paid user', async () => {
    mockRequireActiveSubscription.mockResolvedValueOnce(null);
    mockGetQuote.mockResolvedValueOnce({ symbol: 'NVDA', price: 102 });
    const res = await GET(req('nvda'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quote.symbol).toBe('NVDA');
    expect(mockGetQuote).toHaveBeenCalledWith('NVDA');
  });
});
