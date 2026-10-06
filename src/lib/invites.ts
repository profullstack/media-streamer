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

/** Whether a code exists and has not been used. The signup trigger is what enforces it. */
export async function isOpenInvite(client: AnyClient, code: string): Promise<boolean> {
  if (!isInviteCodeShape(code)) return false;
  const { data, error } = await client
    .from('invites')
    .select('id')
    .eq('code', code)
    .is('used_at', null)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function inviteBalance(client: AnyClient, userId: string): Promise<number> {
  const { data, error } = await client.rpc('invite_balance', { p_user: userId });
  if (error) throw new Error(`invite_balance failed: ${error.message}`);
  return Number(data) || 0;
}

export async function listInvites(client: AnyClient, userId: string): Promise<Invite[]> {
  const { data, error } = await client
    .from('invites')
    .select('code, created_at, used_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listing invites failed: ${error.message}`);
  return (data ?? []).map((row: { code: string; created_at: string; used_at: string | null }) => ({
    code: row.code,
    createdAt: row.created_at,
    usedAt: row.used_at,
  }));
}

export class InviteAllowanceExhausted extends Error {
  constructor() {
    super('No invites left this month');
  }
}

/** Spend one invite. Admins pass `unlimited`; everyone else is held to the balance. */
export async function createInvite(
  client: AnyClient,
  userId: string,
  unlimited: boolean,
  code: string = generateInviteCode()
): Promise<Invite> {
  const { data, error } = await client.rpc('create_invite', {
    p_user: userId,
    p_code: code,
    p_unlimited: unlimited,
  });
  if (error) {
    if (error.message.includes('invite_allowance_exhausted')) throw new InviteAllowanceExhausted();
    throw new Error(`create_invite failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { code: string; created_at: string; used_at: string | null };
  return { code: row.code, createdAt: row.created_at, usedAt: row.used_at };
}
