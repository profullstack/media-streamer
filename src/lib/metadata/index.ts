/**
 * Metadata Module
 * 
 * Exports metadata API utilities and types
 */

export {
  buildMusicBrainzUrl,
  buildOpenLibraryUrl,
  buildOMDbUrl,
  buildTheTVDBUrl,
  parseMusicBrainzResponse,
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
} from './metadata';
