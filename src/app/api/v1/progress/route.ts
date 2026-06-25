/**
 * GET/POST /api/v1/progress — token-auth play progress for connected clients.
 *
 * Lets the embeddable player (and TronBrowser) save & resume "where you left
 * off" and mark already-played items. Currently covers podcast episodes
 * (reuses podcast_listen_progress); video/ebook progress is keyed by torrent
 * file id and will be added once that mapping is exposed token-side.
 *
 *   POST  { type:'podcast', episodeId, currentTimeSeconds, durationSeconds?, completed? }
 *   GET   ?type=podcast&episodeId=<id>   -> { currentTimeSeconds, percentage, completed }
 *
 * Bearer-token (or ?token=) authenticated; open CORS.
 */

import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/api-tokens';
import { getProfilesService } from '@/lib/profiles/profiles-service';
import { getPodcastRepository } from '@/lib/podcasts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });

  const url = new URL(request.url);
  const type = (url.searchParams.get('type') || 'podcast').toLowerCase();
  const episodeId = url.searchParams.get('episodeId') || '';
  if (type !== 'podcast' || !episodeId) {
    return NextResponse.json({ error: 'unsupported', message: 'type=podcast&episodeId required' }, { status: 400, headers: CORS });
  }

  try {
    const pid = (await getProfilesService().ensureDefaultProfile(user.id)).id;
    const p = await getPodcastRepository().getListenProgress(pid, episodeId).catch(() => null);
    return NextResponse.json({
      currentTimeSeconds: p?.current_time_seconds ?? 0,
      durationSeconds: p?.duration_seconds ?? null,
      percentage: Number(p?.percentage ?? 0),
      completed: Boolean(p?.completed),
    }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: CORS }); }

  const type = String(body.type || 'podcast').toLowerCase();
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : '';
  const cur = Math.max(0, Math.floor(Number(body.currentTimeSeconds) || 0));
  const dur = body.durationSeconds != null ? Math.max(0, Math.floor(Number(body.durationSeconds))) : undefined;
  if (type !== 'podcast' || !episodeId) {
    return NextResponse.json({ error: 'unsupported', message: 'type=podcast & episodeId required' }, { status: 400, headers: CORS });
  }

  const pct = dur && dur > 0 ? Math.min(100, Math.round((cur / dur) * 10000) / 100) : 0;
  // Mark completed near the end (>=97%) or when the client says so.
  const completed = body.completed === true || pct >= 97;

  try {
    const pid = (await getProfilesService().ensureDefaultProfile(user.id)).id;
    await getPodcastRepository().updateListenProgress({
      user_id: pid, // repo maps this to profile_id
      episode_id: episodeId,
      current_time_seconds: cur,
      duration_seconds: dur,
      percentage: pct,
      completed,
    });
    return NextResponse.json({ ok: true, completed, percentage: pct }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
