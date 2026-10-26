import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Credits, memoryStore } from '@profullstack/redeem-credits';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getServerClient: () => ({ rpc }) }));

const rewards = await import('./rewards');

describe('rewards: Premium days', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewards.resetRewards();
  });

  it('puts a redeemed premium_days code on the subscription, once per source', async () => {
    rpc.mockResolvedValue({ data: '2026-12-01T00:00:00Z', error: null });
    const credits = new Credits(memoryStore(), {
      onGrant: (userId, grant, source) => rewards.applyGrant(userId, grant, source),
    });
    const { code } = await credits.mint({ grant: { unit: 'premium_days', amount: 30 }, prefix: 'BT' });
    expect(code).toMatch(/^BT-/);

    const ok = await credits.redeem(code.toLowerCase(), 'u1');
    expect(ok).toMatchObject({ ok: true, grant: { unit: 'premium_days', amount: 30 } });
    expect(rpc).toHaveBeenCalledWith('grant_premium_days', {
      p_user_id: 'u1',
      p_days: 30,
      p_source: expect.stringMatching(/^code:/),
    });

    expect(await credits.redeem(code, 'u1')).toEqual({ ok: false, reason: 'already_redeemed' });
    expect(await credits.redeem(code, 'u2')).toEqual({ ok: false, reason: 'used_up' });
    expect(await credits.redeem('BT-0000-0000-0000-0000', 'u2')).toEqual({ ok: false, reason: 'invalid' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('refuses a unit bittorrented does not sell', async () => {
    await expect(rewards.applyGrant('u1', { unit: 'minutes', amount: 5 }, 'x')).rejects.toThrow(/Unsupported/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces a database error from grant_premium_days', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(rewards.grantPremiumDays('u1', 3, 'code:x')).rejects.toThrow(/boom/);
  });

  it('has a friendly message for every refusal', () => {
    for (const reason of ['invalid', 'expired', 'used_up', 'already_redeemed', 'revoked'] as const) {
      expect(rewards.redeemMessage(reason)).toMatch(/code/i);
    }
  });

  it('checks mint limits before touching the database', async () => {
    await expect(rewards.mintPremiumCode({ days: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(rewards.mintPremiumCode({ days: 1.5 })).rejects.toBeInstanceOf(RangeError);
    await expect(rewards.mintPremiumCode({ days: 7, maxRedemptions: 0 })).rejects.toBeInstanceOf(RangeError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('rewards: invite bonus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks grant_invite_bonus for both sides with the cap', async () => {
    rpc.mockResolvedValue({ data: { reason: 'granted', invitee: 'a', inviter: 'b', inviter_id: 'u0' }, error: null });
    expect(await rewards.grantInviteBonus('u9')).toMatchObject({ reason: 'granted' });
    expect(rpc).toHaveBeenCalledWith('grant_invite_bonus', {
      p_user_id: 'u9',
      p_invitee_days: rewards.INVITE_BONUS_DAYS,
      p_inviter_days: rewards.INVITE_BONUS_DAYS,
      p_inviter_monthly_cap: rewards.INVITER_MONTHLY_CAP,
    });
  });

  it('never throws: a sign-in must not fail over a bonus', async () => {
    rpc.mockRejectedValue(new Error('down'));
    expect(await rewards.grantInviteBonus('u9')).toBeNull();
  });

  it('asks once per member once the answer is settled, but keeps asking while unconfirmed', async () => {
    rpc.mockResolvedValue({ data: { reason: 'unconfirmed' }, error: null });
    await rewards.ensureInviteBonus('pending');
    await rewards.ensureInviteBonus('pending');
    expect(rpc).toHaveBeenCalledTimes(2);

    rpc.mockResolvedValue({ data: { reason: 'not_invited' }, error: null });
    await rewards.ensureInviteBonus('settled');
    await rewards.ensureInviteBonus('settled');
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

describe('rewards: affiliate attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewards.resetRewards();
  });

  it('reads the existing referral_code cookie and attributes through aff_attribute', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const request = new Request('https://bittorrented.com/api/auth/signup', {
      method: 'POST',
      headers: { cookie: 'referral_code=E6KETYBK' },
    });
    await rewards.attributeSignup(request, 'new-user');
    const calls = rpc.mock.calls.map((c) => c[0] as string);
    expect(calls.some((fn) => fn.startsWith('aff_'))).toBe(true);
    expect(JSON.stringify(rpc.mock.calls)).toContain('E6KETYBK');
  });

  it('does nothing without a code, and never throws', async () => {
    await rewards.attributeSignup(new Request('https://bittorrented.com/api/auth/signup'), 'u1');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockRejectedValue(new Error('down'));
    await expect(
      rewards.attributeSignup(new Request('https://bittorrented.com/x?ref=ABCDEFGH'), 'u1')
    ).resolves.toBeUndefined();
  });
});
