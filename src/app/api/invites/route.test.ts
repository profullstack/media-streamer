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
const req = (method = 'GET') => new NextRequest('https://bittorrented.com/api/invites', { method });

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
    expect(rpc).toHaveBeenCalledWith('create_invite', expect.objectContaining({ p_user: 'u1', p_unlimited: false }));
  });

  it('answers 429 once the allowance is spent', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invite_allowance_exhausted' } });
    const res = await POST(req('POST'));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/next month/);
  });

  it('lets admins create without a limit', async () => {
    admin.mockResolvedValue({ isAdmin: true });
    rpc.mockResolvedValue({ data: { code: 'ZZZZZZZZZZ', created_at: '2026-10-06T00:00:00Z', used_at: null }, error: null });
    const body = await (await POST(req('POST'))).json();
    expect(body.unlimited).toBe(true);
    expect(rpc).toHaveBeenCalledWith('create_invite', expect.objectContaining({ p_unlimited: true }));
    expect(rpc).not.toHaveBeenCalledWith('invite_balance', expect.anything());
  });
});
