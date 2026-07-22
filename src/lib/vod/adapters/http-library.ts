/**
 * HTTP media-library VOD adapter: a directory-listing media server (same shape
 * as the seedbox files server — `GET <base>/<dir>/` → { entries: [{ name, … }] }).
 * Walks the tree (bounded) to enumerate playable media files as titles.
 */

import { buildSeedboxFileUrl } from '@/lib/seedbox/files';
import type { CatalogItem } from '../types';
import { authHeaders, type HttpSource } from '../config';
import { extOf, fetchWithTimeout, type ResolvedStream, type TitleRef } from './shared';

const VIDEO_EXTS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts', 'flv', 'wmv', 'mpg', 'mpeg', 'm2ts', 'ogv',
]);
const AUDIO_EXTS = new Set(['mp3', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wav', 'wma']);

function mediaKind(name: string): 'movie' | null {
  const ext = extOf(name);
  return ext && (VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)) ? 'movie' : null;
}

interface DirEntry {
  name?: string;
  size?: number;
  is_dir?: boolean;
  type?: string;
}

async function listDir(source: HttpSource, relDir: string): Promise<DirEntry[] | null> {
  const base = source.url.replace(/\/+$/, '');
  const encoded = relDir
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
  const url = encoded ? `${base}/${encoded}/` : `${base}/`;
  const res = await fetchWithTimeout(url, { headers: authHeaders(source.auth) }, 8000);
  if (!res || !res.ok) return null;
  const json = (await res.json().catch(() => null)) as { entries?: DirEntry[] } | null;
  return json && Array.isArray(json.entries) ? json.entries : null;
}

async function walk(
  source: HttpSource,
  relDir: string,
  depth: number,
  limit: number,
  acc: CatalogItem[]
): Promise<void> {
  if (depth > 4 || acc.length >= limit) return;
  const entries = await listDir(source, relDir);
  if (!entries) return;
  for (const e of entries) {
    if (acc.length >= limit) return;
    const name = e.name ?? '';
    if (!name) continue;
    const childPath = relDir ? `${relDir}/${name}` : name;
    const kind = mediaKind(name);
    const looksDir = e.is_dir === true || e.type === 'dir' || (kind == null && e.size == null);
    if (kind) {
      acc.push({
        externalId: childPath,
        title: name.replace(/\.[a-z0-9]+$/i, ''),
        kind: 'movie',
        streamRef: childPath,
        extension: extOf(name),
        category: relDir || null,
      });
    } else if (looksDir) {
      await walk(source, childPath, depth + 1, limit, acc);
    }
  }
}

export async function listCatalog(source: HttpSource, opts: { limit: number }): Promise<CatalogItem[]> {
  const acc: CatalogItem[] = [];
  await walk(source, '', 0, opts.limit, acc);
  return acc;
}

export function resolveStream(source: HttpSource, title: TitleRef): ResolvedStream | null {
  const url = buildSeedboxFileUrl(source.url, title.streamRef);
  if (!url) return null;
  return { url, headers: authHeaders(source.auth), extHint: title.streamRef };
}
