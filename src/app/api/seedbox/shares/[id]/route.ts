import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import {
  RentalError,
  deleteRental,
  getRental,
  updateRental,
  type ShareInput,
} from '@/lib/seedbox/shares';

export const dynamic = 'force-dynamic';

/** GET — one rental owned by the caller. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { id } = await params;
  const rental = await getRental(id, user.id);
  if (!rental) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  return NextResponse.json({ rental }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

/** PATCH — edit price/window/caps/expiry/payout, or pause/resume/close (status). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as ShareInput;
  try {
    const rental = await updateRental(id, user.id, body);
    if (!rental) {
      return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
    }
    return NextResponse.json({ rental }, { status: 200 });
  } catch (error) {
    if (error instanceof RentalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

/** DELETE — remove a rental entirely (cascades grants + downloads). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deleteRental(id, user.id);
  if (!removed) {
    return NextResponse.json({ error: 'Rental not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
