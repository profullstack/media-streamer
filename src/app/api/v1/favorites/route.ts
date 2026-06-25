/**
 * GET /api/v1/favorites — token-auth favorites for connected clients (TronBrowser).
 *
 * Returns the user's default-profile favorites across all media types with
 * embeddable player URLs (see /api/player):
 *   - tv:        live-TV channels        -> player (type=tv, public iptv-proxy)
 *   - podcasts:  subscriptions + recent episodes -> per-episode audio player
 *   - radio:     stations               -> bittorrented page (stream is gated)
 *   - movies:    torrent favorites       -> bittorrented page (needs a stream session)
 *
 * Bearer-token authenticated; open CORS (token, not cookies).
 */

import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/api-tokens';
import { getProfilesService } from '@/lib/profiles/profiles-service';
import { getFavoritesService } from '@/lib/favorites';
import { getPodcastRepository } from '@/lib/podcasts';
import { getRadioRepository } from '@/lib/radio';

const SITE = 'https://bittorrented.com';
const PLAYER = `${SITE}/api/player`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

const player = (params: Record<string, string>) =>
  `${PLAYER}?${new URLSearchParams(params).toString()}`;

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });

  try {
    const profile = await getProfilesService().ensureDefaultProfile(user.id);
    const pid = profile.id;
    const favSvc = getFavoritesService();
    const podRepo = getPodcastRepository();

    const [tvRaw, torrentsRaw, subsRaw, radioRaw] = await Promise.all([
      favSvc.getIptvChannelFavorites(pid).catch(() => []),
      favSvc.getTorrentFavorites(pid).catch(() => []),
      podRepo.getUserSubscriptions(pid).catch(() => []),
      getRadioRepository().getUserFavorites(pid).catch(() => []),
    ]);

    const tv = tvRaw.map((c) => ({
      id: c.channel_id,
      name: c.channel_name,
      logo: c.channel_logo ?? null,
      player: player({ type: 'tv', channel: c.channel_url, title: c.channel_name }),
      url: `${SITE}/live-tv?channel=${encodeURIComponent(c.channel_id)}`,
    }));

    const radio = radioRaw.map((s) => ({
      id: s.station_id,
      name: s.station_name,
      logo: s.station_image_url ?? null,
      genre: s.station_genre ?? null,
      url: `${SITE}/radio?station=${encodeURIComponent(s.station_id)}`,
    }));

    const movies = torrentsRaw.map((t) => {
      const bt = (t.bt_torrents ?? {}) as Record<string, unknown>;
      return {
        id: (bt.infohash as string) ?? null,
        title: (bt.clean_title as string) || (bt.name as string) || '',
        poster: (bt.poster_url as string) || (bt.cover_url as string) || null,
        contentType: (bt.content_type as string) ?? null,
        url: `${SITE}/library?infohash=${encodeURIComponent((bt.infohash as string) ?? '')}`,
      };
    });

    // Podcasts: subscription + a few recent episodes, each with an audio player URL.
    const podcasts = await Promise.all(
      subsRaw.slice(0, 12).map(async (p) => {
        const eps = await podRepo.getEpisodesByPodcast(p.podcast_id, 5).catch(() => []);
        return {
          id: p.podcast_id,
          title: p.podcast_title,
          author: p.podcast_author,
          image: p.podcast_image_url,
          url: `${SITE}/podcasts/${encodeURIComponent(p.podcast_id)}`,
          episodes: eps
            .filter((e) => e.audio_url)
            .map((e) => ({
              id: e.id,
              title: e.title,
              publishedAt: e.published_at,
              player: player({ type: 'audio', src: e.audio_url as string, title: e.title }),
            })),
        };
      }),
    );

    return NextResponse.json({ tv, radio, podcasts, movies }, { headers: CORS });
  } catch (e) {
    return NextResponse.json(
      { tv: [], radio: [], podcasts: [], movies: [], error: (e as Error).message },
      { headers: CORS },
    );
  }
}
