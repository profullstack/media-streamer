/**
 * Tests for /api/finance/report — gating, no-spend cache, rate limit, success.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGate = vi.fn();
vi.mock('@/lib/subscription/guard', () => ({
  requireActiveSubscription: (req: NextRequest) => mockGate(req),
}));

vi.mock('@/lib/profiles/profile-utils', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('profile-1'),
}));

vi.mock('@/lib/finance/market-data', () => ({
  getMarketDataProvider: () => ({
    getQuote: async () => ({ symbol: 'NVDA', price: 100 }),
    getCandles: async () => [],
  }),
}));

const m = vi.hoisted(() => ({
  getCachedReport: vi.fn(),
  countRunsSince: vi.fn(),
  evaluateRateLimit: vi.fn(),
  generateReport: vi.fn(),
  saveReport: vi.fn(),
  logRun: vi.fn(),
  createOpenAIReportLLM: vi.fn(() => ({ complete: vi.fn() })),
  buildReportInputs: vi.fn(() => ({ symbol: 'NVDA' })),
  getRateLimitConfig: vi.fn(() => ({ perUserPerDay: 10, globalPerDay: 200 })),
  rollingWindowStart: vi.fn(() => '2026-06-15T00:00:00Z'),
  getReportModel: vi.fn(() => 'test-model'),
  PROMPT_VERSION: 1,
}));
vi.mock('@/lib/finance/analysis', () => m);

import { GET, POST } from './route';

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/finance/report', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/finance/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test';
    m.getReportModel.mockReturnValue('test-model');
    m.getRateLimitConfig.mockReturnValue({ perUserPerDay: 10, globalPerDay: 200 });
    m.rollingWindowStart.mockReturnValue('2026-06-15T00:00:00Z');
    m.buildReportInputs.mockReturnValue({ symbol: 'NVDA' });
  });

  it('GET returns the gate response when not paid', async () => {
    mockGate.mockResolvedValueOnce(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
    const res = await GET(new NextRequest('http://localhost/api/finance/report?symbol=NVDA'));
    expect(res.status).toBe(401);
  });

  it('GET 404s when no cached report exists', async () => {
    mockGate.mockResolvedValueOnce(null);
    m.getCachedReport.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest('http://localhost/api/finance/report?symbol=NVDA'));
    expect(res.status).toBe(404);
  });

  it('POST serves fresh cache without spending tokens', async () => {
    mockGate.mockResolvedValueOnce(null);
    m.getCachedReport.mockResolvedValueOnce({ symbol: 'NVDA', expired: false });
    const res = await POST(postReq({ symbol: 'NVDA' }));
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(m.generateReport).not.toHaveBeenCalled();
    expect(m.countRunsSince).not.toHaveBeenCalled();
  });

  it('POST returns 429 and logs when rate limited', async () => {
    mockGate.mockResolvedValueOnce(null);
    m.getCachedReport.mockResolvedValueOnce(null);
    m.countRunsSince.mockResolvedValueOnce({ user: 10, global: 20 });
    m.evaluateRateLimit.mockReturnValueOnce({ allowed: false, scope: 'user', reason: 'limit' });
    const res = await POST(postReq({ symbol: 'NVDA' }));
    expect(res.status).toBe(429);
    expect(m.generateReport).not.toHaveBeenCalled();
    expect(m.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'rate_limited' }));
  });

  it('POST generates, saves, and logs a successful run', async () => {
    mockGate.mockResolvedValueOnce(null);
    m.getCachedReport.mockResolvedValueOnce(null);
    m.countRunsSince.mockResolvedValueOnce({ user: 0, global: 0 });
    m.evaluateRateLimit.mockReturnValueOnce({ allowed: true });
    const report = {
      symbol: 'NVDA',
      usage: { promptTokens: 5, completionTokens: 4, totalTokens: 9, costUsd: 0.01 },
    };
    m.generateReport.mockResolvedValueOnce(report);

    const res = await POST(postReq({ symbol: 'NVDA', refresh: true }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.report.symbol).toBe('NVDA');
    expect(m.saveReport).toHaveBeenCalledWith(report, 'profile-1');
    expect(m.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', totalTokens: 9 }));
  });

  it('POST 400s on invalid symbol', async () => {
    mockGate.mockResolvedValueOnce(null);
    const res = await POST(postReq({ symbol: '!!!' }));
    expect(res.status).toBe(400);
  });
});
