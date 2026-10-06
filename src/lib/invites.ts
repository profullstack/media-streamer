/**
 * Invites: bittorrented.com is invite only.
 *
 * Anthony, 2026-10-06: "show invite only screen and signup needs a required invite code
 * to register", "a user should be able to generate 5 invites a month", "balance carries
 * over to next month".
 *
 * The rules live in the database (supabase/migrations/20261006010000_invite_only_signup.sql):
 * a trigger on auth.users consumes the code for every way an account can be made, and
 * create_invite() spends the monthly allowance under a per-member lock. This module only
 * makes codes, normalises what people type, and calls those functions.
 */

import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

/** Invites a member gets each month; unused ones carry over. */
export const MONTHLY_INVITES = 5;

/** No 0/O, 1/I/L: a code is read off a screen and typed by hand. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

export interface Invite {
  code: string;
  createdAt: string;
  usedAt: string | null;
  /** Null: never expires. */
  expiresAt: string | null;
  /** Null: any number of signups (admins only). */
  maxUses: number | null;
  useCount: number;
}

/** What the create dialog may ask for. Null in either field means no limit. */
export interface InviteLimits {
  maxUses: number | null;
  expiresAt: string | null;
}

/** The most uses one invite may allow, so a typo cannot read as a huge number. */
export const MAX_USES_CAP = 1000;

interface InviteRow {
  code: string;
  created_at: string;
  used_at: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  use_count?: number | null;
}

const INVITE_COLUMNS = 'code, created_at, used_at, expires_at, max_uses, use_count';

function fromRow(row: InviteRow): Invite {
  return {
    code: row.code,
    createdAt: row.created_at,
    usedAt: row.used_at,
    expiresAt: row.expires_at ?? null,
    maxUses: row.max_uses === undefined ? 1 : row.max_uses,
    useCount: row.use_count ?? (row.used_at ? 1 : 0),
  };
}

/** Whether an invite still lets someone sign up. The signup trigger is what enforces it. */
export function isInviteOpen(invite: Pick<Invite, 'expiresAt' | 'maxUses' | 'useCount'>, now = Date.now()): boolean {
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= now) return false;
  return invite.maxUses === null || invite.useCount < invite.maxUses;
}

export class InviteLimitsInvalid extends Error {}

/**
 * Check the dialog's body. `maxUses` is a positive whole number or null (no limit);
 * `expiresAt` is a future ISO date-time or null (never). A missing body is one use,
 * no expiry: what "Create invite" always made.
 */
export function parseInviteLimits(body: unknown, now = Date.now()): InviteLimits {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  let maxUses: number | null = 1;
  if ('maxUses' in b) {
    if (b.maxUses === null || b.maxUses === '') maxUses = null;
    else {
      const n = Number(b.maxUses);
      if (!Number.isInteger(n) || n < 1 || n > MAX_USES_CAP) {
        throw new InviteLimitsInvalid(`Uses must be a whole number from 1 to ${MAX_USES_CAP}, or no limit`);
      }
      maxUses = n;
    }
  }
  let expiresAt: string | null = null;
  if (b.expiresAt !== undefined && b.expiresAt !== null && b.expiresAt !== '') {
    const t = typeof b.expiresAt === 'string' ? Date.parse(b.expiresAt) : NaN;
    if (!Number.isFinite(t)) throw new InviteLimitsInvalid('The expiry is not a date');
    if (t <= now) throw new InviteLimitsInvalid('The expiry must be in the future');
    expiresAt = new Date(t).toISOString();
  }
  return { maxUses, expiresAt };
}

/** Upper case, letters and digits only: what the database stores and compares. */
export function normalizeInviteCode(input: unknown): string {
  return typeof input === 'string' ? input.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
}

/** A well-formed code, before asking the database whether it exists. */
export function isInviteCodeShape(code: string): boolean {
  return /^[A-Z0-9]{10}$/.test(code);
}

/** `ABCDEFGHJK` -> `ABCDE-FGHJK`, for showing and sharing. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function generateInviteCode(pick: (max: number) => number = randomInt): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[pick(ALPHABET.length)];
  return code;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin}/signup?invite=${formatInviteCode(code)}`;
}

/** Whether a code exists, has not expired and has uses left. The signup trigger is what enforces it. */
export async function isOpenInvite(client: AnyClient, code: string): Promise<boolean> {
  if (!isInviteCodeShape(code)) return false;
  const { data, error } = await client.from('invites').select(INVITE_COLUMNS).eq('code', code).maybeSingle();
  return !error && Boolean(data) && isInviteOpen(fromRow(data as InviteRow));
}

export async function inviteBalance(client: AnyClient, userId: string): Promise<number> {
  const { data, error } = await client.rpc('invite_balance', { p_user: userId });
  if (error) throw new Error(`invite_balance failed: ${error.message}`);
  return Number(data) || 0;
}

export async function listInvites(client: AnyClient, userId: string): Promise<Invite[]> {
  const { data, error } = await client
    .from('invites')
    .select(INVITE_COLUMNS)
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listing invites failed: ${error.message}`);
  return ((data ?? []) as InviteRow[]).map(fromRow);
}

export class InviteAllowanceExhausted extends Error {
  constructor() {
    super('No invites left this month');
  }
}

/**
 * Make an invite. It costs one of the allowance per allowed use; admins pass
 * `unlimited` and may also leave the uses open (null). Everyone may set an expiry.
 */
export async function createInvite(
  client: AnyClient,
  userId: string,
  unlimited: boolean,
  limits: InviteLimits = { maxUses: 1, expiresAt: null },
  code: string = generateInviteCode()
): Promise<Invite> {
  if (!unlimited && limits.maxUses === null) {
    throw new InviteLimitsInvalid('Only admins can make an invite with no use limit');
  }
  const { data, error } = await client.rpc('create_invite', {
    p_user: userId,
    p_code: code,
    p_unlimited: unlimited,
    p_max_uses: limits.maxUses,
    p_expires_at: limits.expiresAt,
  });
  if (error) {
    if (error.message.includes('invite_allowance_exhausted')) throw new InviteAllowanceExhausted();
    if (error.message.includes('invite_unlimited_uses_admin_only')) {
      throw new InviteLimitsInvalid('Only admins can make an invite with no use limit');
    }
    if (error.message.includes('invite_bad_')) throw new InviteLimitsInvalid('Those limits are not valid');
    throw new Error(`create_invite failed: ${error.message}`);
  }
  return fromRow((Array.isArray(data) ? data[0] : data) as InviteRow);
}
