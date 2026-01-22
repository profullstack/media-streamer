/**
 * Radio Repository
 *
 * Database operations for radio station favorites.
 * Uses Supabase with Row Level Security.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  RadioStationFavorite,
  RadioStationFavoriteInsert,
} from '@/lib/supabase/types';

// ============================================================================
// Repository Interface
// ============================================================================

export interface RadioRepository {
  getUserFavorites(userId: string): Promise<RadioStationFavorite[]>;
  addFavorite(data: RadioStationFavoriteInsert): Promise<RadioStationFavorite>;
  removeFavorite(userId: string, stationId: string): Promise<void>;
  isFavorite(userId: string, stationId: string): Promise<boolean>;
  getFavorite(userId: string, stationId: string): Promise<RadioStationFavorite | null>;
}

// ============================================================================
// Repository Implementation
// ============================================================================

/**
 * Create a radio repository instance
 */
export function createRadioRepository(): RadioRepository {
  return {
    /**
     * Get all favorite stations for a user
     */
    async getUserFavorites(userId: string): Promise<RadioStationFavorite[]> {
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('radio_station_favorites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[RadioRepository] getUserFavorites error:', error);
        throw new Error(`Failed to get favorites: ${error.message}`);
      }

      return data || [];
    },

    /**
     * Add a station to favorites
     */
    async addFavorite(data: RadioStationFavoriteInsert): Promise<RadioStationFavorite> {
      const supabase = createServerClient();

      const { data: favorite, error } = await supabase
        .from('radio_station_favorites')
        .insert(data)
        .select()
        .single();

      if (error) {
        // Check for unique constraint violation (already favorited)
        if (error.code === '23505') {
          // Return existing favorite instead of error
          const existing = await this.getFavorite(data.user_id, data.station_id);
          if (existing) return existing;
        }
        console.error('[RadioRepository] addFavorite error:', error);
        throw new Error(`Failed to add favorite: ${error.message}`);
      }

      return favorite;
    },

    /**
     * Remove a station from favorites
     */
    async removeFavorite(userId: string, stationId: string): Promise<void> {
      const supabase = createServerClient();

      const { error } = await supabase
        .from('radio_station_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('station_id', stationId);

      if (error) {
        console.error('[RadioRepository] removeFavorite error:', error);
        throw new Error(`Failed to remove favorite: ${error.message}`);
      }
    },

    /**
     * Check if a station is favorited by user
     */
    async isFavorite(userId: string, stationId: string): Promise<boolean> {
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('radio_station_favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('station_id', stationId)
        .maybeSingle();

      if (error) {
        console.error('[RadioRepository] isFavorite error:', error);
        return false;
      }

      return data !== null;
    },

    /**
     * Get a specific favorite
     */
    async getFavorite(userId: string, stationId: string): Promise<RadioStationFavorite | null> {
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('radio_station_favorites')
        .select('*')
        .eq('user_id', userId)
        .eq('station_id', stationId)
        .maybeSingle();

      if (error) {
        console.error('[RadioRepository] getFavorite error:', error);
        return null;
      }

      return data;
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let repositoryInstance: RadioRepository | null = null;

/**
 * Get the singleton radio repository instance
 */
export function getRadioRepository(): RadioRepository {
  if (!repositoryInstance) {
    repositoryInstance = createRadioRepository();
  }
  return repositoryInstance;
}
