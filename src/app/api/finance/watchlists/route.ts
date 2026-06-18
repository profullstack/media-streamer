/**
 * Finance watchlists (named lists) — collection routes.
 *
 * GET  /api/finance/watchlists           — the active profile's lists (+counts)
 * POST /api/finance/watchlists {name}     — create a new list
 *
 * Paid-gated; profile-scoped (RLS as defense in depth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { sanitizeWatchlistName } from '@/lib/finance/watchlist';
import { createWatchlist, listWatchlists } from '@/lib/finance/watchlist-db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  try {
    const watchlists = await listWatchlists(profileId);
    return NextResponse.json({ watchlists });
  } catch (error) {
    console.error('[finance/watchlists] list error:', error);
    return NextResponse.json({ error: 'failed to load watchlists' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = sanitizeWatchlistName(body?.name);
  if (!name) return NextResponse.json({ error: 'invalid name' }, { status: 400 });

  try {
    const watchlist = await createWatchlist(profileId, name);
    return NextResponse.json({ watchlist: { ...watchlist, count: 0 } }, { status: 201 });
  } catch (error) {
    console.error('[finance/watchlists] create error:', error);
    return NextResponse.json({ error: 'failed to create watchlist' }, { status: 500 });
  }
}
