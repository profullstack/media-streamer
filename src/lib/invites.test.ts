import { describe, expect, it, vi } from 'vitest';
import {
  InviteAllowanceExhausted,
  createInvite,
  formatInviteCode,
  generateInviteCode,
  inviteLink,
  isInviteCodeShape,
  isOpenInvite,
  normalizeInviteCode,
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
    await expect(createInvite({ rpc } as never, 'u1', false, 'ABCDEFGHJK')).rejects.toBeInstanceOf(InviteAllowanceExhausted);
    expect(rpc).toHaveBeenCalledWith('create_invite', { p_user: 'u1', p_code: 'ABCDEFGHJK', p_unlimited: false });
  });
});
