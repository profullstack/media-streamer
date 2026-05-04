/**
 * Radio Repository
 *
 * Database operations for radio station favorites. Scoped by profile.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  RadioStationFavorite,
  RadioStationFavoriteInsert,
} from '@/lib/supabase/types';

export interface RadioRepository {
  getUserFavorites(profileId: string): Promise<RadioStationFavorite[]>;
  addFavorite(data: RadioStationFavoriteInsert): Promise<RadioStationFavorite>;
  removeFavorite(profileId: string, stationId: string): Promise<void>;
  isFavorite(profileId: string, stationId: string): Promise<boolean>;
  getFavorite(profileId: string, stationId: string): Promise<RadioStationFavorite | null>;
}

function toProfileScopedInsert(data: RadioStationFavoriteInsert): RadioStationFavoriteInsert {
  // The service layer passes the active profile ID via the user_id field for
  // historical reasons; map it onto profile_id for the profile-scoped schema.
  const profileId = data.profile_id ?? data.user_id ?? null;
  return {
    profile_id: profileId,
    station_id: data.station_id,
    station_name: data.station_name,
    station_image_url: data.station_image_url ?? null,
    station_genre: data.station_genre ?? null,
  };
}

export function createRadioRepository(): RadioRepository {
  return {
    async getUserFavorites(profileId: string): Promise<RadioStationFavorite[]> {
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('radio_station_favorites')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[RadioRepository] getUserFavorites error:', error);
        throw new Error(`Failed to get favorites: ${error.message}`);
      }

      return data || [];
    },

    async addFavorite(data: RadioStationFavoriteInsert): Promise<RadioStationFavorite> {
      const supabase = createServerClient();
      const insert = toProfileScopedInsert(data);
      const profileId = insert.profile_id;

      if (!profileId) {
        throw new Error('Cannot add favorite without an active profile');
      }

      const { data: favorite, error } = await supabase
        .from('radio_station_favorites')
        .insert(insert)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          const existing = await this.getFavorite(profileId, insert.station_id);
          if (existing) return existing;
        }
        console.error('[RadioRepository] addFavorite error:', error);
        throw new Error(`Failed to add favorite: ${error.message}`);
      }

      return favorite;
    },

    async removeFavorite(profileId: string, stationId: string): Promise<void> {
      const supabase = createServerClient();

      const { error } = await supabase
        .from('radio_station_favorites')
        .delete()
        .eq('profile_id', profileId)
        .eq('station_id', stationId);

      if (error) {
        console.error('[RadioRepository] removeFavorite error:', error);
        throw new Error(`Failed to remove favorite: ${error.message}`);
      }
    },

    async isFavorite(profileId: string, stationId: string): Promise<boolean> {
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('radio_station_favorites')
        .select('id')
        .eq('profile_id', profileId)
        .eq('station_id', stationId)
        .maybeSingle();

      if (error) {
        console.error('[RadioRepository] isFavorite error:', error);
        return false;
      }

      return data !== null;
    },

    async getFavorite(profileId: string, stationId: string): Promise<RadioStationFavorite | null> {
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('radio_station_favorites')
        .select('*')
        .eq('profile_id', profileId)
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

let repositoryInstance: RadioRepository | null = null;

export function getRadioRepository(): RadioRepository {
  if (!repositoryInstance) {
    repositoryInstance = createRadioRepository();
  }
  return repositoryInstance;
}
