/**
 * POST /api/live/session    go on air: start the encoder for this member
 * DELETE /api/live/session  go off air
 *
 * The browser then posts what it records to /api/live/ingest.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { LiveCapacityError, acceptedMimeType, liveDeps, startSession, stopSessionsOf } from '@/lib/c0mpute-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const deps = liveDeps();
  if (!deps) return NextResponse.json({ error: 'c0mpute Live is not configured' }, { status: 503 });

  let body: { mimeType?: unknown };
  try {
    body = (await request.json()) as { mimeType?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!acceptedMimeType(body.mimeType)) {
    return NextResponse.json({ error: 'Unsupported recording format' }, { status: 400 });
  }

  let streamKey: string;
  let watchUrl: string | null;
  try {
    const row = await deps.store.get(user.id);
    if (!row) return NextResponse.json({ error: 'Connect c0mpute first' }, { status: 409 });
    streamKey = deps.open(row.stream_key_enc);
    watchUrl = row.watch_url;
  } catch {
    // The sealed key did not open (the server secret changed): connecting again makes a new one.
    return NextResponse.json(
      { error: 'Your c0mpute connection needs renewing. Disconnect and connect again.' },
      { status: 409 }
    );
  }

  try {
    const { sessionId, startedAt } = startSession(user.id, streamKey);
    return NextResponse.json({ sessionId, watchUrl, startedAt: new Date(startedAt).toISOString() });
  } catch (err) {
    if (err instanceof LiveCapacityError) return NextResponse.json({ error: err.message }, { status: 429 });
    console.error('[c0mpute-live] could not start the encoder');
    return NextResponse.json({ error: 'Could not start the live encoder' }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  return NextResponse.json({ success: true, stopped: stopSessionsOf(user.id) });
}
