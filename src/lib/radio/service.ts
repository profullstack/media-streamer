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
import { createSiriusXmService, parseSiriusXmId, type SiriusXmService } from './siriusxm';
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
      return repository.getUserFavorites(profileId);
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
