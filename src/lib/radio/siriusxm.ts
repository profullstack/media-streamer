/**
 * SiriusXM Service
 *
 * Server-side SiriusXM integration. The browse, search and tune calls, the HLS
 * rewrite and the AES key decode are @profullstack/stream-providers' SiriusXM
 * adapter (shared with tipoffwatch and watchnews); siriusxm-auth.ts configures
 * it to go out through proxyFetch and the user's pinned proxy. The bearer comes
 * from siriusxm-auth, which refreshes it per user.
 */

import {
  ensureSiriusXmBearer,
  getSiriusXmProxyAgent,
  getSiriusXmProxyUrl,
  invalidateSiriusXmSession,
  SiriusXmAuthError,
} from './siriusxm-auth';
import type {
  RadioProviderResult,
  RadioSearchParams,
  RadioStation,
  RadioStream,
  SiriusXmCategory,
  SiriusXmQuality,
} from './types';

import * as sxm from '@profullstack/stream-providers/siriusxm';

export { SiriusXmAuthError } from './siriusxm-auth';

export const SIRIUSXM_STATION_ID_PREFIX = 'sxm:';

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

export async function siriusXmHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const bearer = await ensureSiriusXmBearer();
  return {
    ...SIRIUSXM_HEADERS_BASE,
    Authorization: `Bearer ${bearer}`,
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

/**
 * What every package call takes: the user's refreshing bearer, their proxy, and
 * what to do when SiriusXM refuses the bearer (drop the cache; the one retry
 * then mints a fresh one).
 */
function callCtx() {
  const agent = getSiriusXmProxyAgent();
  return {
    bearer: ensureSiriusXmBearer,
    proxy: agent ? getSiriusXmProxyUrl() : null,
    unauthorized: () => invalidateSiriusXmSession(),
  };
}

/** The package's errors as this app's, so callers keep one instanceof check. */
async function asAuthError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof sxm.SiriusXmError) {
      throw new SiriusXmAuthError(err.message, err.status, err.data);
    }
    throw err;
  }
}

function fromPackage(ch: sxm.SiriusXmChannel): SiriusXmChannel {
  return {
    id: ch.id,
    type: ch.type,
    number: ch.number ?? undefined,
    title: ch.title,
    description: ch.description ?? undefined,
    imageUrl: ch.image ?? undefined,
  };
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

async function fetchCategoryChannels(cat: SiriusXmCategory): Promise<SiriusXmChannel[]> {
  const list = await asAuthError(() => sxm.browseChannels(cat, callCtx()));
  return list.map(fromPackage);
}

async function searchChannels(query: string): Promise<SiriusXmChannel[]> {
  const list = await asAuthError(() => sxm.searchChannels(query, callCtx()));
  return list.map(fromPackage);
}

export async function getSiriusXmTuneUrl(
  channelId: string,
  type: SiriusXmChannel['type']
): Promise<{ url: string; validUntil?: string }> {
  const { url, validUntil } = await asAuthError(() =>
    sxm.tuneChannel({ id: channelId, type }, callCtx())
  );
  return { url, validUntil: validUntil ?? undefined };
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

function proxify(url: string, baseUrl: string, quality: SiriusXmQuality): string {
  return `${baseUrl}/api/radio/proxy?u=${encodeURIComponent(url)}&quality=${encodeURIComponent(
    quality
  )}`;
}

/** One variant at the asked-for bitrate, every segment and key pointed at our proxy. */
export function rewriteSiriusXmPlaylist(
  text: string,
  playlistUrl: string,
  baseUrl: string,
  quality: SiriusXmQuality
): string {
  return sxm.rewritePlaylist(text, playlistUrl, quality, (url) => proxify(url, baseUrl, quality));
}

/** The AES-128 key JSON as the 16 raw bytes an HLS player wants. */
export function decodeSiriusXmKeyJson(json: unknown): Buffer {
  return sxm.decodeKeyJson(json);
}
