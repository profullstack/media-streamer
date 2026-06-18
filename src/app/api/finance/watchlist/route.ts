/**
 * Finance watchlist items (PRD §3.1, §5) — tickers within a named list.
 *
 * GET    /api/finance/watchlist?watchlistId=        — list a list's tickers
 * POST   /api/finance/watchlist {symbol|symbols, watchlistId?} — add ticker(s)
 * DELETE /api/finance/watchlist?symbol=&watchlistId= — remove a ticker
 *
 * Paid-gated. When `watchlistId` is omitted we fall back to the profile's
 * default (oldest) list, creating one if needed — so legacy single-list callers
 * keep working. Every query is scoped to the active profile (RLS in depth).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getServerClient } from '@/lib/supabase';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { parseSymbolList } from '@/lib/finance/watchlist';
import { getOrCreateDefaultWatchlistId, ownsWatchlist } from '@/lib/finance/watchlist-db';

export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * Resolve the target list for a profile. Returns the verified list id, or null
 * when an explicit (but unowned/unknown) id was supplied.
 */
async function resolveWatchlistId(profileId: string, requested: string | null): Promise<string | null> {
  if (requested) {
    return (await ownsWatchlist(profileId, requested)) ? requested : null;
  }
  return getOrCreateDefaultWatchlistId(profileId);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const watchlistId = await resolveWatchlistId(profileId, request.nextUrl.searchParams.get('watchlistId'));
  if (!watchlistId) {
    return NextResponse.json({ error: 'watchlist not found' }, { status: 404 });
  }

  const { data, error } = await getServerClient()
    .from('finance_watchlist')
    .select('id, symbol, exchange, added_at')
    .eq('watchlist_id', watchlistId)
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[finance/watchlist] list error:', error);
    return NextResponse.json({ error: 'failed to load watchlist' }, { status: 500 });
  }

  return NextResponse.json({ watchlistId, watchlist: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { symbol?: string; symbols?: string | string[]; exchange?: string; watchlistId?: string }
    | null;

  const watchlistId = await resolveWatchlistId(profileId, body?.watchlistId ?? null);
  if (!watchlistId) {
    return NextResponse.json({ error: 'watchlist not found' }, { status: 404 });
  }

  const supabase = getServerClient();

  // Bulk add: `symbols` may be a comma/space/newline-separated string or array.
  if (body?.symbols !== undefined) {
    const { valid, invalid } = parseSymbolList(body.symbols);
    if (valid.length === 0) {
      return NextResponse.json({ error: 'no valid symbols', invalid }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('finance_watchlist')
      .upsert(
        valid.map((symbol) => ({ profile_id: profileId, watchlist_id: watchlistId, symbol, exchange: null })),
        { onConflict: 'watchlist_id,symbol' },
      )
      .select('id, symbol, exchange, added_at');

    if (error) {
      console.error('[finance/watchlist] bulk add error:', error);
      return NextResponse.json({ error: 'failed to add symbols' }, { status: 500 });
    }

    return NextResponse.json({ watchlistId, added: data ?? [], count: data?.length ?? 0, invalid }, { status: 201 });
  }

  // Single add.
  const symbol = normalizeSymbol(body?.symbol ?? '');
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('finance_watchlist')
    .upsert(
      { profile_id: profileId, watchlist_id: watchlistId, symbol, exchange: body?.exchange ?? null },
      { onConflict: 'watchlist_id,symbol' },
    )
    .select('id, symbol, exchange, added_at')
    .single();

  if (error) {
    console.error('[finance/watchlist] add error:', error);
    return NextResponse.json({ error: 'failed to add symbol' }, { status: 500 });
  }

  return NextResponse.json({ watchlistId, item: data }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const symbol = normalizeSymbol(request.nextUrl.searchParams.get('symbol') ?? '');
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  const watchlistId = await resolveWatchlistId(profileId, request.nextUrl.searchParams.get('watchlistId'));
  if (!watchlistId) {
    return NextResponse.json({ error: 'watchlist not found' }, { status: 404 });
  }

  const { error } = await getServerClient()
    .from('finance_watchlist')
    .delete()
    .eq('watchlist_id', watchlistId)
    .eq('symbol', symbol);

  if (error) {
    console.error('[finance/watchlist] delete error:', error);
    return NextResponse.json({ error: 'failed to remove symbol' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
