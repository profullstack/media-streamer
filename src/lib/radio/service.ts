/**
 * Radio Service
 *
 * Server-side service for radio operations including search,
 * stream resolution, and favorites management.
 */

import type { RadioRepository } from './repository';
import type {
  RadioStation,
  RadioStream,
  RadioStationFavorite,
  RadioSearchParams,
} from './types';
import { createManualRadioService } from './manual';
import { createRadioBrowserService } from './radio-browser';
import { parseCustomStationId, resolveCustomStreamUrl } from './station-utils';

// ============================================================================
// Service Interface
// ============================================================================

export interface RadioService {
  // Search operations
  searchStations(params: RadioSearchParams): Promise<RadioStation[]>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;

  // Stream operations
  getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;

  // Favorites operations (require userId)
  getUserFavorites(userId: string): Promise<RadioStationFavorite[]>;
  addToFavorites(userId: string, station: RadioStation): Promise<RadioStationFavorite>;
  removeFromFavorites(userId: string, stationId: string): Promise<void>;
  isFavorite(userId: string, stationId: string): Promise<boolean>;
}

interface RadioProvider {
  search(params: RadioSearchParams): Promise<RadioStation[]>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;
  getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a radio service instance
 */
export function createRadioService(
  repository: RadioRepository,
  providers: RadioProvider[]
): RadioService {
  return {
    /**
     * Search for radio stations
     */
    async searchStations(params: RadioSearchParams): Promise<RadioStation[]> {
      const results = await Promise.all(providers.map((provider) => provider.search(params)));
      const merged = results.flat();
      const deduped = new Map<string, RadioStation>();

      for (const station of merged) {
        if (!deduped.has(station.id)) {
          deduped.set(station.id, station);
        }
      }

      return Array.from(deduped.values()).slice(0, params.limit ?? 50);
    },

    /**
     * Get popular stations
     */
    async getPopularStations(genre?: string): Promise<RadioStation[]> {
      const results = await Promise.all(providers.map((provider) => provider.getPopularStations(genre)));
      const merged = results.flat();
      const deduped = new Map<string, RadioStation>();

      for (const station of merged) {
        if (!deduped.has(station.id)) {
          deduped.set(station.id, station);
        }
      }

      return Array.from(deduped.values());
    },

    /**
     * Get streaming URLs for a station
     */
    async getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }> {
      const customStreamUrl = parseCustomStationId(stationId);
      if (customStreamUrl) {
        const stream = await resolveCustomStreamUrl(customStreamUrl);
        return {
          streams: [stream],
          preferred: stream,
        };
      }

      for (const provider of providers) {
        const result = await provider.getStream(stationId);
        if (result.streams.length > 0) {
          return result;
        }
      }

      return { streams: [], preferred: null };
    },

    /**
     * Get station info
     */
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

      for (const provider of providers) {
        const station = await provider.getStationInfo(stationId);
        if (station) {
          return station;
        }
      }

      return null;
    },

    /**
     * Get user's favorite stations
     */
    async getUserFavorites(userId: string): Promise<RadioStationFavorite[]> {
      return repository.getUserFavorites(userId);
    },

    /**
     * Add a station to favorites
     */
    async addToFavorites(userId: string, station: RadioStation): Promise<RadioStationFavorite> {
      return repository.addFavorite({
        user_id: userId,
        station_id: station.id,
        station_name: station.name,
        station_image_url: station.imageUrl ?? null,
        station_genre: station.genre ?? null,
      });
    },

    /**
     * Remove a station from favorites
     */
    async removeFromFavorites(userId: string, stationId: string): Promise<void> {
      return repository.removeFavorite(userId, stationId);
    },

    /**
     * Check if a station is favorited
     */
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

/**
 * Get the singleton radio service instance
 */
export function getRadioService(): RadioService {
  if (!serviceInstance) {
    serviceInstance = createRadioService(
      getRadioRepository(),
      [
        createManualRadioService(),
        createRadioBrowserService(),
      ]
    );
  }
  return serviceInstance;
}

/**
 * Reset the service instance (for testing)
 */
export function resetRadioService(): void {
  serviceInstance = null;
}
