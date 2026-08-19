/**
 * Owner-side IPTV resale listings.
 *
 * @route GET  /api/iptv/shares — the account's listings
 * @route POST /api/iptv/shares — list a playlist for resale
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { IptvResaleError, createResale, listResales, type IptvShareInput } from '@/lib/iptv/shares';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const shares = await listResales(user.id);
  return NextResponse.json({ shares }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as IptvShareInput;
  try {
    const share = await createResale(user.id, body);
    return NextResponse.json({ share }, { status: 201 });
  } catch (error) {
    if (error instanceof IptvResaleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
