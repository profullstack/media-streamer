/**
 * Finance watchlist (PRD §3.1, §5) — profile-scoped tickers.
 *
 * GET    /api/finance/watchlist          — list the active profile's tickers
 * POST   /api/finance/watchlist {symbol} — add a ticker
 * DELETE /api/finance/watchlist?symbol=  — remove a ticker
 *
 * Paid-gated. Rows are filtered by the active profile id; the table also has
 * RLS as defense in depth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getServerClient } from '@/lib/supabase';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { parseSymbolList } from '@/lib/finance/watchlist';

export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const { data, error } = await getServerClient()
    .from('finance_watchlist')
    .select('id, symbol, exchange, added_at')
    .eq('profile_id', profileId)
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[finance/watchlist] list error:', error);
    return NextResponse.json({ error: 'failed to load watchlist' }, { status: 500 });
  }

  return NextResponse.json({ watchlist: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { symbol?: string; symbols?: string | string[]; exchange?: string }
    | null;

  // Bulk add: `symbols` may be a comma/space/newline-separated string or array.
  if (body?.symbols !== undefined) {
    const { valid, invalid } = parseSymbolList(body.symbols);
    if (valid.length === 0) {
      return NextResponse.json({ error: 'no valid symbols', invalid }, { status: 400 });
    }

    const { data, error } = await getServerClient()
      .from('finance_watchlist')
      .upsert(
        valid.map((symbol) => ({ profile_id: profileId, symbol, exchange: null })),
        { onConflict: 'profile_id,symbol' },
      )
      .select('id, symbol, exchange, added_at');

    if (error) {
      console.error('[finance/watchlist] bulk add error:', error);
      return NextResponse.json({ error: 'failed to add symbols' }, { status: 500 });
    }

    return NextResponse.json({ added: data ?? [], count: data?.length ?? 0, invalid }, { status: 201 });
  }

  // Single add.
  const symbol = normalizeSymbol(body?.symbol ?? '');
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  const { data, error } = await getServerClient()
    .from('finance_watchlist')
    .upsert(
      { profile_id: profileId, symbol, exchange: body?.exchange ?? null },
      { onConflict: 'profile_id,symbol' },
    )
    .select('id, symbol, exchange, added_at')
    .single();

  if (error) {
    console.error('[finance/watchlist] add error:', error);
    return NextResponse.json({ error: 'failed to add symbol' }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
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

  const { error } = await getServerClient()
    .from('finance_watchlist')
    .delete()
    .eq('profile_id', profileId)
    .eq('symbol', symbol);

  if (error) {
    console.error('[finance/watchlist] delete error:', error);
    return NextResponse.json({ error: 'failed to remove symbol' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
