/**
 * SiriusXM Service
 *
 * Server-side SiriusXM integration mirroring bin/play-siriusxm.ts.
 * Auth bearer is read from SIRIUSXM_TOKEN.
 */

import type {
  RadioProviderResult,
  RadioSearchParams,
  RadioStation,
  RadioStream,
  SiriusXmCategory,
  SiriusXmQuality,
} from './types';

export const SIRIUSXM_STATION_ID_PREFIX = 'sxm:';

const PAGE_ID = '403ab6a5-d3c9-4c2a-a722-a94a6a5fd056';
const CONTAINER_ID = '3JoBfOCIwo6FmTpzM1S2H7';
const SET_ID = '5mqCLZ21qAwnufKT8puUiM';

const BROWSE_URL = `https://api.edge-gateway.siriusxm.com/browse/v1/pages/curated-grouping/${PAGE_ID}`;
const SEARCH_URL = 'https://api.edge-gateway.siriusxm.com/search/v1/search';
const TUNE_SOURCE_URL = 'https://api.edge-gateway.siriusxm.com/playback/play/v1/tuneSource';

const SIRIUSXM_HEADERS_BASE: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0',
  Accept: 'application/json; charset=utf-8',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-sxm-clock': '[0,1]',
  Origin: 'https://www.siriusxm.com',
  Referer: 'https://www.siriusxm.com/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
};

interface SiriusXmChannel {
  id: string;
  type: 'channel-linear' | 'channel-xtra';
  number?: number;
  title: string;
  description?: string;
  imageUrl?: string;
}

export class SiriusXmAuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SiriusXmAuthError';
    this.status = status;
  }
}

export function getSiriusXmBearer(): string {
  const token = process.env.SIRIUSXM_TOKEN?.trim();
  if (!token) {
    throw new SiriusXmAuthError(
      'SIRIUSXM_TOKEN env var is not set. Capture a fresh bearer from siriusxm.com and set it.',
      401
    );
  }
  return token;
}

export function siriusXmHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...SIRIUSXM_HEADERS_BASE,
    Authorization: `Bearer ${getSiriusXmBearer()}`,
    ...(extra ?? {}),
  };
}

function buildSiriusXmId(channelId: string, type: SiriusXmChannel['type']): string {
  return `${SIRIUSXM_STATION_ID_PREFIX}${type}:${channelId}`;
}

export function parseSiriusXmId(
  stationId: string
): { id: string; type: SiriusXmChannel['type'] } | null {
  if (!stationId.startsWith(SIRIUSXM_STATION_ID_PREFIX)) {
    return null;
  }
  const rest = stationId.slice(SIRIUSXM_STATION_ID_PREFIX.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx <= 0) return null;
  const type = rest.slice(0, colonIdx) as SiriusXmChannel['type'];
  const id = rest.slice(colonIdx + 1);
  if (!id || (type !== 'channel-linear' && type !== 'channel-xtra')) {
    return null;
  }
  return { id, type };
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function categoryQuery(cat: SiriusXmCategory): string {
  const filter =
    cat === 'news'
      ? { and: [{ filterId: 'talk' }, { filterId: 'talk--news-and-politics' }] }
      : { one: { filterId: 'sports' } };

  const q = {
    containerConfiguration: {
      [CONTAINER_ID]: {
        filter,
        sets: {
          [SET_ID]: { sort: { sortId: 'CHANNEL_NUMBER_ASC' } },
        },
      },
    },
    pagination: {
      offset: { containerLimit: 6, containerOffset: 0, setItemsLimit: 50 },
    },
    deviceCapabilities: { supportsDownloads: false },
    constraints: {
      supportedEntityTypes: [
        'artist-station',
        'brand',
        'channel-linear',
        'channel-xtra',
        'container',
        'curated-grouping',
        'episode-audio',
        'episode-linear',
        'episode-podcast',
        'episode-video',
        'event',
        'experience',
        'genre',
        'league',
        'show',
        'show-podcast',
        'station',
        'tag-topic',
        'talent',
        'team',
        'user-signal',
      ],
    },
  };

  return `1.${b64urlJson(q)}`;
}

async function sxmFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...siriusXmHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const text = await response.text();

  if (response.status === 401 || response.status === 403) {
    throw new SiriusXmAuthError(
      `SiriusXM rejected the bearer token (HTTP ${response.status}). Refresh SIRIUSXM_TOKEN.`,
      response.status
    );
  }

  if (!response.ok) {
    throw new Error(`SiriusXM HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`SiriusXM expected JSON: ${text.slice(0, 200)}`);
  }
}

interface RawEntity {
  id?: string;
  type?: string;
  texts?: {
    title?: { default?: string; short?: string; medium?: string; long?: string };
    description?: { default?: string; short?: string; medium?: string; long?: string };
  };
  images?: {
    aspect1x1?: { default?: { url?: string } };
    default?: { url?: string };
  };
}

interface RawItem {
  entity?: RawEntity;
  decorations?: { channelNumberCanonical?: number; channelNumber?: number };
}

function pickText(t?: { default?: string; short?: string; medium?: string; long?: string }): string {
  return t?.default || t?.short || t?.medium || t?.long || '';
}

function pickImage(entity?: RawEntity): string | undefined {
  return (
    entity?.images?.aspect1x1?.default?.url ||
    entity?.images?.default?.url ||
    undefined
  );
}

function itemToChannel(item: RawItem): SiriusXmChannel | null {
  const entity = item?.entity;
  if (!entity?.id) return null;

  const type = entity.type || 'channel-linear';
  if (type !== 'channel-linear' && type !== 'channel-xtra') return null;

  const title = pickText(entity.texts?.title);
  if (!title) return null;

  const description = pickText(entity.texts?.description);
  const number = item?.decorations?.channelNumberCanonical ?? item?.decorations?.channelNumber;

  return {
    id: entity.id,
    type: type as SiriusXmChannel['type'],
    number: typeof number === 'number' ? number : undefined,
    title,
    description: description || undefined,
    imageUrl: pickImage(entity),
  };
}

function dedupe(channels: SiriusXmChannel[]): SiriusXmChannel[] {
  const seen = new Set<string>();
  const out: SiriusXmChannel[] = [];
  for (const ch of channels) {
    const key = `${ch.type}:${ch.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ch);
  }
  return out.sort((a, b) => {
    const an = a.number ?? 999_999;
    const bn = b.number ?? 999_999;
    if (an !== bn) return an - bn;
    return a.title.localeCompare(b.title);
  });
}

function toRadioStation(ch: SiriusXmChannel): RadioStation {
  const numberPrefix = ch.number ? `Ch ${ch.number} · ` : '';
  return {
    id: buildSiriusXmId(ch.id, ch.type),
    name: ch.title,
    description: ch.description || (ch.number ? `Channel ${ch.number}` : 'SiriusXM'),
    imageUrl: ch.imageUrl,
    genre: numberPrefix.trim().replace(/·\s*$/, '') || undefined,
  };
}

interface BrowseResponse {
  page?: { containers?: Array<{ sets?: Array<{ items?: RawItem[] }> }> };
}

interface SearchResponse {
  container?: { sets?: Array<{ items?: RawItem[] }> };
}

interface TuneSourceResponse {
  streams?: Array<{
    urls?: Array<{ url?: string; isPrimary?: boolean; validUntil?: string }>;
  }>;
}

async function fetchCategoryChannels(cat: SiriusXmCategory): Promise<SiriusXmChannel[]> {
  const url = `${BROWSE_URL}?q=${encodeURIComponent(categoryQuery(cat))}`;
  const json = await sxmFetch<BrowseResponse>(url);

  const channels: SiriusXmChannel[] = [];
  for (const container of json?.page?.containers ?? []) {
    for (const set of container?.sets ?? []) {
      for (const item of set?.items ?? []) {
        const ch = itemToChannel(item);
        if (ch) channels.push(ch);
      }
    }
  }
  return dedupe(channels);
}

async function searchChannels(query: string): Promise<SiriusXmChannel[]> {
  const json = await sxmFetch<SearchResponse>(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      searchString: query,
      filterTypes: ['channel-xtra', 'channel-linear'],
      preferredImageVariant: 'default',
    }),
  });

  const channels: SiriusXmChannel[] = [];
  for (const set of json?.container?.sets ?? []) {
    for (const item of set?.items ?? []) {
      const ch = itemToChannel(item);
      if (ch) channels.push(ch);
    }
  }
  return dedupe(channels);
}

export async function getSiriusXmTuneUrl(
  channelId: string,
  type: SiriusXmChannel['type']
): Promise<{ url: string; validUntil?: string }> {
  const json = await sxmFetch<TuneSourceResponse>(TUNE_SOURCE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      id: channelId,
      type,
      manifestVariant: 'WEB',
      trackResumeSupported: false,
      hlsVersion: 'V3',
      mtcVersion: 'V2',
    }),
  });

  const stream = json?.streams?.[0];
  const urls = stream?.urls ?? [];
  const primary = urls.find((u) => u?.isPrimary) ?? urls[0];

  if (!primary?.url) {
    throw new Error('No SiriusXM playback URL in tuneSource response');
  }

  return { url: primary.url, validUntil: primary.validUntil };
}

export interface SiriusXmService {
  search(params: RadioSearchParams): Promise<RadioStation[]>;
  getCategoryStations(cat: SiriusXmCategory): Promise<RadioStation[]>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;
  getStream(stationId: string, quality?: SiriusXmQuality): Promise<RadioProviderResult>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;
}

export function createSiriusXmService(): SiriusXmService {
  return {
    async search(params: RadioSearchParams): Promise<RadioStation[]> {
      const query = params.query.trim();
      if (!query) return [];
      try {
        const channels = await searchChannels(query);
        return channels.slice(0, params.limit ?? 50).map(toRadioStation);
      } catch (error) {
        console.error('[SiriusXM] Search error:', error);
        if (error instanceof SiriusXmAuthError) throw error;
        return [];
      }
    },

    async getCategoryStations(cat: SiriusXmCategory): Promise<RadioStation[]> {
      try {
        const channels = await fetchCategoryChannels(cat);
        return channels.map(toRadioStation);
      } catch (error) {
        console.error('[SiriusXM] Category browse error:', error);
        if (error instanceof SiriusXmAuthError) throw error;
        return [];
      }
    },

    async getPopularStations(genre?: string): Promise<RadioStation[]> {
      const cat: SiriusXmCategory = genre?.toLowerCase() === 'news' ? 'news' : 'sports';
      return this.getCategoryStations(cat);
    },

    async getStream(
      stationId: string,
      quality: SiriusXmQuality = '256'
    ): Promise<RadioProviderResult> {
      const parsed = parseSiriusXmId(stationId);
      if (!parsed) return { streams: [], preferred: null };

      try {
        const tune = await getSiriusXmTuneUrl(parsed.id, parsed.type);
        const proxiedUrl = `/api/radio/proxy?u=${encodeURIComponent(tune.url)}&quality=${encodeURIComponent(
          quality
        )}`;

        const stream: RadioStream = {
          url: proxiedUrl,
          mediaType: 'hls',
          isDirect: false,
        };

        return { streams: [stream], preferred: stream };
      } catch (error) {
        console.error('[SiriusXM] Stream error:', error);
        return { streams: [], preferred: null };
      }
    },

    async getStationInfo(stationId: string): Promise<RadioStation | null> {
      const parsed = parseSiriusXmId(stationId);
      if (!parsed) return null;
      // Best effort: search by id is not supported by SiriusXM; the station name
      // is already cached client-side in favorites. Return a minimal placeholder.
      return {
        id: stationId,
        name: 'SiriusXM',
        description: 'SiriusXM channel',
        genre: 'SiriusXM',
      };
    },
  };
}

let serviceInstance: SiriusXmService | null = null;

export function getSiriusXmService(): SiriusXmService {
  if (!serviceInstance) {
    serviceInstance = createSiriusXmService();
  }
  return serviceInstance;
}

export function resetSiriusXmService(): void {
  serviceInstance = null;
}

// ============================================================================
// HLS Playlist Rewriting (for /api/radio/proxy)
// ============================================================================

function isProbablyPlaylistUrl(url: string): boolean {
  return url.includes('.m3u8') || url.includes('m3u8?');
}

export function looksLikePlaylist(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    isProbablyPlaylistUrl(url) ||
    ct.includes('mpegurl') ||
    ct.includes('m3u') ||
    ct.includes('vnd.apple')
  );
}

function absolutize(uri: string, playlistUrl: string): string {
  return new URL(uri, playlistUrl).toString();
}

function proxify(url: string, baseUrl: string, quality: SiriusXmQuality): string {
  return `${baseUrl}/api/radio/proxy?u=${encodeURIComponent(url)}&quality=${encodeURIComponent(
    quality
  )}`;
}

function chooseSingleVariantPlaylist(
  text: string,
  playlistUrl: string,
  quality: SiriusXmQuality
): string | null {
  const lines = text.split(/\r?\n/);

  interface Variant {
    info: string;
    absoluteUri: string;
    bandwidth: number;
    qualityScore: number;
  }

  const variants: Variant[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    const uri = lines[i + 1];
    if (!uri || uri.startsWith('#')) continue;

    const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
    const bandwidth = bwMatch ? Number(bwMatch[1]) : 0;
    const absoluteUri = absolutize(uri, playlistUrl);

    let qualityScore = 0;
    if (absoluteUri.includes(`_${quality}k_`) || absoluteUri.includes(`${quality}k`)) {
      qualityScore = 10_000_000;
    }

    variants.push({ info: line, absoluteUri, bandwidth, qualityScore });
  }

  if (!variants.length) return null;

  variants.sort((a, b) => b.qualityScore + b.bandwidth - (a.qualityScore + a.bandwidth));
  const picked = variants[0];

  return ['#EXTM3U', '#EXT-X-VERSION:3', picked.info, picked.absoluteUri, ''].join('\n');
}

export function rewriteSiriusXmPlaylist(
  text: string,
  playlistUrl: string,
  baseUrl: string,
  quality: SiriusXmQuality
): string {
  const singleVariant = chooseSingleVariantPlaylist(text, playlistUrl, quality);
  const source = singleVariant ?? text;

  const lines = source.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith('#EXT-X-KEY')) {
      const rewritten = line.replace(/URI="([^"]+)"/, (_m, uri) => {
        const absolute = absolutize(uri, playlistUrl);
        return `URI="${proxify(absolute, baseUrl, quality)}"`;
      });
      out.push(rewritten);
      continue;
    }

    if (trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }

    const absolute = absolutize(trimmed, playlistUrl);
    out.push(proxify(absolute, baseUrl, quality));
  }

  return out.join('\n');
}

export function decodeSiriusXmKeyJson(json: unknown): Buffer {
  const obj = json as Record<string, unknown>;
  const result = obj?.result as Record<string, unknown> | undefined;

  const candidates = [
    obj?.key,
    obj?.value,
    obj?.keyValue,
    obj?.encryptionKey,
    obj?.encryptionKeyValue,
    obj?.data,
    obj?.payload,
    result?.key,
    result?.value,
  ];

  const raw = candidates.find((v) => typeof v === 'string') as string | undefined;

  if (!raw) {
    throw new Error(`Could not find SiriusXM key in JSON: ${JSON.stringify(json).slice(0, 200)}`);
  }

  if (/^[A-Za-z0-9+/=_-]+$/.test(raw)) {
    return Buffer.from(raw.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
  }

  if (/^[a-fA-F0-9]+$/.test(raw) && raw.length % 2 === 0) {
    return Buffer.from(raw, 'hex');
  }

  return Buffer.from(raw, 'utf8');
}
