/**
 * M3U/M3U8 playlist VOD adapter. Fetches the playlist and treats each entry as
 * a title; the entry's stream URL is proxied at playback (auth headers applied).
 */

import { parseM3U } from '@/lib/iptv';
import type { CatalogItem } from '../types';
import { authHeaders, type HttpSource } from '../config';
import { extOf, fetchWithTimeout, stableId, type ResolvedStream, type TitleRef } from './shared';

export async function listCatalog(source: HttpSource, opts: { limit: number }): Promise<CatalogItem[]> {
  const res = await fetchWithTimeout(source.url, { headers: authHeaders(source.auth) }, 20000);
  if (!res || !res.ok) return [];
  const text = await res.text().catch(() => '');
  if (!text) return [];

  const channels = parseM3U(text);
  return channels.slice(0, opts.limit).map((ch) => ({
    // M3U ids aren't stable across parses; key on the stream URL.
    externalId: stableId(ch.url),
    title: ch.name || '(untitled)',
    kind: 'other' as const,
    posterUrl: ch.logo ?? null,
    plot: null,
    rating: null,
    category: ch.group ?? null,
    streamRef: ch.url,
    extension: extOf(ch.url),
  }));
}

export function resolveStream(source: HttpSource, title: TitleRef): ResolvedStream {
  return {
    url: title.streamRef,
    headers: authHeaders(source.auth),
    extHint: title.extension ? `${title.title}.${title.extension}` : title.streamRef,
  };
}
