/**
 * TuneIn API Service
 *
 * Node.js implementation of TuneIn radio API integration.
 * Supports authenticated requests for premium stream access.
 */

import type {
  TuneInStation,
  TuneInTuneResponse,
  TuneInSearchResponse,
  TuneInSearchResult,
  RadioStation,
  RadioStream,
  RadioSearchParams,
  TuneInPremiumSearchResponse,
  TuneInPremiumCell,
  TuneInPodcastContentsResponse,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const TUNEIN_API_BASE = 'https://opml.radiotime.com';
const TUNEIN_SEARCH_URL = `${TUNEIN_API_BASE}/Search.ashx`;
const TUNEIN_TUNE_URL = `${TUNEIN_API_BASE}/Tune.ashx`;
const TUNEIN_BROWSE_URL = `${TUNEIN_API_BASE}/Browse.ashx`;

// Premium API endpoints (requires auth token)
const TUNEIN_PREMIUM_API_BASE = 'https://api.radiotime.com';
const TUNEIN_PREMIUM_SEARCH_URL = `${TUNEIN_PREMIUM_API_BASE}/profiles`;

// Partner ID and version for API requests
const PARTNER_ID = 'RadioTime';
const PREMIUM_PARTNER_ID = 'M2t9wS30';
const API_VERSION = '7.10.2';
const PREMIUM_API_VERSION = '40.7.1';

// Supported audio formats in order of preference
const PREFERRED_FORMATS = ['mp3', 'aac', 'ogg', 'hls', 'html', 'flash'] as const;
const DEFAULT_FORMATS = 'mp3,aac,ogg,flash,html,hls';

// User agent for requests
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get TuneIn auth token from environment
 * This enables premium stream access
 * Set TUNEIN_TOKEN in .env
 */
function getTuneInAuthToken(): string | null {
  return process.env.TUNEIN_TOKEN ?? null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize search query to prevent XSS and injection
 */
function sanitizeQuery(query: string): string {
  return query
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, '')
    .trim()
    .slice(0, 200);
}

/**
 * Convert TuneIn search result to normalized RadioStation
 * Handles both search API format (snake_case) and browse API format (PascalCase)
 */
function toRadioStation(result: TuneInSearchResult | TuneInStation): RadioStation {
  // Search API uses snake_case, browse API uses PascalCase
  const isSearchResult = 'guide_id' in result;

  if (isSearchResult) {
    const r = result as TuneInSearchResult;
    return {
      id: r.guide_id,
      name: r.text,
      description: r.subtext,
      imageUrl: r.image,
      genre: r.genre_id,
      currentTrack: undefined,
      reliability: r.reliability,
      formats: r.formats ? r.formats.split(',') : undefined,
    };
  } else {
    const r = result as TuneInStation;
    return {
      id: r.GuideId,
      name: r.Title,
      description: r.Subtitle,
      imageUrl: r.Image,
      genre: r.Genre,
      currentTrack: r.CurrentSong,
      reliability: undefined,
      formats: undefined,
    };
  }
}

/**
 * Raw stream data from TuneIn API
 */
interface TuneInStreamData {
  url: string;
  media_type: string;
  bitrate?: number;
  is_direct: boolean;
  is_boost_station?: string; // "true" or "false" - promotional content from different station
}

/**
 * Extended RadioStream with boost station flag
 */
interface ExtendedRadioStream extends RadioStream {
  isBoostStation?: boolean;
}

/**
 * Convert TuneIn stream to normalized RadioStream
 */
function toRadioStream(stream: TuneInStreamData): ExtendedRadioStream {
  return {
    url: stream.url,
    mediaType: stream.media_type as RadioStream['mediaType'],
    bitrate: stream.bitrate,
    isDirect: stream.is_direct,
    isBoostStation: stream.is_boost_station === 'true',
  };
}

/**
 * Extract Cell from premium search result item
 * Cell keys end with 'Cell' (e.g., 'StationCell', 'ShowCell')
 */
function extractCellFromItem(item: Record<string, unknown>): TuneInPremiumCell | null {
  for (const [key, value] of Object.entries(item)) {
    if (key.endsWith('Cell') && value && typeof value === 'object') {
      return value as TuneInPremiumCell;
    }
  }
  return null;
}

/**
 * Convert premium search result cell to RadioStation
 */
function premiumCellToRadioStation(cell: TuneInPremiumCell): RadioStation | null {
  const id = cell.GuideId;
  const seoInfo = cell.SEOInfo;

  if (!id || !seoInfo) {
    return null;
  }

  return {
    id,
    name: seoInfo.Title,
    description: seoInfo.Description,
    imageUrl: cell.Image as string | undefined,
    genre: undefined,
    currentTrack: undefined,
    reliability: undefined,
    formats: undefined,
  };
}

/**
 * Get the first episode/content ID for a podcast or show
 * Used to resolve playable content from non-station items
 */
async function _getPodcastContentId(profileId: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const response = await fetch(`${TUNEIN_PREMIUM_API_BASE}/profiles/${profileId}/contents`, {
      headers,
    });

    if (!response.ok) {
      console.log('[TuneIn] Failed to get podcast contents:', response.status);
      return null;
    }

    const data = await response.json() as TuneInPodcastContentsResponse;

    // Find the first episode with a GuideId
    for (const item of data.Items || []) {
      const children = item.Children;
      if (children && children.length > 0) {
        return children[0].GuideId;
      }
    }

    return null;
  } catch (error) {
    console.error('[TuneIn] Get podcast content ID error:', error);
    return null;
  }
}

/**
 * Select the best stream from available options
 * Prefers MP3 > AAC > OGG > HLS for broad compatibility
 * Filters out "boost stations" (promotional content from different stations)
 */
function selectPreferredStream(streams: ExtendedRadioStream[]): RadioStream | null {
  if (streams.length === 0) return null;

  // Filter out boost stations (promotional content from different stations)
  // Only if there are non-boost alternatives available
  const nonBoostStreams = streams.filter(s => !s.isBoostStation);
  const streamsToSort = nonBoostStreams.length > 0 ? nonBoostStreams : streams;

  if (nonBoostStreams.length !== streams.length) {
    console.log('[TuneIn] Filtered out', streams.length - nonBoostStreams.length, 'boost station(s)');
  }

  // Sort by format preference and bitrate
  const sorted = [...streamsToSort].sort((a, b) => {
    const aIndex = PREFERRED_FORMATS.indexOf(a.mediaType as typeof PREFERRED_FORMATS[number]);
    const bIndex = PREFERRED_FORMATS.indexOf(b.mediaType as typeof PREFERRED_FORMATS[number]);

    // If same format, prefer higher bitrate
    if (aIndex === bIndex) {
      return (b.bitrate || 0) - (a.bitrate || 0);
    }

    // Prefer lower index (better format)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return sorted[0];
}

/**
 * Build request headers, optionally including auth token for premium access
 */
function buildHeaders(includeAuth: boolean = false): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
  };

  if (includeAuth) {
    const token = getTuneInAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

// ============================================================================
// TuneIn Service
// ============================================================================

export interface TuneInService {
  search(params: RadioSearchParams): Promise<RadioStation[]>;
  searchPremium(query: string, params: RadioSearchParams): Promise<RadioStation[]>;
  searchStandard(query: string, params: RadioSearchParams): Promise<RadioStation[]>;
  getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }>;
  getStationInfo(stationId: string): Promise<RadioStation | null>;
  getPopularStations(genre?: string): Promise<RadioStation[]>;
  hasAuthToken(): boolean;
}

/**
 * Create a TuneIn service instance
 */
export function createTuneInService(): TuneInService {
  return {
    /**
     * Check if auth token is configured
     */
    hasAuthToken(): boolean {
      return getTuneInAuthToken() !== null;
    },

    /**
     * Search for radio stations using premium API
     * Falls back to standard API if premium fails or no auth token
     */
    async search(params: RadioSearchParams): Promise<RadioStation[]> {
      const query = sanitizeQuery(params.query);
      console.log('[TuneIn] Search called with query:', params.query, '-> sanitized:', query);
      if (!query) {
        console.log('[TuneIn] Empty query after sanitization');
        return [];
      }

      const hasToken = getTuneInAuthToken() !== null;
      console.log('[TuneIn] Using auth token:', hasToken);

      // Try premium API first if we have an auth token
      if (hasToken) {
        const premiumResults = await this.searchPremium(query, params);
        if (premiumResults.length > 0) {
          console.log('[TuneIn] Premium search returned', premiumResults.length, 'results');
          return params.limit ? premiumResults.slice(0, params.limit) : premiumResults;
        }
        console.log('[TuneIn] Premium search returned no results, falling back to standard API');
      }

      // Fall back to standard API
      return this.searchStandard(query, params);
    },

    /**
     * Search using premium API (api.radiotime.com/profiles)
     * Returns more live streams with premium auth
     */
    async searchPremium(query: string, _params: RadioSearchParams): Promise<RadioStation[]> {
      try {
        const searchParams = new URLSearchParams({
          audioport: 'Speaker',
          con: 'wifi',
          device: 'phone',
          fulltextsearch: 'true',
          itemUrlScheme: 'secure',
          listenId: Date.now().toString(),
          locale: 'en',
          orientation: 'portrait',
          origin: 'active',
          partnerId: PREMIUM_PARTNER_ID,
          query,
          render: 'json',
          resolution: '440,956',
          serial: crypto.randomUUID(),
          version: PREMIUM_API_VERSION,
          viewModel: 'true',
        });

        console.log('[TuneIn] Premium search URL:', `${TUNEIN_PREMIUM_SEARCH_URL}?${searchParams}`);

        const headers = buildHeaders(true);
        const response = await fetch(`${TUNEIN_PREMIUM_SEARCH_URL}?${searchParams}`, {
          headers,
        });

        console.log('[TuneIn] Premium search response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[TuneIn] Premium search failed:', response.status, errorText);
          return [];
        }

        const data = await response.json() as TuneInPremiumSearchResponse;
        console.log('[TuneIn] Premium search items count:', data.Items?.length || 0);

        const stations: RadioStation[] = [];

        for (const item of data.Items || []) {
          const list = item.List || item.Gallery;
          if (!list || !list.Items) {
            continue;
          }

          for (const listItem of list.Items) {
            const cell = extractCellFromItem(listItem as Record<string, unknown>);
            if (!cell || !cell.GuideId) {
              continue;
            }

            const seoInfo = cell.SEOInfo;
            if (!seoInfo) {
              console.log('[TuneIn] No SEO info for item, skipping');
              continue;
            }

            const contentInfo = cell.ContentInfo;

            // Skip audiobooks
            if (contentInfo?.Type === 'Audiobook') {
              continue;
            }

            // For non-Station types (podcasts/shows), we still include them
            // but they'll need stream resolution at play time
            const station = premiumCellToRadioStation(cell);
            if (station) {
              // Add content type info to help with stream resolution
              if (contentInfo?.Type && contentInfo.Type !== 'Station') {
                (station as RadioStation & { contentType?: string }).contentType = contentInfo.Type;
              }
              stations.push(station);
            }
          }
        }

        console.log('[TuneIn] Premium search extracted', stations.length, 'stations');
        return stations;
      } catch (error) {
        console.error('[TuneIn] Premium search error:', error);
        return [];
      }
    },

    /**
     * Search using standard API (opml.radiotime.com/Search.ashx)
     */
    async searchStandard(query: string, params: RadioSearchParams): Promise<RadioStation[]> {
      try {
        const searchParams = new URLSearchParams({
          query,
          partnerId: PARTNER_ID,
          version: API_VERSION,
          formats: DEFAULT_FORMATS,
          render: 'json',
        });

        // Add filter if provided (s = stations, t = topics, p = programs)
        if (params.filter) {
          searchParams.set('filter', params.filter);
        }

        console.log('[TuneIn] Standard search URL:', `${TUNEIN_SEARCH_URL}?${searchParams}`);

        // Use auth for search to get better results
        const response = await fetch(`${TUNEIN_SEARCH_URL}?${searchParams}`, {
          headers: buildHeaders(true),
        });

        console.log('[TuneIn] Standard search response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[TuneIn] Standard search failed:', response.status, errorText);
          return [];
        }

        const data = await response.json() as TuneInSearchResponse;
        console.log('[TuneIn] Standard search response head:', data.head);
        console.log('[TuneIn] Standard search response body length:', data.body?.length || 0);

        if (data.head.status !== '200') {
          console.error('[TuneIn] Standard search error status:', data.head.status, data.head);
          return [];
        }

        // Filter to only playable stations (type=audio with item=station, or has URL)
        const stations = data.body
          .filter((item) => item.type === 'audio' && (item.item === 'station' || item.URL))
          .map(toRadioStation);

        console.log('[TuneIn] Standard search filtered to', stations.length, 'stations');

        // Apply limit if specified
        return params.limit ? stations.slice(0, params.limit) : stations;
      } catch (error) {
        console.error('[TuneIn] Standard search error:', error);
        return [];
      }
    },

    /**
     * Get streaming URLs for a station
     * Uses auth token for premium stream access
     */
    async getStream(stationId: string): Promise<{ streams: RadioStream[]; preferred: RadioStream | null }> {
      try {
        const params = new URLSearchParams({
          id: stationId,
          itemUrlScheme: 'secure',
          partnerId: PARTNER_ID,
          version: API_VERSION,
          formats: DEFAULT_FORMATS,
          render: 'json',
        });

        // IMPORTANT: Use auth token for premium stream access
        const tuneUrl = `${TUNEIN_TUNE_URL}?${params}`;
        console.log('[TuneIn] Tune URL:', tuneUrl);
        const response = await fetch(tuneUrl, {
          headers: buildHeaders(true),
        });

        if (!response.ok) {
          console.error('[TuneIn] Tune failed:', response.status);
          return { streams: [], preferred: null };
        }

        const data = await response.json() as TuneInTuneResponse;

        console.log('[TuneIn] Tune request for:', stationId);
        console.log('[TuneIn] Tune response head:', data.head);
        console.log('[TuneIn] Tune response body:', JSON.stringify(data.body?.slice(0, 3), null, 2));

        if (data.head.status !== '200' || data.head.fault) {
          console.error('[TuneIn] Tune error:', data.head.fault);
          return { streams: [], preferred: null };
        }

        const streams = data.body.map(toRadioStream) as ExtendedRadioStream[];
        const preferred = selectPreferredStream(streams);

        console.log('[TuneIn] Parsed streams:', streams.length, 'preferred:', preferred?.url);

        return { streams, preferred };
      } catch (error) {
        console.error('[TuneIn] Get stream error:', error);
        return { streams: [], preferred: null };
      }
    },

    /**
     * Get detailed station info
     */
    async getStationInfo(stationId: string): Promise<RadioStation | null> {
      try {
        const params = new URLSearchParams({
          id: stationId,
          partnerId: PARTNER_ID,
          version: API_VERSION,
          render: 'json',
        });

        const response = await fetch(`${TUNEIN_BROWSE_URL}?${params}`, {
          headers: buildHeaders(true),
        });

        if (!response.ok) {
          console.error('[TuneIn] Browse failed:', response.status);
          return null;
        }

        const data = await response.json() as { head: { status: string }; body: TuneInSearchResult[] };

        if (data.head.status !== '200' || !data.body || data.body.length === 0) {
          return null;
        }

        // Find the station in the response
        const station = data.body.find(
          (item) => item.guide_id === stationId || item.item === 'station'
        );

        return station ? toRadioStation(station) : null;
      } catch (error) {
        console.error('[TuneIn] Get station info error:', error);
        return null;
      }
    },

    /**
     * Get popular stations, optionally filtered by genre
     */
    async getPopularStations(genre?: string): Promise<RadioStation[]> {
      try {
        const params = new URLSearchParams({
          c: genre || 'local', // Default to local popular stations
          partnerId: PARTNER_ID,
          version: API_VERSION,
          formats: DEFAULT_FORMATS,
          render: 'json',
        });

        const response = await fetch(`${TUNEIN_BROWSE_URL}?${params}`, {
          headers: buildHeaders(true),
        });

        if (!response.ok) {
          console.error('[TuneIn] Browse popular failed:', response.status);
          return [];
        }

        const data = await response.json() as { head: { status: string }; body: TuneInSearchResult[] };

        if (data.head.status !== '200') {
          return [];
        }

        return data.body
          .filter((item) => item.type === 'audio' && (item.item === 'station' || item.URL))
          .map(toRadioStation);
      } catch (error) {
        console.error('[TuneIn] Get popular stations error:', error);
        return [];
      }
    },
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let serviceInstance: TuneInService | null = null;

/**
 * Get the singleton TuneIn service instance
 */
export function getTuneInService(): TuneInService {
  if (!serviceInstance) {
    serviceInstance = createTuneInService();
  }
  return serviceInstance;
}
