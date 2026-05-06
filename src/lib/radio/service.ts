/**
 * Radio Service
 *
 * Server-side SiriusXM operations: search, category browse, stream resolution,
 * and favorites management.
 */

import type { RadioRepository } from './repository';
import type {
  RadioStation,
  RadioStationFavorite,
  RadioSearchParams,
  RadioProviderResult,
  SiriusXmCategory,
  SiriusXmQuality,
} from './types';
import {
  createSiriusXmService,
  parseSiriusXmId,
  SIRIUSXM_STATION_ID_PREFIX,
  type SiriusXmService,
} from './siriusxm';
import { parseCustomStationId, resolveCustomStreamUrl } from './station-utils';

export interface RadioService {
  searchStations(params: RadioSearchParams): Promise<RadioStation[]>;
  getCategoryStations(cat: SiriusXmCategory): Promise<RadioStation[]>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;

  getStream(stationId: string, quality?: SiriusXmQuality): Promise<RadioProviderResult>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;

  getUserFavorites(profileId: string): Promise<RadioStationFavorite[]>;
  addToFavorites(profileId: string, station: RadioStation): Promise<RadioStationFavorite>;
  removeFromFavorites(profileId: string, stationId: string): Promise<void>;
  isFavorite(profileId: string, stationId: string): Promise<boolean>;
}

export function createRadioService(
  repository: RadioRepository,
  siriusxm: SiriusXmService
): RadioService {
  return {
    async searchStations(params: RadioSearchParams): Promise<RadioStation[]> {
      const limit = params.limit ?? 50;
      const stations = await siriusxm.search(params);
      return stations.slice(0, limit);
    },

    async getCategoryStations(cat: SiriusXmCategory): Promise<RadioStation[]> {
      return siriusxm.getCategoryStations(cat);
    },

    async getPopularStations(genre?: string): Promise<RadioStation[]> {
      const cat: SiriusXmCategory = genre?.toLowerCase() === 'news' ? 'news' : 'sports';
      return siriusxm.getCategoryStations(cat);
    },

    async getStream(
      stationId: string,
      quality: SiriusXmQuality = '256'
    ): Promise<RadioProviderResult> {
      const customStreamUrl = parseCustomStationId(stationId);
      if (customStreamUrl) {
        const stream = await resolveCustomStreamUrl(customStreamUrl);
        return { streams: [stream], preferred: stream };
      }

      if (parseSiriusXmId(stationId)) {
        return siriusxm.getStream(stationId, quality);
      }

      return { streams: [], preferred: null };
    },

    async getStationInfo(stationId: string): Promise<RadioStation | null> {
      const customStreamUrl = parseCustomStationId(stationId);
      if (customStreamUrl) {
        return {
          id: stationId,
          name: new URL(customStreamUrl).hostname.replace(/^www\./i, ''),
          description: 'Custom stream URL',
          genre: 'Custom',
        };
      }

      if (parseSiriusXmId(stationId)) {
        return siriusxm.getStationInfo(stationId);
      }

      return null;
    },

    async getUserFavorites(profileId: string): Promise<RadioStationFavorite[]> {
      const favorites = await repository.getUserFavorites(profileId);
      await backfillSxmImages(favorites, profileId, siriusxm, repository);
      return favorites;
    },

    async addToFavorites(profileId: string, station: RadioStation): Promise<RadioStationFavorite> {
      return repository.addFavorite({
        profile_id: profileId,
        station_id: station.id,
        station_name: station.name,
        station_image_url: station.imageUrl ?? null,
        station_genre: station.genre ?? null,
      });
    },

    async removeFromFavorites(profileId: string, stationId: string): Promise<void> {
      return repository.removeFavorite(profileId, stationId);
    },

    async isFavorite(profileId: string, stationId: string): Promise<boolean> {
      return repository.isFavorite(profileId, stationId);
    },
  };
}

import { getRadioRepository } from './repository';

// In-memory cache of the SXM channel catalog so concurrent favorites loads
// share one fetch. 15-min TTL — channel images change rarely.
const CHANNEL_CATALOG_TTL_MS = 15 * 60 * 1000;
let cachedCatalog: { at: number; byStationId: Map<string, RadioStation> } | null = null;
let inflightCatalog: Promise<Map<string, RadioStation>> | null = null;

async function loadChannelCatalog(siriusxm: SiriusXmService): Promise<Map<string, RadioStation>> {
  const now = Date.now();
  if (cachedCatalog && now - cachedCatalog.at < CHANNEL_CATALOG_TTL_MS) {
    return cachedCatalog.byStationId;
  }
  if (inflightCatalog) return inflightCatalog;

  inflightCatalog = (async () => {
    const map = new Map<string, RadioStation>();
    for (const cat of ['sports', 'news'] as const) {
      try {
        const stations = await siriusxm.getCategoryStations(cat);
        for (const s of stations) map.set(s.id, s);
      } catch (err) {
        console.error('[RadioService] catalog load failed for', cat, err);
      }
    }
    cachedCatalog = { at: Date.now(), byStationId: map };
    return map;
  })().finally(() => {
    inflightCatalog = null;
  });

  return inflightCatalog;
}

/**
 * Backfill missing station_image_url on SXM favorites. Old rows (added
 * before the image-CDN URL transformation landed) have null image. Look
 * each one up in the channel catalog and persist if found. Mutates the
 * input array in place so the caller returns enriched favorites without
 * re-querying.
 */
async function backfillSxmImages(
  favorites: RadioStationFavorite[],
  profileId: string,
  siriusxm: SiriusXmService,
  repository: RadioRepository
): Promise<void> {
  const stale = favorites.filter(
    (f) =>
      f.station_id.startsWith(SIRIUSXM_STATION_ID_PREFIX) &&
      (!f.station_image_url || !/^https?:\/\//.test(f.station_image_url))
  );
  if (!stale.length) return;

  const catalog = await loadChannelCatalog(siriusxm);
  if (!catalog.size) return;

  for (const fav of stale) {
    const fresh = catalog.get(fav.station_id);
    if (!fresh?.imageUrl) continue;
    fav.station_image_url = fresh.imageUrl;
    void repository.updateFavoriteImage(profileId, fav.station_id, fresh.imageUrl);
  }
}

let serviceInstance: RadioService | null = null;

export function getRadioService(): RadioService {
  if (!serviceInstance) {
    serviceInstance = createRadioService(
      getRadioRepository(),
      createSiriusXmService()
    );
  }
  return serviceInstance;
}

export function resetRadioService(): void {
  serviceInstance = null;
}
