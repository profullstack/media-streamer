/**
 * Xtream Codes VOD adapter. Reuses the app's Xtream client to list VOD streams
 * and build direct stream URLs (creds live in the URL, kept server-side).
 */

import {
  buildVodStreamUrl,
  buildXtreamUrl,
  getXtreamVodStreams,
  type XtreamCredentials,
} from '@/lib/xtream/xtream';
import type { CatalogItem } from '../types';
import type { XtreamSource } from '../config';
import { fetchWithTimeout, type ResolvedStream, type TitleRef } from './shared';

interface RawCategory {
  category_id?: string | number;
  category_name?: string;
}

function creds(source: XtreamSource): XtreamCredentials {
  return { serverUrl: source.serverUrl, username: source.username, password: source.password };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
  if (!res || !res.ok) return null;
  return res.json().catch(() => null);
}

export async function listCatalog(source: XtreamSource, opts: { limit: number }): Promise<CatalogItem[]> {
  const c = creds(source);

  // Category id → name map (best effort).
  const cats = (await fetchJson(buildXtreamUrl(c, 'player_api.php', { action: 'get_vod_categories' }))) as
    | RawCategory[]
    | null;
  const catMap = new Map<string, string>();
  if (Array.isArray(cats)) {
    for (const cat of cats) {
      if (cat.category_id != null) catMap.set(String(cat.category_id), cat.category_name ?? '');
    }
  }

  const raw = (await fetchJson(buildXtreamUrl(c, 'player_api.php', { action: 'get_vod_streams' }))) as
    | unknown[]
    | null;
  const streams = getXtreamVodStreams(Array.isArray(raw) ? raw : []);

  return streams.slice(0, opts.limit).map((s) => ({
    externalId: s.id,
    title: s.name,
    kind: 'movie' as const,
    posterUrl: s.poster ?? null,
    plot: s.plot ?? null,
    rating: s.rating ?? null,
    category: catMap.get(s.categoryId) ?? null,
    streamRef: s.id,
    extension: s.extension ?? 'mp4',
  }));
}

export function resolveStream(source: XtreamSource, title: TitleRef): ResolvedStream {
  const ext = title.extension ?? 'mp4';
  const url = buildVodStreamUrl(creds(source), title.streamRef, ext);
  return { url, headers: {}, extHint: `${title.title}.${ext}` };
}
