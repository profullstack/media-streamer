/**
 * Radio Service
 *
 * Server-side service for radio operations including search,
 * stream resolution, and favorites management.
 */

import type { RadioRepository } from './repository';
import type { TuneInService } from './tunein';
import type {
  RadioStation,
  RadioStream,
  RadioStationFavorite,
  RadioSearchParams,
} from './types';

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

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a radio service instance
 */
export function createRadioService(
  repository: RadioRepository,
  tunein: TuneInService
): RadioService {
  return {
    /**
     * Search for radio stations
     */
    async searchStations(params: RadioSearchParams): Promise<RadioStation[]> {
      return tunein.search(params);
    },

    /**
     * Get popular stations
     */
    async getPopularStations(genre?: string): Promise<RadioStation[]> {
      return tunein.getPopularStations(genre);
    },

    /**
     * Get streaming URLs for a station
     */
    async getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }> {
      return tunein.getStream(stationId);
    },

    /**
     * Get station info
     */
    async getStationInfo(stationId: string): Promise<RadioStation | null> {
      return tunein.getStationInfo(stationId);
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
import { getTuneInService } from './tunein';

let serviceInstance: RadioService | null = null;

/**
 * Get the singleton radio service instance
 */
export function getRadioService(): RadioService {
  if (!serviceInstance) {
    serviceInstance = createRadioService(
      getRadioRepository(),
      getTuneInService()
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
