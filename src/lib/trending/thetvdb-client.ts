/**
 * TheTVDB Client
 *
 * Integration with TheTVDB API v4 for trending/popular TV shows and movies.
 * TheTVDB requires OAuth authentication - we get a token using the API key.
 *
 * API Documentation: https://thetvdb.github.io/v4-api/
 */

// ============================================================================
// Types
// ============================================================================

/**
 * TheTVDB media type
 */
export type TheTVDBMediaType = 'tv' | 'movie';

/**
 * TheTVDB trending item
 */
export interface TheTVDBTrendingItem {
  id: number;
  title: string;
  year?: number;
  posterUrl?: string;
  overview?: string;
  mediaType: TheTVDBMediaType;
  status?: string;
  network?: string;
  runtime?: number;
  genres: string[];
  cast?: string[];
  directors?: string[];
  rating?: number;
}

/**
 * TheTVDB trending result
 */
export interface TheTVDBTrendingResult {
  items: TheTVDBTrendingItem[];
  page: number;
  totalPages: number;
  totalResults: number;
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

interface TheTVDBGenre {
  name: string;
}

interface TheTVDBStatus {
  name: string;
}

interface TheTVDBNetwork {
  name: string;
}

interface TheTVDBCharacter {
  name?: string;
  personName?: string;
  type: number; // 1 = Director, 3 = Actor
}

interface TheTVDBSeriesItem {
  id: number;
  name: string;
  year?: string;
  image?: string;
  overview?: string;
  status?: TheTVDBStatus;
  originalNetwork?: TheTVDBNetwork;
  averageRuntime?: number;
  genres?: TheTVDBGenre[];
  score?: number;
}

interface TheTVDBMovieItem {
  id: number;
  name: string;
  year?: string;
  image?: string;
  overview?: string;
  runtime?: number;
  genres?: TheTVDBGenre[];
  score?: number;
}

interface TheTVDBSeriesExtended extends TheTVDBSeriesItem {
  characters?: TheTVDBCharacter[];
}

interface TheTVDBMovieExtended extends TheTVDBMovieItem {
  characters?: TheTVDBCharacter[];
}

interface TheTVDBAuthResponse {
  status: string;
  data?: {
    token: string;
  };
}

interface TheTVDBSeriesResponse {
  status: string;
  data: TheTVDBSeriesItem[];
}

interface TheTVDBMoviesResponse {
  status: string;
  data: TheTVDBMovieItem[];
}

interface TheTVDBSeriesExtendedResponse {
  status: string;
  data: TheTVDBSeriesExtended | null;
}

interface TheTVDBMovieExtendedResponse {
  status: string;
  data: TheTVDBMovieExtended | null;
}

// ============================================================================
// URL Builders
// ============================================================================

const THETVDB_BASE_URL = 'https://api4.thetvdb.com/v4';
const THETVDB_IMAGE_BASE_URL = 'https://artworks.thetvdb.com';

/**
 * Build TheTVDB authentication URL
 */
export function buildTheTVDBAuthUrl(): string {
  return `${THETVDB_BASE_URL}/login`;
}

/**
 * Build TheTVDB series list URL
 * @param page - Page number (0-indexed)
 */
export function buildTheTVDBSeriesUrl(page = 0): string {
  return `${THETVDB_BASE_URL}/series?page=${page}`;
}

/**
 * Build TheTVDB movies list URL
 * @param page - Page number (0-indexed)
 */
export function buildTheTVDBMoviesUrl(page = 0): string {
  return `${THETVDB_BASE_URL}/movies?page=${page}`;
}

/**
 * Build TheTVDB series extended URL (includes cast/crew)
 * @param id - Series ID
 */
export function buildTheTVDBSeriesExtendedUrl(id: number): string {
  return `${THETVDB_BASE_URL}/series/${id}/extended`;
}

/**
 * Build TheTVDB movie extended URL (includes cast/crew)
 * @param id - Movie ID
 */
export function buildTheTVDBMovieExtendedUrl(id: number): string {
  return `${THETVDB_BASE_URL}/movies/${id}/extended`;
}

/**
 * Build full image URL from TheTVDB image path
 * @param imagePath - Image path (can be relative or absolute)
 */
export function buildTheTVDBImageUrl(imagePath: string | undefined): string | undefined {
  if (!imagePath) {
    return undefined;
  }

  // If already a full URL, return as-is
  if (imagePath.startsWith('http')) {
    return imagePath;
  }

  // Build full URL from relative path
  return `${THETVDB_IMAGE_BASE_URL}${imagePath}`;
}

// ============================================================================
// Response Parsers
// ============================================================================

/**
 * Parse TheTVDB series response
 */
export function parseTheTVDBSeriesResponse(response: TheTVDBSeriesResponse): TheTVDBTrendingResult {
  if (response.status !== 'success' || !response.data) {
    return {
      items: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    };
  }

  const items: TheTVDBTrendingItem[] = response.data.map((series) => ({
    id: series.id,
    title: series.name,
    year: series.year ? parseInt(series.year, 10) : undefined,
    posterUrl: buildTheTVDBImageUrl(series.image),
    overview: series.overview,
    mediaType: 'tv' as const,
    status: series.status?.name,
    network: series.originalNetwork?.name,
    runtime: series.averageRuntime,
    genres: series.genres?.map((g) => g.name) ?? [],
    rating: series.score,
  }));

  return {
    items,
    page: 1,
    totalPages: 1,
    totalResults: items.length,
  };
}

/**
 * Parse TheTVDB movies response
 */
export function parseTheTVDBMoviesResponse(response: TheTVDBMoviesResponse): TheTVDBTrendingResult {
  if (response.status !== 'success' || !response.data) {
    return {
      items: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    };
  }

  const items: TheTVDBTrendingItem[] = response.data.map((movie) => ({
    id: movie.id,
    title: movie.name,
    year: movie.year ? parseInt(movie.year, 10) : undefined,
    posterUrl: buildTheTVDBImageUrl(movie.image),
    overview: movie.overview,
    mediaType: 'movie' as const,
    runtime: movie.runtime,
    genres: movie.genres?.map((g) => g.name) ?? [],
    rating: movie.score,
  }));

  return {
    items,
    page: 1,
    totalPages: 1,
    totalResults: items.length,
  };
}

/**
 * Parse TheTVDB series extended response (with cast/crew)
 */
export function parseTheTVDBSeriesExtendedResponse(
  response: TheTVDBSeriesExtendedResponse
): TheTVDBTrendingItem | undefined {
  if (response.status !== 'success' || !response.data) {
    return undefined;
  }

  const series = response.data;
  const characters = series.characters ?? [];

  // Type 3 = Actor, Type 1 = Director
  const cast = characters
    .filter((c) => c.type === 3 && c.personName)
    .map((c) => c.personName!)
    .slice(0, 10);

  const directors = characters
    .filter((c) => c.type === 1 && c.personName)
    .map((c) => c.personName!)
    .slice(0, 5);

  return {
    id: series.id,
    title: series.name,
    year: series.year ? parseInt(series.year, 10) : undefined,
    posterUrl: buildTheTVDBImageUrl(series.image),
    overview: series.overview,
    mediaType: 'tv',
    status: series.status?.name,
    network: series.originalNetwork?.name,
    runtime: series.averageRuntime,
    genres: series.genres?.map((g) => g.name) ?? [],
    cast,
    directors,
    rating: series.score,
  };
}

/**
 * Parse TheTVDB movie extended response (with cast/crew)
 */
export function parseTheTVDBMovieExtendedResponse(
  response: TheTVDBMovieExtendedResponse
): TheTVDBTrendingItem | undefined {
  if (response.status !== 'success' || !response.data) {
    return undefined;
  }

  const movie = response.data;
  const characters = movie.characters ?? [];

  // Type 3 = Actor, Type 1 = Director
  const cast = characters
    .filter((c) => c.type === 3 && c.personName)
    .map((c) => c.personName!)
    .slice(0, 10);

  const directors = characters
    .filter((c) => c.type === 1 && c.personName)
    .map((c) => c.personName!)
    .slice(0, 5);

  return {
    id: movie.id,
    title: movie.name,
    year: movie.year ? parseInt(movie.year, 10) : undefined,
    posterUrl: buildTheTVDBImageUrl(movie.image),
    overview: movie.overview,
    mediaType: 'movie',
    runtime: movie.runtime,
    genres: movie.genres?.map((g) => g.name) ?? [],
    cast,
    directors,
    rating: movie.score,
  };
}

// ============================================================================
// API Functions
// ============================================================================

// Token cache to avoid re-authenticating on every request
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours (tokens last 24h)

/**
 * Fetch TheTVDB authentication token
 * @param apiKey - TheTVDB API key
 */
export async function fetchTheTVDBToken(apiKey: string): Promise<string> {
  // Check cache first
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const url = buildTheTVDBAuthUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apikey: apiKey }),
  });

  if (!response.ok) {
    throw new Error(`TheTVDB authentication failed: ${response.status}`);
  }

  const data = (await response.json()) as TheTVDBAuthResponse;

  if (data.status !== 'success' || !data.data?.token) {
    throw new Error('TheTVDB authentication failed: invalid response');
  }

  // Cache the token
  cachedToken = data.data.token;
  tokenExpiry = Date.now() + TOKEN_TTL_MS;

  return data.data.token;
}

/**
 * Make authenticated request to TheTVDB API
 */
async function makeAuthenticatedRequest<T>(
  apiKey: string,
  url: string
): Promise<T> {
  const token = await fetchTheTVDBToken(apiKey);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TheTVDB API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch trending TV shows from TheTVDB
 * @param apiKey - TheTVDB API key
 * @param page - Page number (1-indexed, converted to 0-indexed for API)
 */
export async function fetchTrendingTVShows(
  apiKey: string,
  page = 1
): Promise<TheTVDBTrendingResult> {
  if (!apiKey) {
    throw new Error('THETVDB_API_KEY is required');
  }

  const url = buildTheTVDBSeriesUrl(page - 1);
  const response = await makeAuthenticatedRequest<TheTVDBSeriesResponse>(apiKey, url);
  const result = parseTheTVDBSeriesResponse(response);

  return {
    ...result,
    page,
  };
}

/**
 * Fetch trending movies from TheTVDB
 * @param apiKey - TheTVDB API key
 * @param page - Page number (1-indexed, converted to 0-indexed for API)
 */
export async function fetchTrendingMovies(
  apiKey: string,
  page = 1
): Promise<TheTVDBTrendingResult> {
  if (!apiKey) {
    throw new Error('THETVDB_API_KEY is required');
  }

  const url = buildTheTVDBMoviesUrl(page - 1);
  const response = await makeAuthenticatedRequest<TheTVDBMoviesResponse>(apiKey, url);
  const result = parseTheTVDBMoviesResponse(response);

  return {
    ...result,
    page,
  };
}

/**
 * Fetch TV show details with cast/crew
 * @param apiKey - TheTVDB API key
 * @param id - Series ID
 */
export async function fetchTVShowDetails(
  apiKey: string,
  id: number
): Promise<TheTVDBTrendingItem | undefined> {
  if (!apiKey) {
    throw new Error('THETVDB_API_KEY is required');
  }

  const url = buildTheTVDBSeriesExtendedUrl(id);
  const response = await makeAuthenticatedRequest<TheTVDBSeriesExtendedResponse>(apiKey, url);

  return parseTheTVDBSeriesExtendedResponse(response);
}

/**
 * Fetch movie details with cast/crew
 * @param apiKey - TheTVDB API key
 * @param id - Movie ID
 */
export async function fetchMovieDetails(
  apiKey: string,
  id: number
): Promise<TheTVDBTrendingItem | undefined> {
  if (!apiKey) {
    throw new Error('THETVDB_API_KEY is required');
  }

  const url = buildTheTVDBMovieExtendedUrl(id);
  const response = await makeAuthenticatedRequest<TheTVDBMovieExtendedResponse>(apiKey, url);

  return parseTheTVDBMovieExtendedResponse(response);
}

/**
 * Fetch trending content with full details (cast, crew, etc.)
 * @param apiKey - TheTVDB API key
 * @param mediaType - 'tv' or 'movie'
 * @param page - Page number
 */
export async function fetchTrendingWithDetails(
  apiKey: string,
  mediaType: TheTVDBMediaType,
  page = 1
): Promise<TheTVDBTrendingResult> {
  // First get the list
  const listResult =
    mediaType === 'tv'
      ? await fetchTrendingTVShows(apiKey, page)
      : await fetchTrendingMovies(apiKey, page);

  // Then fetch details for each item (limit to first 10 to avoid rate limits)
  const itemsToEnrich = listResult.items.slice(0, 10);
  const enrichedItems = await Promise.all(
    itemsToEnrich.map(async (item) => {
      try {
        const details =
          mediaType === 'tv'
            ? await fetchTVShowDetails(apiKey, item.id)
            : await fetchMovieDetails(apiKey, item.id);
        return details ?? item;
      } catch {
        return item;
      }
    })
  );

  // Combine enriched items with remaining items
  const remainingItems = listResult.items.slice(10);

  return {
    ...listResult,
    items: [...enrichedItems, ...remainingItems],
  };
}

/**
 * Clear the token cache (useful for testing)
 */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiry = null;
}
