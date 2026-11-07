import { describe, expect, it, vi } from 'vitest';
import { passFromUserinfo } from '@profullstack/coinpay-onboard/pass';
import { applyCoinpayPass, passSubscriptionUpdate } from './coinpay-pass';

const NOW = Date.parse('2026-11-07T00:00:00Z');
const END = '2026-12-07T00:00:00.000Z';
const claim = (pass: unknown) => passFromUserinfo({ pass }, new Date(NOW));
const active = claim({ active: true, expires_at: END });

describe('passSubscriptionUpdate', () => {
  it('gives Premium until the pass ends to a free, trial or lapsed account', () => {
    expect(passSubscriptionUpdate(null, active, NOW)).toMatchObject({ tier: 'premium', status: 'active', subscription_expires_at: END });
    expect(
      passSubscriptionUpdate({ tier: 'trial', status: 'active', subscription_started_at: null, subscription_expires_at: null }, active, NOW),
    ).toMatchObject({ tier: 'premium', subscription_expires_at: END });
    expect(
      passSubscriptionUpdate(
        { tier: 'family', status: 'active', subscription_started_at: null, subscription_expires_at: '2026-01-01T00:00:00Z' },
        active,
        NOW,
      ),
    ).toMatchObject({ tier: 'premium' });
  });

  it('keeps a running family plan and a longer paid term', () => {
    const family = { tier: 'family', status: 'active', subscription_started_at: '2026-10-01T00:00:00.000Z', subscription_expires_at: '2026-11-20T00:00:00.000Z' };
    expect(passSubscriptionUpdate(family, active, NOW)).toEqual({
      tier: 'family',
      status: 'active',
      subscription_started_at: '2026-10-01T00:00:00.000Z',
      subscription_expires_at: END,
    });
    expect(passSubscriptionUpdate({ ...family, subscription_expires_at: '2027-06-01T00:00:00.000Z' }, active, NOW)).toBeNull();
    expect(passSubscriptionUpdate({ ...family, subscription_expires_at: END }, active, NOW)).toBeNull();
  });

  it('ignores an inactive, expired or malformed pass', () => {
    expect(passSubscriptionUpdate(null, claim({ active: false, expires_at: END }), NOW)).toBeNull();
    expect(passSubscriptionUpdate(null, claim({ active: true, expires_at: '2026-01-01T00:00:00Z' }), NOW)).toBeNull();
    expect(passSubscriptionUpdate(null, claim({ active: true, expires_at: 'never' }), NOW)).toBeNull();
    expect(passSubscriptionUpdate(null, undefined, NOW)).toBeNull();
  });
});

describe('applyCoinpayPass', () => {
  function fakeClient(row: Record<string, unknown> | null) {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
        upsert,
      }),
    };
    return { client: client as never, upsert };
  }

  it('upserts the row for the bound user', async () => {
    const { client, upsert } = fakeClient(null);
    expect(await applyCoinpayPass(client, 'u1', active, NOW)).toBe(END);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', tier: 'premium', status: 'active', subscription_expires_at: END }),
      { onConflict: 'user_id' },
    );
  });

  it('writes nothing when the pass does not extend access', async () => {
    const { client, upsert } = fakeClient({ tier: 'premium', status: 'active', subscription_started_at: null, subscription_expires_at: '2027-01-01T00:00:00Z' });
    expect(await applyCoinpayPass(client, 'u1', active, NOW)).toBeNull();
    expect(await applyCoinpayPass(client, 'u1', claim({ active: false }), NOW)).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});
