/**
 * Invites API
 *
 * GET  /api/invites  -> the caller's invites and how many they may still create
 * POST /api/invites  -> create one invite. Body (optional): { maxUses: number | null, expiresAt: ISO | null };
 *                       null means no limit. Each allowed use costs one of the 5 a month (unused
 *                       ones carry over); admins are unlimited and only they may leave uses open.
 *
 * Signed-in members only. The allowance is enforced by create_invite() in the database
 * under a per-member lock, not here; see src/lib/invites.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkUserAdmin } from '@/lib/admin';
import { getServerClient } from '@/lib/supabase';
import {
  InviteAllowanceExhausted,
  InviteLimitsInvalid,
  MONTHLY_INVITES,
  createInvite,
  formatInviteCode,
  inviteBalance,
  inviteLink,
  isInviteOpen,
  listInvites,
  parseInviteLimits,
  type Invite,
} from '@/lib/invites';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

function origin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

function present(invite: Invite, base: string) {
  return {
    code: formatInviteCode(invite.code),
    link: inviteLink(base, invite.code),
    createdAt: invite.createdAt,
    usedAt: invite.usedAt,
    expiresAt: invite.expiresAt,
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    open: isInviteOpen(invite),
  };
}

async function caller(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const { isAdmin } = await checkUserAdmin(user.id);
  return { id: user.id, isAdmin };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers: NO_STORE });
  try {
    const client = getServerClient();
    const [invites, remaining] = await Promise.all([
      listInvites(client, me.id),
      me.isAdmin ? Promise.resolve(null) : inviteBalance(client, me.id),
    ]);
    const base = origin(request);
    return NextResponse.json(
      { remaining, unlimited: me.isAdmin, monthly: MONTHLY_INVITES, invites: invites.map((i) => present(i, base)) },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error('[Invites] GET failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not load your invites' }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const me = await caller(request);
  if (!me) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers: NO_STORE });
  try {
    const limits = parseInviteLimits(await request.json().catch(() => ({})));
    const client = getServerClient();
    const invite = await createInvite(client, me.id, me.isAdmin, limits);
    const remaining = me.isAdmin ? null : await inviteBalance(client, me.id);
    return NextResponse.json(
      { invite: present(invite, origin(request)), remaining, unlimited: me.isAdmin },
      { status: 201, headers: NO_STORE }
    );
  } catch (error) {
    if (error instanceof InviteLimitsInvalid) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: NO_STORE });
    }
    if (error instanceof InviteAllowanceExhausted) {
      return NextResponse.json(
        { error: `Not enough invites left for that many uses. You get ${MONTHLY_INVITES} more next month.` },
        { status: 429, headers: NO_STORE }
      );
    }
    console.error('[Invites] POST failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not create an invite' }, { status: 500, headers: NO_STORE });
  }
}
