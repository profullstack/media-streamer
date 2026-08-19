import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  deleteSeedbox,
  getSeedboxConfigSummary,
  parseSeedboxInput,
  saveAccountSeedboxConfig,
} from '@/lib/seedbox';

// Per-account seedbox connection management. Configured on the master account;
// shared to every profile under it. Secrets are encrypted at rest and NEVER
// returned — GET yields only a presence/summary view.
//
// An account can have several seedboxes. These routes act on one of them: `?id=`
// names it, and without one they resolve the account's default. See
// /api/account/seedboxes for listing and adding.

export const dynamic = 'force-dynamic';

/** GET — secret-free summary of the account's connected seedbox. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const id = new URL(request.url).searchParams.get('id') ?? undefined;
    const summary = await getSeedboxConfigSummary(user.id, id);
    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

/** PUT — upsert the connection. Blank/omitted secret fields keep their stored value. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = new URL(request.url).searchParams.get('id') ?? undefined;
  const input = parseSeedboxInput(body);

  try {
    const summary = await saveAccountSeedboxConfig(user.id, input, id);
    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

/**
 * DELETE — disconnect one seedbox: `?id=` names it, otherwise the default.
 *
 * This used to remove every row for the account, which was the same thing back
 * when an account could only have one. It is not any more, so it removes exactly
 * one box and promotes a successor if that box was the default.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const id =
      new URL(request.url).searchParams.get('id') ??
      (await getSeedboxConfigSummary(user.id)).id;
    if (!id) return NextResponse.json({ success: true }, { status: 200 });
    await deleteSeedbox(user.id, id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
