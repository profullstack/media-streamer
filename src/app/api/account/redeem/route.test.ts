import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const user = vi.fn();
const redeem = vi.fn();
const sub = vi.fn();

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: () => user() }));
vi.mock('@/lib/supabase', () => ({
  getServerClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: sub }) }) }) }),
}));
vi.mock('@/lib/rewards', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rewards')>('@/lib/rewards');
  return { ...actual, getCredits: () => ({ redeem }) };
});

const { POST } = await import('./route');
const req = (body: unknown) =>
  new NextRequest('https://bittorrented.com/api/account/redeem', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('POST /api/account/redeem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    sub.mockResolvedValue({ data: { tier: 'premium', subscription_expires_at: '2026-12-01T00:00:00Z' } });
  });

  it('needs a signed-in member', async () => {
    user.mockResolvedValue(null);
    expect((await POST(req({ code: 'BT-1' }))).status).toBe(401);
    expect(redeem).not.toHaveBeenCalled();
  });

  it('asks for a code', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(redeem).not.toHaveBeenCalled();
  });

  it('redeems for Premium days and reports the new expiry', async () => {
    redeem.mockResolvedValue({ ok: true, grant: { unit: 'premium_days', amount: 30 }, codeId: 'c1' });
    const res = await POST(req({ code: ' bt-7k3m-qx9d-2f8h-w4tn ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      unit: 'premium_days',
      days: 30,
      tier: 'premium',
      expiresAt: '2026-12-01T00:00:00Z',
    });
    expect(redeem).toHaveBeenCalledWith('bt-7k3m-qx9d-2f8h-w4tn', 'u1');
  });

  it('explains a refusal', async () => {
    redeem.mockResolvedValue({ ok: false, reason: 'already_redeemed' });
    const res = await POST(req({ code: 'BT-X' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'already_redeemed', error: expect.stringMatching(/already/) });
  });
});
