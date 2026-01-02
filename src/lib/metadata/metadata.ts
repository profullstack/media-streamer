/**
 * Metadata Service
 * 
 * Integration with external metadata APIs:
 * - MusicBrainz (music)
 * - Open Library (books)
 * - OMDb (movies)
 * - TheTVDB (TV shows)
 */

/**
 * Metadata types
 */
export type MetadataType = 'music' | 'book' | 'movie' | 'tvshow';

/**
 * Music metadata from MusicBrainz
 */
export interface MusicMetadata {
  id: string;
  title: string;
  artist?: string;
  /** MusicBrainz artist ID (for Fanart.tv lookups) */
  artistMbid?: string;
  album?: string;
  year?: number;
  duration?: number;
  source: 'musicbrainz';
}

/**
 * Book metadata from Open Library
 */
export interface BookMetadata {
  id: string;
  title: string;
  author?: string;
  year?: number;
  isbn?: string;
  coverUrl?: string;
  pages?: number;
  publisher?: string;
  source: 'openlibrary';
}

/**
 * Movie metadata from OMDb
 */
export interface MovieMetadata {
  id: string;
  title: string;
  year?: number;
  type: string;
  posterUrl?: string;
  /** Plot/description from OMDb detail API */
  description?: string;
  /** Director name(s) from OMDb detail API */
  director?: string;
  /** Actors/cast from OMDb detail API (comma-separated) */
  actors?: string;
  source: 'omdb';
}

/**
 * TV show metadata from TheTVDB
 */
export interface TVShowMetadata {
  id: string;
  title: string;
  year?: number;
  type?: string;
  imageUrl?: string;
  overview?: string;
  network?: string;
  source: 'thetvdb';
}

// ============================================================================
// MusicBrainz
// ============================================================================

export type MusicBrainzSearchType = 'recording' | 'artist' | 'release' | 'release-group';

/**
 * Build MusicBrainz API URL
 * @param type - Search type (recording, artist, release, release-group)
 * @param query - Search query
 * @param limit - Maximum results
 * @returns API URL
 */
export function buildMusicBrainzUrl(
  type: MusicBrainzSearchType,
  query: string,
  limit = 25
): string {
  const baseUrl = 'https://musicbrainz.org/ws/2';
  const encodedQuery = encodeURIComponent(query);
  return `${baseUrl}/${type}?query=${encodedQuery}&fmt=json&limit=${limit}`;
}

/**
 * Build Cover Art Archive URL for a release or release-group
 * @param mbid - MusicBrainz ID
 * @param type - 'release' or 'release-group'
 * @returns Cover Art Archive URL
 */
export function buildCoverArtArchiveUrl(mbid: string, type: 'release' | 'release-group' = 'release-group'): string {
  return `https://coverartarchive.org/${type}/${mbid}`;
}

/**
 * MusicBrainz recording response
 */
interface MusicBrainzRecording {
  id: string;
  title: string;
  'artist-credit'?: Array<{ name: string }>;
  releases?: Array<{ title: string; date?: string; id?: string }>;
  length?: number;
}

/**
 * MusicBrainz artist credit entry
 */
interface MusicBrainzArtistCredit {
  name: string;
  artist?: {
    id: string;
    name: string;
  };
}

/**
 * MusicBrainz release-group response
 */
interface MusicBrainzReleaseGroup {
  id: string;
  title: string;
  'artist-credit'?: MusicBrainzArtistCredit[];
  'first-release-date'?: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
}

/**
 * MusicBrainz API response
 */
interface MusicBrainzResponse {
  recordings?: MusicBrainzRecording[];
  artists?: Array<{ id: string; name: string }>;
  releases?: Array<{ id: string; title: string }>;
  'release-groups'?: MusicBrainzReleaseGroup[];
}

/**
 * Cover Art Archive response
 */
interface CoverArtArchiveResponse {
  images?: Array<{
    id: string;
    image: string;
    thumbnails?: {
      small?: string;
      large?: string;
      '250'?: string;
      '500'?: string;
      '1200'?: string;
    };
    front?: boolean;
    back?: boolean;
  }>;
  release?: string;
}

/**
 * Parse Cover Art Archive response to get the front cover URL
 * @param response - Cover Art Archive API response
 * @returns Cover URL or undefined
 */
export function parseCoverArtArchiveResponse(response: CoverArtArchiveResponse): string | undefined {
  if (!response.images || response.images.length === 0) {
    return undefined;
  }

  // Find the front cover image
  const frontCover = response.images.find(img => img.front === true);
  const image = frontCover ?? response.images[0];

  // Prefer 500px thumbnail, then large, then full image
  return image.thumbnails?.['500'] ??
         image.thumbnails?.large ??
         image.thumbnails?.['1200'] ??
         image.image;
}

/**
 * Parse MusicBrainz API response
 * @param response - API response
 * @param type - Search type
 * @returns Parsed music metadata
 */
export function parseMusicBrainzResponse(
  response: MusicBrainzResponse,
  type: MusicBrainzSearchType
): MusicMetadata[] {
  if (type === 'recording' && response.recordings) {
    return response.recordings.map((recording) => {
      const artist = recording['artist-credit']?.[0]?.name;
      const release = recording.releases?.[0];
      const year = release?.date ? parseInt(release.date.slice(0, 4), 10) : undefined;
      const duration = recording.length ? Math.floor(recording.length / 1000) : undefined;

      return {
        id: recording.id,
        title: recording.title,
        artist,
        album: release?.title,
        year: year && !isNaN(year) ? year : undefined,
        duration,
        source: 'musicbrainz' as const,
      };
    });
  }

  if (type === 'release-group' && response['release-groups']) {
    return response['release-groups'].map((rg) => {
      const artistCredit = rg['artist-credit']?.[0];
      const artist = artistCredit?.name;
      const artistMbid = artistCredit?.artist?.id;
      const year = rg['first-release-date'] ? parseInt(rg['first-release-date'].slice(0, 4), 10) : undefined;

      return {
        id: rg.id,
        title: rg.title,
        artist,
        artistMbid,
        album: rg.title, // For release-groups, the title IS the album
        year: year && !isNaN(year) ? year : undefined,
        source: 'musicbrainz' as const,
      };
    });
  }

  return [];
}

// ============================================================================
// Open Library
// ============================================================================

/**
 * Build Open Library API URL
 * @param query - Search query
 * @param limit - Maximum results
 * @returns API URL
 */
export function buildOpenLibraryUrl(query: string, limit = 25): string {
  const baseUrl = 'https://openlibrary.org/search.json';
  const encodedQuery = encodeURIComponent(query);
  return `${baseUrl}?q=${encodedQuery}&limit=${limit}`;
}

/**
 * Open Library book document
 */
interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  publisher?: string[];
}

/**
 * Open Library API response
 */
interface OpenLibraryResponse {
  docs: OpenLibraryDoc[];
}

/**
 * Parse Open Library API response
 * @param response - API response
 * @returns Parsed book metadata
 */
export function parseOpenLibraryResponse(response: OpenLibraryResponse): BookMetadata[] {
  return response.docs.map((doc) => {
    const coverUrl = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : undefined;

    return {
      id: doc.key,
      title: doc.title,
      author: doc.author_name?.join(', '),
      year: doc.first_publish_year,
      isbn: doc.isbn?.[0],
      coverUrl,
      pages: doc.number_of_pages_median,
      publisher: doc.publisher?.[0],
      source: 'openlibrary' as const,
    };
  });
}

// ============================================================================
// OMDb
// ============================================================================

type OMDbType = 'movie' | 'series' | 'episode';

/**
 * Build OMDb API URL
 * @param query - Search query
 * @param apiKey - OMDb API key
 * @param year - Optional year filter
 * @param type - Optional type filter
 * @returns API URL
 */
export function buildOMDbUrl(
  query: string,
  apiKey: string,
  year?: number,
  type?: OMDbType
): string {
  const baseUrl = 'https://www.omdbapi.com';
  const encodedQuery = encodeURIComponent(query);
  let url = `${baseUrl}/?s=${encodedQuery}&apikey=${apiKey}`;
  
  if (year) {
    url += `&y=${year}`;
  }
  
  if (type) {
    url += `&type=${type}`;
  }
  
  return url;
}

/**
 * OMDb search result
 */
interface OMDbSearchResult {
  imdbID: string;
  Title: string;
  Year: string;
  Type: string;
  Poster: string;
}

/**
 * OMDb API response
 */
interface OMDbResponse {
  Search?: OMDbSearchResult[];
  totalResults?: string;
  Response: string;
  Error?: string;
}

/**
 * Parse OMDb API response
 * @param response - API response
 * @returns Parsed movie metadata
 */
export function parseOMDbResponse(response: OMDbResponse): MovieMetadata[] {
  if (response.Response !== 'True' || !response.Search) {
    return [];
  }

  return response.Search.map((result) => ({
    id: result.imdbID,
    title: result.Title,
    year: parseInt(result.Year, 10) || undefined,
    type: result.Type,
    posterUrl: result.Poster !== 'N/A' ? result.Poster : undefined,
    source: 'omdb' as const,
  }));
}

/**
 * Build OMDb detail API URL (for fetching plot/description)
 * @param imdbId - IMDB ID (e.g., tt1234567)
 * @param apiKey - OMDb API key
 * @param plot - Plot length ('short' or 'full')
 * @returns API URL
 */
export function buildOMDbDetailUrl(
  imdbId: string,
  apiKey: string,
  plot: 'short' | 'full' = 'short'
): string {
  return `https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}&plot=${plot}`;
}

/**
 * OMDb detail response (single item lookup by IMDB ID)
 */
export interface OMDbDetailResponse {
  Response: string;
  Error?: string;
  imdbID?: string;
  Title?: string;
  Year?: string;
  Type?: string;
  Poster?: string;
  Plot?: string;
  Genre?: string;
  Director?: string;
  Actors?: string;
  Runtime?: string;
  imdbRating?: string;
}

/**
 * Parse OMDb detail response
 * @param response - OMDb detail API response
 * @returns Parsed movie metadata with description or undefined
 */
export function parseOMDbDetailResponse(response: OMDbDetailResponse): MovieMetadata | undefined {
  if (response.Response !== 'True' || !response.imdbID) {
    return undefined;
  }

  return {
    id: response.imdbID,
    title: response.Title ?? '',
    year: response.Year ? parseInt(response.Year, 10) : undefined,
    type: response.Type ?? 'movie',
    posterUrl: response.Poster && response.Poster !== 'N/A' ? response.Poster : undefined,
    description: response.Plot && response.Plot !== 'N/A' ? response.Plot : undefined,
    director: response.Director && response.Director !== 'N/A' ? response.Director : undefined,
    actors: response.Actors && response.Actors !== 'N/A' ? response.Actors : undefined,
    source: 'omdb' as const,
  };
}

/**
 * Fetch detailed movie/TV metadata from OMDb using IMDB ID
 * This returns the Plot (description) which is not available in search results
 * @param imdbId - IMDB ID (e.g., tt1234567)
 * @param apiKey - OMDb API key
 * @param plot - Plot length ('short' or 'full')
 * @returns Movie metadata with description or undefined
 */
export async function fetchOMDbDetailByImdbId(
  imdbId: string,
  apiKey: string,
  plot: 'short' | 'full' = 'short'
): Promise<MovieMetadata | undefined> {
  try {
    const url = buildOMDbDetailUrl(imdbId, apiKey, plot);
    const response = await fetch(url);
    
    if (!response.ok) {
      return undefined;
    }

    const data = await response.json() as OMDbDetailResponse;
    return parseOMDbDetailResponse(data);
  } catch {
    return undefined;
  }
}

// ============================================================================
// TheTVDB
// ============================================================================

type TheTVDBType = 'series' | 'movie' | 'person' | 'company';

/**
 * Build TheTVDB API URL
 * @param query - Search query
 * @param type - Optional type filter
 * @param limit - Maximum results
 * @returns API URL
 */
export function buildTheTVDBUrl(
  query: string,
  type?: TheTVDBType,
  limit = 25
): string {
  const baseUrl = 'https://api4.thetvdb.com/v4/search';
  const encodedQuery = encodeURIComponent(query);
  let url = `${baseUrl}?query=${encodedQuery}&limit=${limit}`;
  
  if (type) {
    url += `&type=${type}`;
  }
  
  return url;
}

/**
 * TheTVDB search result
 */
interface TheTVDBSearchResult {
  id: string;
  name: string;
  year?: string;
  type?: string;
  image_url?: string;
  overview?: string;
  network?: string;
}

/**
 * TheTVDB API response
 */
interface TheTVDBResponse {
  status: string;
  data: TheTVDBSearchResult[];
}

/**
 * Parse TheTVDB API response
 * @param response - API response
 * @returns Parsed TV show metadata
 */
export function parseTheTVDBResponse(response: TheTVDBResponse): TVShowMetadata[] {
  if (response.status !== 'success' || !response.data) {
    return [];
  }

  return response.data.map((result) => ({
    id: result.id,
    title: result.name,
    year: result.year ? parseInt(result.year, 10) : undefined,
    type: result.type,
    imageUrl: result.image_url,
    overview: result.overview,
    network: result.network,
    source: 'thetvdb' as const,
  }));
}

// ============================================================================
// TMDB (The Movie Database)
// ============================================================================

/**
 * TMDB movie search result
 */
interface TMDBMovieResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string;
  overview?: string;
}

/**
 * TMDB search response
 */
interface TMDBSearchResponse {
  results: TMDBMovieResult[];
  total_results: number;
}

/**
 * TMDB find by external ID response
 */
interface TMDBFindResponse {
  movie_results: TMDBMovieResult[];
  tv_results: Array<{
    id: number;
    name: string;
    first_air_date?: string;
    poster_path?: string;
    overview?: string;
  }>;
}

/**
 * Build TMDB search URL
 * @param query - Search query
 * @param apiKey - TMDB API key
 * @param year - Optional year filter
 * @returns API URL
 */
export function buildTMDBSearchUrl(query: string, apiKey: string, year?: number): string {
  const baseUrl = 'https://api.themoviedb.org/3/search/movie';
  const encodedQuery = encodeURIComponent(query);
  let url = `${baseUrl}?api_key=${apiKey}&query=${encodedQuery}`;
  
  if (year) {
    url += `&year=${year}`;
  }
  
  return url;
}

/**
 * Build TMDB find by IMDB ID URL
 * @param imdbId - IMDB ID (e.g., tt1234567)
 * @param apiKey - TMDB API key
 * @returns API URL
 */
export function buildTMDBFindUrl(imdbId: string, apiKey: string): string {
  return `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
}

/**
 * Build TMDB poster URL
 * @param posterPath - Poster path from TMDB (e.g., /abc123.jpg)
 * @param size - Poster size (w92, w154, w185, w342, w500, w780, original)
 * @returns Full poster URL
 */
export function buildTMDBPosterUrl(posterPath: string, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500'): string {
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}

/**
 * Movie metadata from TMDB
 */
export interface TMDBMovieMetadata {
  id: number;
  title: string;
  year?: number;
  posterUrl?: string;
  overview?: string;
  source: 'tmdb';
}

/**
 * Parse TMDB search response
 * @param response - TMDB API response
 * @returns Parsed movie metadata
 */
export function parseTMDBSearchResponse(response: TMDBSearchResponse): TMDBMovieMetadata[] {
  return response.results.map((result) => {
    const year = result.release_date ? parseInt(result.release_date.slice(0, 4), 10) : undefined;
    const posterUrl = result.poster_path ? buildTMDBPosterUrl(result.poster_path) : undefined;

    return {
      id: result.id,
      title: result.title,
      year: year && !isNaN(year) ? year : undefined,
      posterUrl,
      overview: result.overview,
      source: 'tmdb' as const,
    };
  });
}

/**
 * Parse TMDB find response (for IMDB ID lookup)
 * @param response - TMDB find API response
 * @returns Parsed movie metadata or undefined
 */
export function parseTMDBFindResponse(response: TMDBFindResponse): TMDBMovieMetadata | undefined {
  if (response.movie_results.length === 0) {
    return undefined;
  }

  const result = response.movie_results[0];
  const year = result.release_date ? parseInt(result.release_date.slice(0, 4), 10) : undefined;
  const posterUrl = result.poster_path ? buildTMDBPosterUrl(result.poster_path) : undefined;

  return {
    id: result.id,
    title: result.title,
    year: year && !isNaN(year) ? year : undefined,
    posterUrl,
    overview: result.overview,
    source: 'tmdb' as const,
  };
}

/**
 * Fetch movie poster from TMDB using IMDB ID
 * @param imdbId - IMDB ID (e.g., tt1234567)
 * @param apiKey - TMDB API key
 * @returns Poster URL or undefined
 */
export async function fetchTMDBPosterByImdbId(imdbId: string, apiKey: string): Promise<string | undefined> {
  try {
    const url = buildTMDBFindUrl(imdbId, apiKey);
    const response = await fetch(url);
    
    if (!response.ok) {
      return undefined;
    }

    const data = await response.json() as TMDBFindResponse;
    const movie = parseTMDBFindResponse(data);
    
    return movie?.posterUrl;
  } catch {
    return undefined;
  }
}
