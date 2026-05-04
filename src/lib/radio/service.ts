/**
 * Radio Service
 *
 * Server-side service for radio operations including search,
 * stream resolution, and favorites management.
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
import { createManualRadioService } from './manual';
import { createRadioBrowserService } from './radio-browser';
import { createSiriusXmService, parseSiriusXmId, type SiriusXmService } from './siriusxm';
import { parseCustomStationId, resolveCustomStreamUrl } from './station-utils';

// ============================================================================
// Service Interface
// ============================================================================

export interface RadioService {
  searchStations(params: RadioSearchParams): Promise<RadioStation[]>;
  getCategoryStations(cat: SiriusXmCategory): Promise<RadioStation[]>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;

  getStream(stationId: string, quality?: SiriusXmQuality): Promise<RadioProviderResult>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;

  getUserFavorites(userId: string): Promise<RadioStationFavorite[]>;
  addToFavorites(userId: string, station: RadioStation): Promise<RadioStationFavorite>;
  removeFromFavorites(userId: string, stationId: string): Promise<void>;
  isFavorite(userId: string, stationId: string): Promise<boolean>;
}

interface RadioProvider {
  search(params: RadioSearchParams): Promise<RadioStation[]>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;
  getStream(stationId: string): Promise<RadioProviderResult>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;
}

// ============================================================================
// Service Implementation
// ============================================================================

export function createRadioService(
  repository: RadioRepository,
  siriusxm: SiriusXmService,
  fallbackProviders: RadioProvider[]
): RadioService {
  return {
    async searchStations(params: RadioSearchParams): Promise<RadioStation[]> {
      const limit = params.limit ?? 50;

      const sxmResults = await siriusxm.search(params);
      const fallbackResults = await Promise.all(
        fallbackProviders.map((provider) => provider.search(params))
      );

      const merged = [...sxmResults, ...fallbackResults.flat()];
      const deduped = new Map<string, RadioStation>();
      for (const station of merged) {
        if (!deduped.has(station.id)) deduped.set(station.id, station);
      }
      return Array.from(deduped.values()).slice(0, limit);
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

      for (const provider of fallbackProviders) {
        const result = await provider.getStream(stationId);
        if (result.streams.length > 0) return result;
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

      for (const provider of fallbackProviders) {
        const station = await provider.getStationInfo(stationId);
        if (station) return station;
      }

      return null;
    },

    async getUserFavorites(userId: string): Promise<RadioStationFavorite[]> {
      return repository.getUserFavorites(userId);
    },

    async addToFavorites(userId: string, station: RadioStation): Promise<RadioStationFavorite> {
      return repository.addFavorite({
        user_id: userId,
        station_id: station.id,
        station_name: station.name,
        station_image_url: station.imageUrl ?? null,
        station_genre: station.genre ?? null,
      });
    },

    async removeFromFavorites(userId: string, stationId: string): Promise<void> {
      return repository.removeFavorite(userId, stationId);
    },

    async isFavorite(userId: string, stationId: string): Promise<boolean> {
      return repository.isFavorite(userId, stationId);
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

import { getRadioRepository } from './repository';

let serviceInstance: RadioService | null = null;

export function getRadioService(): RadioService {
  if (!serviceInstance) {
    serviceInstance = createRadioService(
      getRadioRepository(),
      createSiriusXmService(),
      [createManualRadioService(), createRadioBrowserService()]
    );
  }
  return serviceInstance;
}

export function resetRadioService(): void {
  serviceInstance = null;
}
