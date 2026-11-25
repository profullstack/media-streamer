/**
 * POST /api/live/ingest?session=<id>&seq=<n>   (application/octet-stream)
 *
 * One recorded piece of the member's own camera or screen, in order. It is
 * written to that session's encoder and nothing is kept.
 *
 * `?stop=1` ends the session instead: it is what the page sends with
 * navigator.sendBeacon when the tab closes, since a beacon can only POST.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { MAX_CHUNK_BYTES, stopSessionsOf, writeChunk } from '@/lib/c0mpute-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  if (params.get('stop') === '1') {
    return NextResponse.json({ success: true, stopped: stopSessionsOf(user.id) });
  }

  const sessionId = params.get('session') ?? '';
  const seqRaw = params.get('seq') ?? '';
  const seq = /^\d{1,9}$/.test(seqRaw) ? Number(seqRaw) : Number.NaN;
  if (!sessionId) return NextResponse.json({ error: 'session is required' }, { status: 400 });

  // Refuse an oversized body before reading it, when the client says how big it is.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: 'Chunk too large' }, { status: 413 });
  }

  let chunk: Uint8Array;
  try {
    chunk = new Uint8Array(await request.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Could not read the chunk' }, { status: 400 });
  }

  const result = await writeChunk(user.id, sessionId, seq, chunk);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, seq });
}
