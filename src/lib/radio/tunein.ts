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
} from './types';

// ============================================================================
// Constants
// ============================================================================

const TUNEIN_API_BASE = 'https://opml.radiotime.com';
const TUNEIN_SEARCH_URL = `${TUNEIN_API_BASE}/Search.ashx`;
const TUNEIN_TUNE_URL = `${TUNEIN_API_BASE}/Tune.ashx`;
const TUNEIN_BROWSE_URL = `${TUNEIN_API_BASE}/Browse.ashx`;

// Partner ID and version for API requests
const PARTNER_ID = 'RadioTime';
const API_VERSION = '7.10.2';

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
 */
function toRadioStation(result: TuneInSearchResult | TuneInStation): RadioStation {
  return {
    id: result.GuideId,
    name: result.Title,
    description: result.Subtitle,
    imageUrl: result.Image,
    genre: result.Genre,
    currentTrack: 'CurrentTrack' in result ? result.CurrentTrack : ('CurrentSong' in result ? result.CurrentSong : undefined),
    reliability: 'Reliability' in result ? result.Reliability : undefined,
    formats: 'Formats' in result && result.Formats ? result.Formats.split(',') : undefined,
  };
}

/**
 * Convert TuneIn stream to normalized RadioStream
 */
function toRadioStream(stream: {
  url: string;
  media_type: string;
  bitrate?: number;
  is_direct: boolean;
}): RadioStream {
  return {
    url: stream.url,
    mediaType: stream.media_type as RadioStream['mediaType'],
    bitrate: stream.bitrate,
    isDirect: stream.is_direct,
  };
}

/**
 * Select the best stream from available options
 * Prefers MP3 > AAC > OGG > HLS for broad compatibility
 */
function selectPreferredStream(streams: RadioStream[]): RadioStream | null {
  if (streams.length === 0) return null;

  // Sort by format preference and bitrate
  const sorted = [...streams].sort((a, b) => {
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
     * Search for radio stations
     */
    async search(params: RadioSearchParams): Promise<RadioStation[]> {
      const query = sanitizeQuery(params.query);
      if (!query) return [];

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

        // Use auth for search to get better results
        const response = await fetch(`${TUNEIN_SEARCH_URL}?${searchParams}`, {
          headers: buildHeaders(true),
        });

        if (!response.ok) {
          console.error('[TuneIn] Search failed:', response.status);
          return [];
        }

        const data = await response.json() as TuneInSearchResponse;

        if (data.head.status !== '200') {
          console.error('[TuneIn] Search error status:', data.head.status);
          return [];
        }

        // Filter to only stations and convert to our format
        const stations = data.body
          .filter((item) => item.Type === 'station' || item.Actions?.Play)
          .map(toRadioStation);

        // Apply limit if specified
        return params.limit ? stations.slice(0, params.limit) : stations;
      } catch (error) {
        console.error('[TuneIn] Search error:', error);
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
        const response = await fetch(`${TUNEIN_TUNE_URL}?${params}`, {
          headers: buildHeaders(true),
        });

        if (!response.ok) {
          console.error('[TuneIn] Tune failed:', response.status);
          return { streams: [], preferred: null };
        }

        const data = await response.json() as TuneInTuneResponse;

        if (data.head.status !== '200' || data.head.fault) {
          console.error('[TuneIn] Tune error:', data.head.fault);
          return { streams: [], preferred: null };
        }

        const streams = data.body.map(toRadioStream);
        const preferred = selectPreferredStream(streams);

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
          (item) => item.GuideId === stationId || item.Type === 'station'
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
          .filter((item) => item.Type === 'station' || item.Actions?.Play)
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
