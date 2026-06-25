/**
 * GET /api/v1/favorites — token-auth favorites for connected clients (TronBrowser).
 *
 * Returns the user's default-profile live-TV channel favorites and podcast
 * subscriptions. Bearer-token authenticated; open CORS (token, not cookies).
 */

import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/api-tokens';
import { getProfilesService } from '@/lib/profiles/profiles-service';
import { getFavoritesService } from '@/lib/favorites';
import { getPodcastRepository } from '@/lib/podcasts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });

  try {
    const profile = await getProfilesService().ensureDefaultProfile(user.id);
    const [tvRaw, podsRaw] = await Promise.all([
      getFavoritesService().getIptvChannelFavorites(profile.id).catch(() => []),
      getPodcastRepository().getUserSubscriptions(profile.id).catch(() => []),
    ]);

    const tv = tvRaw.map((c) => ({
      id: c.channel_id,
      name: c.channel_name,
      logo: c.channel_logo ?? null,
      url: `https://bittorrented.com/live-tv?channel=${encodeURIComponent(c.channel_id)}`,
      stream: c.channel_url,
    }));
    const podcasts = podsRaw.map((p) => ({
      id: p.podcast_id,
      title: p.podcast_title,
      author: p.podcast_author,
      image: p.podcast_image_url,
      url: `https://bittorrented.com/podcasts/${encodeURIComponent(p.podcast_id)}`,
      latestEpisode: p.latest_episode_title,
      unlistened: p.unlistened_count,
    }));

    return NextResponse.json({ tv, podcasts }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ tv: [], podcasts: [], error: (e as Error).message }, { headers: CORS });
  }
}
