/**
 * Radio Station Types
 *
 * Types for TuneIn API integration and radio station management.
 */

/**
 * TuneIn API station response from favorites/follows endpoint
 */
export interface TuneInStation {
  GuideId: string;
  Title: string;
  Subtitle?: string;
  Image?: string;
  Actions?: {
    Play?: string;
  };
  Presets?: string[];
  CurrentSong?: string;
  Genre?: string;
  Subtext?: string;
}

/**
 * TuneIn API stream response
 */
export interface TuneInStream {
  element: string;
  url: string;
  media_type: 'mp3' | 'aac' | 'hls' | 'flash' | 'ogg' | 'html';
  position: number;
  player_width?: number;
  player_height?: number;
  is_direct: boolean;
  bitrate?: number;
  reliability?: number;
  guide_id?: string;
}

/**
 * TuneIn API tune response
 */
export interface TuneInTuneResponse {
  head: {
    status: string;
    fault?: string;
  };
  body: TuneInStream[];
}

/**
 * TuneIn API favorites response
 */
export interface TuneInFavoritesResponse {
  Items: TuneInStation[];
  Total: number;
}

/**
 * TuneIn search result
 */
export interface TuneInSearchResult {
  GuideId: string;
  Title: string;
  Subtitle?: string;
  Image?: string;
  Type: 'station' | 'topic' | 'program';
  Actions?: {
    Browse?: string;
    Play?: string;
  };
  CurrentTrack?: string;
  Bandwidth?: string;
  Formats?: string;
  Genre?: string;
  Reliability?: number;
}

/**
 * TuneIn search response
 */
export interface TuneInSearchResponse {
  head: {
    status: string;
  };
  body: TuneInSearchResult[];
}

/**
 * Normalized radio station for our app
 */
export interface RadioStation {
  id: string;           // TuneIn GuideId
  name: string;         // Title
  description?: string; // Subtitle
  imageUrl?: string;    // Image
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
  station_id: string;        // TuneIn GuideId
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
  filter?: 's' | 't' | 'p'; // s = stations, t = topics, p = programs
  limit?: number;
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
