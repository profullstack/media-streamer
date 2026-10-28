/**
 * One seedbox on the account.
 *
 * @route GET    /api/account/seedboxes/[id] — secret-free summary
 * @route PUT    /api/account/seedboxes/[id] — save its transports
 * @route PATCH  /api/account/seedboxes/[id] — rename
 * @route DELETE /api/account/seedboxes/[id] — remove it
 *
 * Every handler scopes by the signed-in account as well as the id, so an id from
 * another account reads as missing rather than as somebody else's box.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  deleteSeedbox,
  getSeedboxConfigSummary,
  parseSeedboxInput,
  renameSeedbox,
  saveAccountSeedboxConfig,
} from '@/lib/seedbox';
import { withVaultErrors } from '@/lib/vault/route';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const failed = (error: unknown, status = 500): NextResponse =>
  NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status }
  );

async function handleGET(_request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  try {
    const summary = await getSeedboxConfigSummary(user.id, id);
    if (!summary.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    return failed(error);
  }
}

async function handlePUT(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const summary = await saveAccountSeedboxConfig(user.id, parseSeedboxInput(body), id);
    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    return failed(error);
  }
}

async function handlePATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name : '';
  if (!name.trim()) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
  try {
    return NextResponse.json({ summary: await renameSeedbox(user.id, id, name) }, { status: 200 });
  } catch (error) {
    return failed(error);
  }
}

async function handleDELETE(_request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await params;
  try {
    await deleteSeedbox(user.id, id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return failed(error);
  }
}

export const GET = withVaultErrors(handleGET);
export const PUT = withVaultErrors(handlePUT);
export const PATCH = withVaultErrors(handlePATCH);
export const DELETE = withVaultErrors(handleDELETE);
