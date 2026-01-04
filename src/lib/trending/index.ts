/**
 * Trending Module
 *
 * Exports trending/popular content functionality from multiple sources:
 * - TheTVDB for trending TV shows and movies
 * - Local database for popular torrents
 */

// Local database trending (torrents)
export {
  fetchPopularContent,
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchPopularMusic,
  fetchRecentlyAdded,
  fetchMostSeeded,
  type TrendingMediaType,
  type TrendingTimeWindow,
  type TrendingItem,
  type TrendingResult,
} from './trending';

// TheTVDB trending (TV shows and movies from external API)
export {
  fetchTrendingTVShows,
  fetchTrendingMovies,
  fetchTrendingWithDetails,
  fetchTVShowDetails,
  fetchMovieDetails,
  fetchTheTVDBToken,
  buildTheTVDBAuthUrl,
  buildTheTVDBSeriesUrl,
  buildTheTVDBMoviesUrl,
  buildTheTVDBSeriesExtendedUrl,
  buildTheTVDBMovieExtendedUrl,
  buildTheTVDBImageUrl,
  parseTheTVDBSeriesResponse,
  parseTheTVDBMoviesResponse,
  parseTheTVDBSeriesExtendedResponse,
  parseTheTVDBMovieExtendedResponse,
  clearTokenCache,
  type TheTVDBMediaType,
  type TheTVDBTrendingItem,
  type TheTVDBTrendingResult,
} from './thetvdb-client';
