import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock supabase
const mockUpdate = vi.fn(() => ({ error: null }));
const mockIn = vi.fn(() => ({ error: null }));
const mockLt = vi.fn(() => ({ data: [], error: null }));
const mockEq2 = vi.fn(() => ({ lt: mockLt }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockIn2 = vi.fn(() => ({ eq: (col: string) => ({ lt: mockLt }) }));
const mockSelect = vi.fn(() => ({ eq: mockEq1, in: mockIn2 }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: vi.fn(() => ({ in: mockIn })),
}));

vi.mock('@/lib/supabase/client', () => ({
  getServerClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [] } }) } },
  })),
}));

vi.mock('@/lib/email', () => ({
  getEmailService: vi.fn(() => ({
    sendTrialExpired: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['authorization'] = `Bearer ${secret}`;
  return new NextRequest('http://localhost/api/cron/expire-subscriptions', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/cron/expire-subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it('should return 200 with counts when no secret required', async () => {
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty('trialsExpired');
    expect(json).toHaveProperty('emailsSent');
  });

  it('should reject unauthorized requests when secret is set', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const res = await POST(makeRequest('wrong'));
    expect(res.status).toBe(401);
  });

  it('should accept authorized requests when secret matches', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const res = await POST(makeRequest('my-secret'));
    expect(res.status).toBe(200);
  });
});
