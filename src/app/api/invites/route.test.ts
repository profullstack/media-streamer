import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const user = vi.fn();
const admin = vi.fn();
const rpc = vi.fn();
const order = vi.fn();

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: () => user() }));
vi.mock('@/lib/admin', () => ({ checkUserAdmin: () => admin() }));
vi.mock('@/lib/supabase', () => ({
  getServerClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
  }),
}));

const { GET, POST } = await import('./route');
const req = (method = 'GET', body?: unknown) =>
  new NextRequest('https://bittorrented.com/api/invites', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });

describe('/api/invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    user.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
    admin.mockResolvedValue({ isAdmin: false });
    order.mockResolvedValue({ data: [{ code: 'ABCDEFGHJK', created_at: '2026-10-06T00:00:00Z', used_at: null }], error: null });
  });

  it('is for signed-in members only', async () => {
    user.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req('POST'))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lists invites with shareable links and the balance', async () => {
    rpc.mockResolvedValue({ data: 4, error: null });
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ remaining: 4, unlimited: false, monthly: 5 });
    expect(body.invites[0]).toMatchObject({ code: 'ABCDE-FGHJK', link: 'https://bittorrented.com/signup?invite=ABCDE-FGHJK' });
    expect(rpc).toHaveBeenCalledWith('invite_balance', { p_user: 'u1' });
  });

  it('creates an invite held to the allowance', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'create_invite'
        ? { data: { code: 'ZZZZZZZZZZ', created_at: '2026-10-06T00:00:00Z', used_at: null }, error: null }
        : { data: 3, error: null }
    );
    const res = await POST(req('POST'));
    expect(res.status).toBe(201);
    expect((await res.json()).invite.code).toBe('ZZZZZ-ZZZZZ');
    expect(rpc).toHaveBeenCalledWith(
      'create_invite',
      expect.objectContaining({ p_user: 'u1', p_unlimited: false, p_max_uses: 1, p_expires_at: null })
    );
  });

  it('passes the dialog limits through', async () => {
    rpc.mockResolvedValue({ data: { code: 'ZZZZZZZZZZ', created_at: '2026-10-06T00:00:00Z', used_at: null, max_uses: 3, use_count: 0, expires_at: '2099-01-01T00:00:00.000Z' }, error: null });
    const res = await POST(req('POST', { maxUses: 3, expiresAt: '2099-01-01T00:00:00.000Z' }));
    expect(res.status).toBe(201);
    expect((await res.json()).invite).toMatchObject({ maxUses: 3, useCount: 0, expiresAt: '2099-01-01T00:00:00.000Z', open: true });
    expect(rpc).toHaveBeenCalledWith('create_invite', expect.objectContaining({ p_max_uses: 3, p_expires_at: '2099-01-01T00:00:00.000Z' }));
  });

  it('answers 400 for bad limits, and for a member asking for unlimited uses', async () => {
    expect((await POST(req('POST', { maxUses: 0 }))).status).toBe(400);
    expect((await POST(req('POST', { expiresAt: '2000-01-01T00:00:00Z' }))).status).toBe(400);
    const res = await POST(req('POST', { maxUses: null }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/admins/);
    expect(rpc).not.toHaveBeenCalledWith('create_invite', expect.anything());
  });

  it('answers 429 once the allowance is spent', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invite_allowance_exhausted' } });
    const res = await POST(req('POST'));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/next month/);
  });

  it('lets admins create an invite that works forever', async () => {
    admin.mockResolvedValue({ isAdmin: true });
    rpc.mockResolvedValue({ data: { code: 'ZZZZZZZZZZ', created_at: '2026-10-06T00:00:00Z', used_at: null, max_uses: null, use_count: 0, expires_at: null }, error: null });
    const body = await (await POST(req('POST', { maxUses: null, expiresAt: null }))).json();
    expect(body.unlimited).toBe(true);
    expect(body.invite).toMatchObject({ maxUses: null, expiresAt: null, open: true });
    expect(rpc).toHaveBeenCalledWith('create_invite', expect.objectContaining({ p_unlimited: true, p_max_uses: null, p_expires_at: null }));
    expect(rpc).not.toHaveBeenCalledWith('invite_balance', expect.anything());
  });
});
