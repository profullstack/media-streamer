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

  // Optional filters (all sections returned in full by default):
  //   ?q=<text>            case-insensitive substring filter on each item's name/title
  //   ?sections=tv,movies  return only these sections (others come back empty)
  //   ?limit=<n>           cap items per section (0/absent = no cap)
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const only = (url.searchParams.get('sections') || url.searchParams.get('section') || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const limit = Math.max(0, parseInt(url.searchParams.get('limit') || '0', 10) || 0);
  const want = (name: string): boolean => only.length === 0 || only.includes(name);
  const matches = (s: string | null | undefined): boolean => !q || (s || '').toLowerCase().includes(q);
  const cap = <T>(arr: T[]): T[] => (limit > 0 ? arr.slice(0, limit) : arr);

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

    const tv = want('tv') ? cap(tvRaw.filter((c) => matches(c.channel_name)).map((c) => ({
      id: c.channel_id,
      name: c.channel_name,
      logo: c.channel_logo ?? null,
      player: player({ type: 'tv', channel: c.channel_url, title: c.channel_name }),
      url: `${SITE}/live-tv?channel=${encodeURIComponent(c.channel_id)}`,
    }))) : [];

    const radio = !want('radio') ? [] : cap(radioRaw.filter((s) => matches(s.station_name)).map((s) => ({
      id: s.station_id,
      name: s.station_name,
      logo: s.station_image_url ?? null,
      genre: s.station_genre ?? null,
      player: player({
        type: 'radio', station: s.station_id, title: s.station_name,
        subtitle: s.station_genre || 'Live radio',
        ...(s.station_image_url ? { poster: s.station_image_url } : {}),
      }),
      url: `${SITE}/radio?station=${encodeURIComponent(s.station_id)}`,
    })));

    // Resolve a playable file per torrent favorite (from bt_torrent_files) so
    // movies/music/books open in the embeddable player (token-auth streamed).
    const { createServerClient } = await import('@/lib/supabase');
    const sb = createServerClient() as unknown as { from: (t: string) => any };
    const torrentDbIds = torrentsRaw
      .map((t) => (t.bt_torrents as Record<string, unknown> | undefined)?.id as string)
      .filter(Boolean);
    const filesByTorrent: Record<string, Array<{ file_index: number; size: number; media_category: string | null; extension: string | null }>> = {};
    if (torrentDbIds.length) {
      const { data: files } = await sb
        .from('bt_torrent_files')
        .select('torrent_id, file_index, size, media_category, extension')
        .in('torrent_id', torrentDbIds);
      for (const f of files || []) (filesByTorrent[f.torrent_id] ||= []).push(f);
    }
    const pickFile = (files: typeof filesByTorrent[string], cats: string[]) =>
      (files || []).filter((f) => f.media_category && cats.includes(f.media_category)).sort((a, b) => (b.size || 0) - (a.size || 0))[0] || null;

    const moviesAll = !want('movies') ? [] : torrentsRaw.map((t) => {
      const bt = (t.bt_torrents ?? {}) as Record<string, unknown>;
      const infohash = (bt.infohash as string) ?? '';
      const ct = (bt.content_type as string) ?? null;
      const title = (bt.clean_title as string) || (bt.name as string) || '';
      const files = filesByTorrent[(bt.id as string) ?? ''] || [];
      let pl: string | null = null;
      const poster = (bt.poster_url as string) || (bt.cover_url as string) || '';
      if (ct === 'music') {
        const f = pickFile(files, ['audio']);
        if (f) pl = player({ type: 'audio', src: `/api/stream?infohash=${infohash}&fileIndex=${f.file_index}`, title, subtitle: 'Music', ...(poster ? { poster } : {}) });
      } else if (ct === 'book') {
        const f = pickFile(files, ['ebook', 'document']);
        if (f) pl = player({ type: 'ebook', src: `/api/stream?infohash=${infohash}&fileIndex=${f.file_index}`, title, fmt: (f.extension || '').replace(/^\./, '').toLowerCase() });
      } else {
        // Play the direct stream first; the player transcodes via &hls= only if
        // the browser can't decode the codec (matches the native site's behavior).
        const f = pickFile(files, ['video']);
        if (f) pl = player({
          type: 'video', title,
          src: `/api/stream?infohash=${infohash}&fileIndex=${f.file_index}`,
          hls: `/api/stream/hls?infohash=${infohash}&fileIndex=${f.file_index}`,
          ...(poster ? { poster } : {}),
        });
      }
      return {
        id: infohash || null,
        title,
        poster: poster || null,
        contentType: ct,
        player: pl,
        url: `${SITE}/library?infohash=${encodeURIComponent(infohash)}`,
      };
    });
    const movies = cap(moviesAll.filter((m) => matches(m.title)));

    // Podcasts: every subscription (filtered) + recent episodes, each an audio player.
    const podcasts = !want('podcasts') ? [] : await Promise.all(
      cap(subsRaw.filter((p) => matches(p.podcast_title))).map(async (p) => {
        const [eps, progressRows] = await Promise.all([
          podRepo.getEpisodesByPodcast(p.podcast_id, 10).catch(() => []),
          podRepo.getListenProgressForPodcast(pid, p.podcast_id).catch(() => []),
        ]);
        // episodeId -> saved progress, so the client can resume + mark played.
        const progByEp: Record<string, { positionSeconds: number; completed: boolean; percentage: number }> = {};
        for (const r of progressRows as Array<Record<string, unknown>>) {
          progByEp[r.episode_id as string] = {
            positionSeconds: Number(r.current_time_seconds ?? 0),
            completed: Boolean(r.completed),
            percentage: Number(r.percentage ?? 0),
          };
        }
        return {
          id: p.podcast_id,
          title: p.podcast_title,
          author: p.podcast_author,
          image: p.podcast_image_url,
          url: `${SITE}/podcasts/${encodeURIComponent(p.podcast_id)}`,
          episodes: eps
            .filter((e) => e.audio_url)
            .map((e) => {
              const art = ((e as { image_url?: string }).image_url) || p.podcast_image_url || '';
              const prog = progByEp[e.id];
              const start = prog && !prog.completed ? Math.max(0, Math.floor(prog.positionSeconds)) : 0;
              return {
                id: e.id,
                title: e.title,
                publishedAt: e.published_at,
                progress: prog ?? { positionSeconds: 0, completed: false, percentage: 0 },
                player: player({
                  type: 'audio', src: e.audio_url as string, title: e.title,
                  subtitle: p.podcast_title || '', episodeId: e.id,
                  ...(start > 0 ? { start: String(start) } : {}),
                  ...(art ? { poster: art } : {}),
                }),
              };
            }),
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
