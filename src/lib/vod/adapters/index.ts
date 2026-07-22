/**
 * VOD source-adapter dispatcher. Given a resolved source, list its catalog (for
 * sync) or resolve a title to a proxyable stream (for playback).
 */

import type { CatalogItem } from '../types';
import type { ResolvedSource } from '../config';
import * as xtream from './xtream';
import * as m3u from './m3u';
import * as httpLibrary from './http-library';
import * as manifest from './manifest';
import type { ResolvedStream, TitleRef } from './shared';

export type { ResolvedStream, TitleRef } from './shared';

export function listCatalog(source: ResolvedSource, opts: { limit: number }): Promise<CatalogItem[]> {
  switch (source.kind) {
    case 'xtream':
      return xtream.listCatalog(source, opts);
    case 'm3u':
      return m3u.listCatalog(source, opts);
    case 'http_library':
      return httpLibrary.listCatalog(source, opts);
    case 'manifest':
      return manifest.listCatalog(source, opts);
  }
}

export async function resolveStream(
  source: ResolvedSource,
  title: TitleRef
): Promise<ResolvedStream | null> {
  switch (source.kind) {
    case 'xtream':
      return xtream.resolveStream(source, title);
    case 'm3u':
      return m3u.resolveStream(source, title);
    case 'http_library':
      return httpLibrary.resolveStream(source, title);
    case 'manifest':
      return manifest.resolveStream(source, title);
  }
}
