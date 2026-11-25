/**
 * GET /api/live/status
 *
 * Whether the member has connected c0mpute, their watch link, and whether they
 * are on air. Never the stream key.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { liveDeps, liveStateOf } from '@/lib/c0mpute-live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'cache-control': 'no-store' };

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers });
  const deps = liveDeps();
  if (!deps) return NextResponse.json({ error: 'c0mpute Live is not configured' }, { status: 503, headers });

  try {
    const row = await deps.store.get(user.id);
    const state = liveStateOf(user.id);
    return NextResponse.json(
      {
        connected: row !== null,
        watchUrl: row?.watch_url ?? null,
        playbackUrl: row?.playback_url ?? null,
        accountLabel: row?.account_label ?? null,
        visibility: row?.visibility ?? null,
        live: { active: state.active, startedAt: state.startedAt, sessionId: state.sessionId, ended: state.ended },
      },
      { headers }
    );
  } catch (err) {
    console.error('[c0mpute-live] status failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'Could not read your live status' }, { status: 500, headers });
  }
}
