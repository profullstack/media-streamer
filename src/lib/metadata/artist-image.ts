/**
 * Artist Image Service
 * 
 * Fetches artist images from MusicBrainz and Fanart.tv
 * Used for discography collections to show artist photos/thumbnails
 */

// ============================================================================
// Types
// ============================================================================

/**
 * MusicBrainz artist search response
 */
export interface MusicBrainzArtistResponse {
  artists?: Array<{
    id: string;
    name: string;
    'sort-name': string;
    score: number;
    disambiguation?: string;
    country?: string;
    type?: string;
  }>;
}

/**
 * Fanart.tv artist image
 */
interface FanartTvImage {
  id: string;
  url: string;
  likes: string;
}

/**
 * Fanart.tv artist response
 */
export interface FanartTvArtistResponse {
  name: string;
  mbid_id: string;
  artistthumb?: FanartTvImage[];
  artistbackground?: FanartTvImage[];
  hdmusiclogo?: FanartTvImage[];
  musiclogo?: FanartTvImage[];
  musicbanner?: FanartTvImage[];
}

/**
 * Parsed artist info from MusicBrainz
 */
export interface ArtistInfo {
  mbid: string;
  name: string;
}

/**
 * Options for fetching artist image
 */
export interface FetchArtistImageOptions {
  fanartTvApiKey?: string;
  userAgent?: string;
}

// ============================================================================
// URL Builders
// ============================================================================

/**
 * Build MusicBrainz artist search URL
 * @param artistName - Artist name to search for
 * @returns MusicBrainz API URL
 */
export function buildMusicBrainzArtistSearchUrl(artistName: string): string {
  const baseUrl = 'https://musicbrainz.org/ws/2/artist';
  const encodedQuery = encodeURIComponent(artistName);
  return `${baseUrl}?query=${encodedQuery}&fmt=json&limit=1`;
}

/**
 * Build Fanart.tv artist URL
 * @param mbid - MusicBrainz artist ID
 * @param apiKey - Fanart.tv API key
 * @returns Fanart.tv API URL
 */
export function buildFanartTvArtistUrl(mbid: string, apiKey: string): string {
  return `https://webservice.fanart.tv/v3/music/${mbid}?api_key=${apiKey}`;
}

// ============================================================================
// Response Parsers
// ============================================================================

/**
 * Parse MusicBrainz artist search response
 * @param response - MusicBrainz API response
 * @returns Artist info or undefined if not found
 */
export function parseMusicBrainzArtistResponse(
  response: MusicBrainzArtistResponse
): ArtistInfo | undefined {
  if (!response.artists || response.artists.length === 0) {
    return undefined;
  }

  const artist = response.artists[0];
  return {
    mbid: artist.id,
    name: artist.name,
  };
}

/**
 * Parse Fanart.tv artist response to get the best image URL
 * Priority: artistthumb > artistbackground > hdmusiclogo
 * @param response - Fanart.tv API response
 * @returns Image URL or undefined if no images available
 */
export function parseFanartTvArtistResponse(
  response: FanartTvArtistResponse
): string | undefined {
  // Priority 1: Artist thumbnail (best for profile/avatar use)
  if (response.artistthumb && response.artistthumb.length > 0) {
    return response.artistthumb[0].url;
  }

  // Priority 2: Artist background (larger image, good for banners)
  if (response.artistbackground && response.artistbackground.length > 0) {
    return response.artistbackground[0].url;
  }

  // Priority 3: HD music logo (text/logo, less ideal but better than nothing)
  if (response.hdmusiclogo && response.hdmusiclogo.length > 0) {
    return response.hdmusiclogo[0].url;
  }

  return undefined;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Fetch artist image URL from MusicBrainz + Fanart.tv
 * 
 * This function:
 * 1. Searches MusicBrainz for the artist to get their MBID
 * 2. Uses the MBID to fetch artist images from Fanart.tv
 * 
 * @param artistName - Name of the artist to search for
 * @param options - API keys and user agent
 * @returns Artist image URL or undefined if not found
 */
export async function fetchArtistImage(
  artistName: string,
  options: FetchArtistImageOptions
): Promise<string | undefined> {
  const { fanartTvApiKey, userAgent = 'BitTorrented/1.0.0' } = options;

  // Fanart.tv API key is required
  if (!fanartTvApiKey) {
    return undefined;
  }

  try {
    // Step 1: Search MusicBrainz for the artist
    const mbUrl = buildMusicBrainzArtistSearchUrl(artistName);
    const mbResponse = await fetch(mbUrl, {
      headers: {
        'User-Agent': userAgent,
      },
    });

    if (!mbResponse.ok) {
      return undefined;
    }

    const mbData = await mbResponse.json() as MusicBrainzArtistResponse;
    const artistInfo = parseMusicBrainzArtistResponse(mbData);

    if (!artistInfo) {
      return undefined;
    }

    // Step 2: Fetch artist images from Fanart.tv
    const fanartUrl = buildFanartTvArtistUrl(artistInfo.mbid, fanartTvApiKey);
    const fanartResponse = await fetch(fanartUrl);

    if (!fanartResponse.ok) {
      // 404 is common - artist not in Fanart.tv database
      return undefined;
    }

    const fanartData = await fanartResponse.json() as FanartTvArtistResponse;
    return parseFanartTvArtistResponse(fanartData);
  } catch {
    // Network errors, JSON parse errors, etc.
    return undefined;
  }
}
