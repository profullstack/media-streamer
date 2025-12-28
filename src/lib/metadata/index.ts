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
