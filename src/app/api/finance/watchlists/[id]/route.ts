/**
 * Finance watchlists (named lists) — single-list routes.
 *
 * PATCH  /api/finance/watchlists/:id {name} — rename
 * DELETE /api/finance/watchlists/:id          — delete (cascades its items)
 *
 * Paid-gated; every query is filtered by the active profile so a caller can
 * only mutate its own lists (RLS as defense in depth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getServerClient } from '@/lib/supabase';
import { sanitizeWatchlistName } from '@/lib/finance/watchlist';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = sanitizeWatchlistName(body?.name);
  if (!name) return NextResponse.json({ error: 'invalid name' }, { status: 400 });

  const { data, error } = await getServerClient()
    .from('finance_watchlists')
    .update({ name })
    .eq('id', id)
    .eq('profile_id', profileId)
    .select('id, name, created_at')
    .maybeSingle();

  if (error) {
    console.error('[finance/watchlists] rename error:', error);
    return NextResponse.json({ error: 'failed to rename watchlist' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ watchlist: { id: data.id, name: data.name, createdAt: data.created_at } });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) return NextResponse.json({ error: 'No active profile' }, { status: 400 });

  const { id } = await params;
  const { data, error } = await getServerClient()
    .from('finance_watchlists')
    .delete()
    .eq('id', id)
    .eq('profile_id', profileId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[finance/watchlists] delete error:', error);
    return NextResponse.json({ error: 'failed to delete watchlist' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
