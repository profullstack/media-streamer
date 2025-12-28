/**
 * Metadata Module
 *
 * Exports metadata API utilities and types
 */

export {
  buildMusicBrainzUrl,
  buildCoverArtArchiveUrl,
  buildOpenLibraryUrl,
  buildOMDbUrl,
  buildTheTVDBUrl,
  parseMusicBrainzResponse,
  parseCoverArtArchiveResponse,
  parseOpenLibraryResponse,
  parseOMDbResponse,
  parseTheTVDBResponse,
} from './metadata';

export type {
  MetadataType,
  MusicMetadata,
  BookMetadata,
  MovieMetadata,
  TVShowMetadata,
  MusicBrainzSearchType,
} from './metadata';

// Artist image utilities
export {
  buildMusicBrainzArtistSearchUrl,
  buildFanartTvArtistUrl,
  parseMusicBrainzArtistResponse,
  parseFanartTvArtistResponse,
  fetchArtistImage,
} from './artist-image';

export type {
  MusicBrainzArtistResponse,
  FanartTvArtistResponse,
  ArtistInfo,
  FetchArtistImageOptions,
} from './artist-image';
