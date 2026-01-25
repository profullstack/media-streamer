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
 * TuneIn search result (actual API response format)
 */
export interface TuneInSearchResult {
  element: string;
  type: 'audio' | 'link';
  text: string;
  URL?: string;
  bitrate?: string;
  reliability?: number;
  guide_id: string;
  subtext?: string;
  genre_id?: string;
  formats?: string;
  image?: string;
  item?: 'station' | 'show' | 'topic';
  now_playing_id?: string;
  preset_id?: string;
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

// ============================================================================
// Premium TuneIn API Types (api.radiotime.com/profiles)
// ============================================================================

/**
 * Content info from premium search result
 */
export interface TuneInPremiumContentInfo {
  Type: 'Station' | 'Audiobook' | 'Podcast' | 'Show' | string;
  [key: string]: unknown;
}

/**
 * SEO info from premium search result (contains title)
 */
export interface TuneInPremiumSEOInfo {
  Title: string;
  Description?: string;
  [key: string]: unknown;
}

/**
 * Cell structure from premium search result
 */
export interface TuneInPremiumCell {
  GuideId?: string;
  ContentInfo?: TuneInPremiumContentInfo;
  SEOInfo?: TuneInPremiumSEOInfo;
  Image?: string;
  [key: string]: unknown;
}

/**
 * Item in premium search result List/Gallery
 */
export interface TuneInPremiumListItem {
  [key: string]: TuneInPremiumCell | unknown;
}

/**
 * List/Gallery structure in premium search
 */
export interface TuneInPremiumList {
  Items: TuneInPremiumListItem[];
  [key: string]: unknown;
}

/**
 * Top-level item in premium search response
 */
export interface TuneInPremiumItem {
  List?: TuneInPremiumList;
  Gallery?: TuneInPremiumList;
  [key: string]: unknown;
}

/**
 * Premium search API response
 */
export interface TuneInPremiumSearchResponse {
  Items: TuneInPremiumItem[];
  [key: string]: unknown;
}

/**
 * Podcast contents response for getting episode IDs
 */
export interface TuneInPodcastContentsResponse {
  Items: Array<{
    Children?: Array<{
      GuideId: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
}
