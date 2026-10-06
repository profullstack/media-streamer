import { describe, expect, it, vi } from 'vitest';
import {
  InviteAllowanceExhausted,
  InviteLimitsInvalid,
  createInvite,
  formatInviteCode,
  generateInviteCode,
  inviteLink,
  isInviteCodeShape,
  isInviteOpen,
  isOpenInvite,
  normalizeInviteCode,
  parseInviteLimits,
} from './invites';

describe('invite codes', () => {
  it('normalises what people type to what the database stores', () => {
    expect(normalizeInviteCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(normalizeInviteCode('ABCDE FGHJK')).toBe('ABCDEFGHJK');
    expect(normalizeInviteCode(undefined)).toBe('');
    expect(normalizeInviteCode(42)).toBe('');
  });

  it('makes 10-character codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
      expect(isInviteCodeShape(code)).toBe(true);
    }
  });

  it('formats and links a code', () => {
    expect(formatInviteCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(inviteLink('https://bittorrented.com', 'ABCDEFGHJK')).toBe('https://bittorrented.com/signup?invite=ABCDE-FGHJK');
  });

  it('does not ask the database about a malformed code', async () => {
    const from = vi.fn();
    expect(await isOpenInvite({ from } as never, 'SHORT')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('turns the database refusing a spend into InviteAllowanceExhausted', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'invite_allowance_exhausted' } });
    await expect(createInvite({ rpc } as never, 'u1', false, { maxUses: 2, expiresAt: null }, 'ABCDEFGHJK')).rejects.toBeInstanceOf(
      InviteAllowanceExhausted
    );
    expect(rpc).toHaveBeenCalledWith('create_invite', {
      p_user: 'u1',
      p_code: 'ABCDEFGHJK',
      p_unlimited: false,
      p_max_uses: 2,
      p_expires_at: null,
    });
  });

  it('refuses an invite with no use limit for a member before asking the database', async () => {
    const rpc = vi.fn();
    await expect(createInvite({ rpc } as never, 'u1', false, { maxUses: null, expiresAt: null })).rejects.toBeInstanceOf(
      InviteLimitsInvalid
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('invite limits', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');

  it('defaults to one use and no expiry, what Create invite always made', () => {
    expect(parseInviteLimits(undefined, now)).toEqual({ maxUses: 1, expiresAt: null });
    expect(parseInviteLimits({}, now)).toEqual({ maxUses: 1, expiresAt: null });
  });

  it('takes null for no limit on either, which works forever', () => {
    expect(parseInviteLimits({ maxUses: null, expiresAt: null }, now)).toEqual({ maxUses: null, expiresAt: null });
  });

  it('takes a use count and a future expiry', () => {
    expect(parseInviteLimits({ maxUses: 3, expiresAt: '2026-10-13T23:59:59.999Z' }, now)).toEqual({
      maxUses: 3,
      expiresAt: '2026-10-13T23:59:59.999Z',
    });
  });

  it('rejects bad uses and past or unparseable expiries', () => {
    for (const maxUses of [0, -1, 1.5, 'x', 100000]) {
      expect(() => parseInviteLimits({ maxUses }, now)).toThrow(InviteLimitsInvalid);
    }
    expect(() => parseInviteLimits({ expiresAt: '2026-10-01T00:00:00Z' }, now)).toThrow(/future/);
    expect(() => parseInviteLimits({ expiresAt: 'soon' }, now)).toThrow(/not a date/);
  });

  it('knows when an invite still works', () => {
    expect(isInviteOpen({ maxUses: null, useCount: 999, expiresAt: null }, now)).toBe(true);
    expect(isInviteOpen({ maxUses: 2, useCount: 1, expiresAt: null }, now)).toBe(true);
    expect(isInviteOpen({ maxUses: 2, useCount: 2, expiresAt: null }, now)).toBe(false);
    expect(isInviteOpen({ maxUses: null, useCount: 0, expiresAt: '2026-10-06T11:59:59Z' }, now)).toBe(false);
    expect(isInviteOpen({ maxUses: null, useCount: 0, expiresAt: '2026-10-07T00:00:00Z' }, now)).toBe(true);
  });
});
