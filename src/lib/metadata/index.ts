/**
 * Metadata Module
 *
 * Exports metadata API utilities and types
 */

export {
  buildMusicBrainzUrl,
  buildOpenLibraryUrl,
  buildOMDbUrl,
  parseMusicBrainzResponse,
  parseOpenLibraryResponse,
  parseOMDbResponse,
} from './metadata';

export type {
  MetadataType,
  MusicMetadata,
  BookMetadata,
  MovieMetadata,
  TVShowMetadata,
  MusicBrainzSearchType,
} from './metadata';

// Fanart.tv utilities for all media types
export {
  // Music
  buildMusicBrainzArtistSearchUrl,
  buildFanartTvArtistUrl,
  parseMusicBrainzArtistResponse,
  parseFanartTvArtistResponse,
  parseFanartTvAlbumCover,
  getFirstAlbumCover,
  fetchArtistImage,
  fetchAlbumCover,
  // Movies (via IMDB ID from OMDb)
  buildFanartTvMovieUrl,
  buildFanartTvMovieUrlByImdb,
  parseFanartTvMovieResponse,
  fetchMoviePoster,
  fetchMoviePosterByImdb,
  // TV Shows (via TVDB ID or IMDB ID)
  buildFanartTvTvShowUrl,
  parseFanartTvTvShowResponse,
  fetchTvShowPoster,
} from './artist-image';

export type {
  MusicBrainzArtistResponse,
  FanartTvArtistResponse,
  ArtistInfo,
  FetchArtistImageOptions,
  FetchAlbumCoverOptions,
  // Movie types
  FanartTvMovieResponse,
  FetchMoviePosterOptions,
  // TV Show types
  FanartTvTvShowResponse,
  FetchTvShowPosterOptions,
} from './artist-image';
