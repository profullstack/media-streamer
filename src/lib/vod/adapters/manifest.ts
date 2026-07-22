/**
 * JSON-manifest VOD adapter. The provider serves a catalog:
 *   { items: [{ id, title, poster, plot, rating, kind, category, stream_url, extension }] }
 * We index it and proxy each item's stream_url at playback.
 */

import type { CatalogItem, TitleKind } from '../types';
import { authHeaders, type HttpSource } from '../config';
import { extOf, fetchWithTimeout, stableId, type ResolvedStream, type TitleRef } from './shared';

interface ManifestItem {
  id?: string | number;
  title?: string;
  name?: string;
  poster?: string;
  poster_url?: string;
  plot?: string;
  description?: string;
  rating?: string;
  kind?: string;
  category?: string;
  stream_url?: string;
  url?: string;
  extension?: string;
}

function normalizeKind(k: string | undefined): TitleKind {
  return k === 'movie' || k === 'series' || k === 'live' ? k : 'other';
}

export async function listCatalog(source: HttpSource, opts: { limit: number }): Promise<CatalogItem[]> {
  const res = await fetchWithTimeout(source.url, { headers: { Accept: 'application/json', ...authHeaders(source.auth) } }, 20000);
  if (!res || !res.ok) return [];
  const json = (await res.json().catch(() => null)) as { items?: ManifestItem[] } | ManifestItem[] | null;
  const items = Array.isArray(json) ? json : (json?.items ?? []);
  if (!Array.isArray(items)) return [];

  const out: CatalogItem[] = [];
  for (const it of items.slice(0, opts.limit)) {
    const streamRef = it.stream_url ?? it.url ?? '';
    const title = it.title ?? it.name ?? '(untitled)';
    if (!streamRef) continue;
    out.push({
      externalId: it.id != null ? String(it.id) : stableId(streamRef),
      title,
      kind: normalizeKind(it.kind),
      posterUrl: it.poster ?? it.poster_url ?? null,
      plot: it.plot ?? it.description ?? null,
      rating: it.rating ?? null,
      category: it.category ?? null,
      streamRef,
      extension: it.extension ?? extOf(streamRef),
    });
  }
  return out;
}

export function resolveStream(source: HttpSource, title: TitleRef): ResolvedStream {
  return {
    url: title.streamRef,
    headers: authHeaders(source.auth),
    extHint: title.extension ? `${title.title}.${title.extension}` : title.streamRef,
  };
}
