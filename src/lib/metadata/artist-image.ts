/**
 * Fanart.tv Image Service
 *
 * Fetches images from Fanart.tv for:
 * - Music: Artist images and album covers (via MusicBrainz IDs)
 * - Movies: Posters and backgrounds (via TMDB IDs)
 * - TV Shows: Posters and backgrounds (via TVDB IDs)
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
 * Fanart.tv image
 */
interface FanartTvImage {
  id: string;
  url: string;
  likes: string;
}

/**
 * Fanart.tv album cover
 */
interface FanartTvAlbumCover {
  id: string;
  url: string;
  likes: string;
}

/**
 * Fanart.tv album entry
 */
interface FanartTvAlbum {
  albumcover?: FanartTvAlbumCover[];
  cdart?: FanartTvImage[];
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
  albums?: Record<string, FanartTvAlbum>;
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

/**
 * Parse Fanart.tv artist response to get album cover URL for a specific album
 * @param response - Fanart.tv API response
 * @param albumMbid - MusicBrainz release-group ID for the album
 * @returns Album cover URL or undefined if not found
 */
export function parseFanartTvAlbumCover(
  response: FanartTvArtistResponse,
  albumMbid: string
): string | undefined {
  if (!response.albums) {
    return undefined;
  }

  const album = response.albums[albumMbid];
  if (!album) {
    return undefined;
  }

  // Prefer album cover over CD art
  if (album.albumcover && album.albumcover.length > 0) {
    return album.albumcover[0].url;
  }

  return undefined;
}

/**
 * Get the first available album cover from any album in the response
 * Used when we don't have a specific album MBID
 * @param response - Fanart.tv API response
 * @returns Album cover URL or undefined if no albums have covers
 */
export function getFirstAlbumCover(
  response: FanartTvArtistResponse
): string | undefined {
  if (!response.albums) {
    return undefined;
  }

  // Iterate through all albums and return the first cover found
  for (const albumMbid of Object.keys(response.albums)) {
    const album = response.albums[albumMbid];
    if (album.albumcover && album.albumcover.length > 0) {
      return album.albumcover[0].url;
    }
  }

  return undefined;
}

// ============================================================================
// Main Functions
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

/**
 * Options for fetching album cover
 */
export interface FetchAlbumCoverOptions {
  fanartTvApiKey?: string;
  userAgent?: string;
  /** Artist MBID if already known (skips MusicBrainz artist search) */
  artistMbid?: string;
}

/**
 * Fetch album cover URL from MusicBrainz + Fanart.tv
 *
 * This function:
 * 1. Uses provided artistMbid OR searches MusicBrainz for the artist to get their MBID
 * 2. Uses the MBID to fetch album covers from Fanart.tv
 * 3. Returns the cover for the specific album if albumMbid is provided,
 *    otherwise returns the first available album cover
 *
 * @param artistName - Name of the artist (used for search if artistMbid not provided)
 * @param options - API keys, user agent, and optional artistMbid
 * @param albumMbid - Optional MusicBrainz release-group ID for specific album
 * @returns Album cover URL or undefined if not found
 */
export async function fetchAlbumCover(
  artistName: string,
  options: FetchAlbumCoverOptions,
  albumMbid?: string
): Promise<string | undefined> {
  const { fanartTvApiKey, userAgent = 'BitTorrented/1.0.0', artistMbid: providedArtistMbid } = options;

  // Fanart.tv API key is required
  if (!fanartTvApiKey) {
    return undefined;
  }

  try {
    let artistMbid = providedArtistMbid;

    // Step 1: Get artist MBID (use provided or search MusicBrainz)
    if (!artistMbid) {
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
      artistMbid = artistInfo.mbid;
    }

    // Step 2: Fetch artist data from Fanart.tv (includes albums)
    const fanartUrl = buildFanartTvArtistUrl(artistMbid, fanartTvApiKey);
    const fanartResponse = await fetch(fanartUrl);

    if (!fanartResponse.ok) {
      // 404 is common - artist not in Fanart.tv database
      return undefined;
    }

    const fanartData = await fanartResponse.json() as FanartTvArtistResponse;
    
    // Step 3: Get album cover
    if (albumMbid) {
      return parseFanartTvAlbumCover(fanartData, albumMbid);
    }
    
    // If no specific album, return first available cover
    return getFirstAlbumCover(fanartData);
  } catch {
    // Network errors, JSON parse errors, etc.
    return undefined;
  }
}

// ============================================================================
// Movie Types and Functions (Fanart.tv)
// ============================================================================

/**
 * Fanart.tv movie response
 */
export interface FanartTvMovieResponse {
  name: string;
  tmdb_id: string;
  imdb_id: string;
  movieposter?: FanartTvImage[];
  moviebackground?: FanartTvImage[];
  moviethumb?: FanartTvImage[];
  hdmovielogo?: FanartTvImage[];
  movielogo?: FanartTvImage[];
  moviedisc?: FanartTvImage[];
  moviebanner?: FanartTvImage[];
  movieart?: FanartTvImage[];
}

/**
 * Build Fanart.tv movie URL using TMDB ID
 * @param tmdbId - TMDB movie ID
 * @param apiKey - Fanart.tv API key
 * @returns Fanart.tv API URL
 */
export function buildFanartTvMovieUrl(tmdbId: string, apiKey: string): string {
  return `https://webservice.fanart.tv/v3/movies/${tmdbId}?api_key=${apiKey}`;
}

/**
 * Build Fanart.tv movie URL using IMDB ID
 * Fanart.tv supports both TMDB and IMDB IDs for movie lookups
 * @param imdbId - IMDB movie ID (e.g., tt1234567)
 * @param apiKey - Fanart.tv API key
 * @returns Fanart.tv API URL
 */
export function buildFanartTvMovieUrlByImdb(imdbId: string, apiKey: string): string {
  return `https://webservice.fanart.tv/v3/movies/${imdbId}?api_key=${apiKey}`;
}

/**
 * Parse Fanart.tv movie response to get the best poster URL
 * Priority: movieposter > moviethumb > moviebackground
 * @param response - Fanart.tv API response
 * @returns Poster URL or undefined if no images available
 */
export function parseFanartTvMovieResponse(
  response: FanartTvMovieResponse
): string | undefined {
  // Priority 1: Movie poster (best for display)
  if (response.movieposter && response.movieposter.length > 0) {
    return response.movieposter[0].url;
  }

  // Priority 2: Movie thumb
  if (response.moviethumb && response.moviethumb.length > 0) {
    return response.moviethumb[0].url;
  }

  // Priority 3: Movie background
  if (response.moviebackground && response.moviebackground.length > 0) {
    return response.moviebackground[0].url;
  }

  return undefined;
}

/**
 * Options for fetching movie poster
 */
export interface FetchMoviePosterOptions {
  fanartTvApiKey?: string;
}

/**
 * Fetch movie poster URL from Fanart.tv using TMDB ID
 *
 * @param tmdbId - TMDB movie ID
 * @param options - API keys
 * @returns Poster URL or undefined if not found
 */
export async function fetchMoviePoster(
  tmdbId: string,
  options: FetchMoviePosterOptions
): Promise<string | undefined> {
  const { fanartTvApiKey } = options;

  if (!fanartTvApiKey || !tmdbId) {
    return undefined;
  }

  try {
    const url = buildFanartTvMovieUrl(tmdbId, fanartTvApiKey);
    const response = await fetch(url);

    if (!response.ok) {
      return undefined;
    }

    const data = await response.json() as FanartTvMovieResponse;
    return parseFanartTvMovieResponse(data);
  } catch {
    return undefined;
  }
}

/**
 * Fetch movie poster URL from Fanart.tv using IMDB ID
 * This is the preferred method since OMDb returns IMDB IDs
 *
 * @param imdbId - IMDB movie ID (e.g., tt1234567)
 * @param options - API keys
 * @returns Poster URL or undefined if not found
 */
export async function fetchMoviePosterByImdb(
  imdbId: string,
  options: FetchMoviePosterOptions
): Promise<string | undefined> {
  const { fanartTvApiKey } = options;

  if (!fanartTvApiKey || !imdbId) {
    return undefined;
  }

  try {
    const url = buildFanartTvMovieUrlByImdb(imdbId, fanartTvApiKey);
    const response = await fetch(url);

    if (!response.ok) {
      return undefined;
    }

    const data = await response.json() as FanartTvMovieResponse;
    return parseFanartTvMovieResponse(data);
  } catch {
    return undefined;
  }
}

// ============================================================================
// TV Show Types and Functions (Fanart.tv)
// ============================================================================

/**
 * Fanart.tv TV show response
 */
export interface FanartTvTvShowResponse {
  name: string;
  thetvdb_id: string;
  tvposter?: FanartTvImage[];
  tvbanner?: FanartTvImage[];
  tvthumb?: FanartTvImage[];
  showbackground?: FanartTvImage[];
  hdtvlogo?: FanartTvImage[];
  clearlogo?: FanartTvImage[];
  characterart?: FanartTvImage[];
  seasonposter?: Array<FanartTvImage & { season: string }>;
  seasonthumb?: Array<FanartTvImage & { season: string }>;
  seasonbanner?: Array<FanartTvImage & { season: string }>;
}

/**
 * Build Fanart.tv TV show URL
 * @param tvdbId - TVDB show ID
 * @param apiKey - Fanart.tv API key
 * @returns Fanart.tv API URL
 */
export function buildFanartTvTvShowUrl(tvdbId: string, apiKey: string): string {
  return `https://webservice.fanart.tv/v3/tv/${tvdbId}?api_key=${apiKey}`;
}

/**
 * Parse Fanart.tv TV show response to get the best poster URL
 * Priority: tvposter > tvthumb > showbackground
 * @param response - Fanart.tv API response
 * @returns Poster URL or undefined if no images available
 */
export function parseFanartTvTvShowResponse(
  response: FanartTvTvShowResponse
): string | undefined {
  // Priority 1: TV poster (best for display)
  if (response.tvposter && response.tvposter.length > 0) {
    return response.tvposter[0].url;
  }

  // Priority 2: TV thumb
  if (response.tvthumb && response.tvthumb.length > 0) {
    return response.tvthumb[0].url;
  }

  // Priority 3: Show background
  if (response.showbackground && response.showbackground.length > 0) {
    return response.showbackground[0].url;
  }

  return undefined;
}

/**
 * Options for fetching TV show poster
 */
export interface FetchTvShowPosterOptions {
  fanartTvApiKey?: string;
}

/**
 * Fetch TV show poster URL from Fanart.tv using TVDB ID
 *
 * @param tvdbId - TVDB show ID
 * @param options - API keys
 * @returns Poster URL or undefined if not found
 */
export async function fetchTvShowPoster(
  tvdbId: string,
  options: FetchTvShowPosterOptions
): Promise<string | undefined> {
  const { fanartTvApiKey } = options;

  if (!fanartTvApiKey || !tvdbId) {
    return undefined;
  }

  try {
    const url = buildFanartTvTvShowUrl(tvdbId, fanartTvApiKey);
    const response = await fetch(url);

    if (!response.ok) {
      return undefined;
    }

    const data = await response.json() as FanartTvTvShowResponse;
    return parseFanartTvTvShowResponse(data);
  } catch {
    return undefined;
  }
}
