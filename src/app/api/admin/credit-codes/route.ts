/**
 * Admin: Premium-days credit codes (src/lib/rewards.ts).
 *
 * GET    /api/admin/credit-codes                -> every code, newest first (never the code itself)
 * POST   /api/admin/credit-codes                -> mint. { days, label?, maxRedemptions?, expiresAt? (ISO) }
 *                                                   The plaintext code is in this response only.
 * DELETE /api/admin/credit-codes?id=<codeId>    -> revoke
 *
 * Admins only (checkUserAdmin); anyone else gets 404, as the rest of /api/admin does.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkUserAdmin } from '@/lib/admin';
import { getCredits, mintPremiumCode } from '@/lib/rewards';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

async function admin(request: NextRequest): Promise<string | null> {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  return (await checkUserAdmin(user.id)).isAdmin ? user.id : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await admin(request))) return notFound();
  return NextResponse.json({ codes: await getCredits().list() }, { headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const adminId = await admin(request);
  if (!adminId) return notFound();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? Date.parse(body.expiresAt) : null;
  if (expiresAt !== null && !Number.isFinite(expiresAt)) {
    return NextResponse.json({ error: 'expiresAt is not a date' }, { status: 400, headers: NO_STORE });
  }
  try {
    const minted = await mintPremiumCode({
      days: Number(body.days),
      label: typeof body.label === 'string' ? body.label.slice(0, 200) : '',
      maxRedemptions: body.maxRedemptions === undefined ? 1 : Number(body.maxRedemptions),
      expiresAt,
      createdBy: adminId,
    });
    return NextResponse.json(minted, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: NO_STORE });
    }
    console.error('[CreditCodes] mint failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not mint a code' }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await admin(request))) return notFound();
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400, headers: NO_STORE });
  try {
    await getCredits().revoke(id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: 'No such code' }, { status: 404, headers: NO_STORE });
  }
}
