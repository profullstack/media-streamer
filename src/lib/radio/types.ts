/**
 * Radio Station Types
 */

export type SiriusXmCategory = 'sports' | 'news';
export type SiriusXmQuality = '256' | '128' | '64' | '32';

/**
 * Normalized radio station for our app
 */
export interface RadioStation {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  genre?: string;
  currentTrack?: string;
  reliability?: number;
  formats?: string[];
}

/**
 * Radio stream with resolved URL
 */
export interface RadioStream {
  url: string;
  mediaType: 'mp3' | 'aac' | 'hls' | 'flash' | 'ogg' | 'html';
  bitrate?: number;
  isDirect: boolean;
}

/**
 * User's favorite radio station (stored in DB)
 */
export interface RadioStationFavorite {
  id: string;
  user_id: string;
  station_id: string;
  station_name: string;
  station_image_url?: string | null;
  station_genre?: string | null;
  created_at: string;
}

/**
 * Radio station search parameters
 */
export interface RadioSearchParams {
  query: string;
  filter?: 's' | 't' | 'p';
  limit?: number;
  category?: SiriusXmCategory;
  quality?: SiriusXmQuality;
}

/**
 * Combined provider result for a stream lookup
 */
export interface RadioProviderResult {
  streams: RadioStream[];
  preferred: RadioStream | null;
}

/**
 * Radio API response for search
 */
export interface RadioSearchResponse {
  stations: RadioStation[];
  total: number;
}

/**
 * Radio API response for favorites
 */
export interface RadioFavoritesResponse {
  favorites: RadioStationFavorite[];
  total: number;
}

/**
 * Radio stream resolution response
 */
export interface RadioStreamResponse {
  station: RadioStation;
  streams: RadioStream[];
  preferredStream: RadioStream | null;
}
