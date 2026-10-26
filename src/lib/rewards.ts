/**
 * Credit codes, invite bonuses and affiliate links.
 *
 * Anthony, 2026-10-26: "mint him a token i can give him to redeem credits ... invite codes works,
 * it's scarce and conveys secret interest ... add credit code redemptions and invite
 * codes/(affiliate) to all properties".
 *
 * - Credit codes: @profullstack/redeem-credits, unit `premium_days`. A redeemed code becomes days
 *   of Premium through grant_premium_days(), which writes user_subscriptions: the row a paid plan
 *   already lives on. No second entitlement flag. The module's own ledger is only the audit trail.
 * - Invites: bittorrented already had scarce invites (5 a month, required to sign up, enforced
 *   by a trigger on auth.users; src/lib/invites.ts). They stay the invite system. What is new is
 *   the bonus: once an invited member has confirmed their email, both they and their inviter get
 *   INVITE_BONUS_DAYS of Premium (grant_invite_bonus(); the inviter at most
 *   INVITER_MONTHLY_CAP times a month).
 * - Affiliate links: @profullstack/affiliates. One stable ?ref= code per member; first touch is
 *   recorded at sign-up from the existing `referral_code` cookie (@profullstack/stack/referrals
 *   sets it in src/proxy.ts), so no second cookie and no double count.
 *
 * Every client is built lazily on first use, server side only: getServerClient() reads the
 * service role key at runtime.
 */

import { Credits, supabaseStore as creditStore, type Grant, type RedeemResult } from '@profullstack/redeem-credits';
import { Affiliates, supabaseStore as affiliateStore, refFromRequest } from '@profullstack/affiliates';
import { getServerClient } from '@/lib/supabase';

/** The unit a bittorrented credit code grants: days of Premium. */
export const PREMIUM_DAYS = 'premium_days';

/** Premium days an accepted invite gives the new member, and their inviter. */
export const INVITE_BONUS_DAYS = 7;

/** Invite rewards one inviter can collect in a calendar month (UTC). Matches the 5 invites a month. */
export const INVITER_MONTHLY_CAP = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Put `days` of Premium on a member, once per `source`. Returns the new expiry, or null when that
 * source was already granted (a retried hook adds nothing).
 */
export async function grantPremiumDays(
  userId: string,
  days: number,
  source: string,
  client: AnyClient = getServerClient()
): Promise<string | null> {
  const { data, error } = await client.rpc('grant_premium_days', {
    p_user_id: userId,
    p_days: days,
    p_source: source,
  });
  if (error) throw new Error(`grant_premium_days: ${error.message}`);
  return (data as string | null) ?? null;
}

/** The onGrant hook: every redeemed code (and admin grant) lands on user_subscriptions. */
export async function applyGrant(userId: string, grant: Grant, source: string, client?: AnyClient): Promise<void> {
  if (grant.unit !== PREMIUM_DAYS) {
    throw new Error(`Unsupported credit unit ${grant.unit}`);
  }
  await grantPremiumDays(userId, grant.amount, source, client);
}

let credits: Credits | undefined;
export function getCredits(): Credits {
  return (credits ??= new Credits(creditStore(getServerClient() as AnyClient), {
    onGrant: (userId, grant, source) => applyGrant(userId, grant, source),
  }));
}

let affiliates: Affiliates | undefined;
export function getAffiliates(): Affiliates {
  return (affiliates ??= new Affiliates(affiliateStore(getServerClient() as AnyClient)));
}

/** For tests. */
export function resetRewards(): void {
  credits = undefined;
  affiliates = undefined;
}

export type RedeemFailure = Extract<RedeemResult, { ok: false }>['reason'];

const REASONS: Record<RedeemFailure, string> = {
  invalid: 'That code is not valid. Check it and try again.',
  expired: 'That code has expired.',
  used_up: 'That code has already been used.',
  already_redeemed: 'You have already redeemed that code.',
  revoked: 'That code is no longer valid.',
};

export function redeemMessage(reason: RedeemFailure): string {
  return REASONS[reason] ?? 'That code is not valid.';
}

/** Mint a Premium-days code. Admin only; the plaintext comes back once and is never stored. */
export async function mintPremiumCode(opts: {
  days: number;
  label?: string;
  maxRedemptions?: number;
  expiresAt?: number | null;
  createdBy?: string;
}) {
  if (!Number.isInteger(opts.days) || opts.days < 1 || opts.days > 3660) {
    throw new RangeError('days must be a whole number from 1 to 3660');
  }
  const max = opts.maxRedemptions ?? 1;
  if (!Number.isInteger(max) || max < 1 || max > 10_000) {
    throw new RangeError('maxRedemptions must be a whole number from 1 to 10000');
  }
  return getCredits().mint({
    grant: { unit: PREMIUM_DAYS, amount: opts.days },
    label: opts.label ?? '',
    maxRedemptions: max,
    expiresAt: opts.expiresAt ?? null,
    prefix: 'BT',
    createdBy: opts.createdBy,
  });
}

export interface InviteBonusResult {
  reason: 'granted' | 'already_granted' | 'not_invited' | 'unconfirmed' | 'banned' | 'no_user';
  invitee?: string | null;
  inviter?: string | null;
  inviter_id?: string | null;
}

/**
 * Pay out the invite bonus for a member who just signed in, if they joined on an invite and have
 * not had it yet. Idempotent and cheap after the first time; never throws (a sign-in must not
 * fail over a bonus).
 */
export async function grantInviteBonus(userId: string, client?: AnyClient): Promise<InviteBonusResult | null> {
  try {
    const { data, error } = await (client ?? getServerClient()).rpc('grant_invite_bonus', {
      p_user_id: userId,
      p_invitee_days: INVITE_BONUS_DAYS,
      p_inviter_days: INVITE_BONUS_DAYS,
      p_inviter_monthly_cap: INVITER_MONTHLY_CAP,
    });
    if (error) throw new Error(error.message);
    return data as InviteBonusResult;
  } catch (error) {
    console.error('[Rewards] invite bonus failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * First-touch affiliate attribution for a new account: ?ref= or the existing `referral_code`
 * cookie. A code from the older @profullstack/referrals table comes back `external` and is left
 * to that system, so one sign-up is counted once. Never throws.
 */
export async function attributeSignup(request: Request, newUserId: string): Promise<void> {
  try {
    const code = refFromRequest(request);
    if (!code) return;
    const r = await getAffiliates().attribute(code, newUserId);
    if (r.external) console.log('[Rewards] referral code belongs to stack referrals, left to it');
  } catch (error) {
    console.error('[Rewards] affiliate attribution failed:', error instanceof Error ? error.message : error);
  }
}

/** The member's affiliate link: open, unlimited, first touch wins. */
export async function affiliateLink(userId: string, base: string): Promise<string> {
  const code = await getAffiliates().affiliateCode(userId);
  const url = new URL('/invite-only', base);
  url.searchParams.set('ref', code);
  return url.toString();
}

/** Members whose invite bonus is settled in this process, so page loads stop asking. */
const settled = new Set<string>();
const SETTLED_LIMIT = 10_000;

/**
 * grantInviteBonus() for paths that run on every page load (/api/auth/me): asks the database
 * once per member per process, and never again once the answer cannot change.
 */
export async function ensureInviteBonus(userId: string): Promise<InviteBonusResult | null> {
  if (settled.has(userId)) return null;
  const result = await grantInviteBonus(userId);
  if (result && result.reason !== 'unconfirmed' && result.reason !== 'no_user') {
    if (settled.size >= SETTLED_LIMIT) settled.clear();
    settled.add(userId);
  }
  return result;
}
