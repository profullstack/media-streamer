/**
 * Magnet URI Module
 * 
 * Provides parsing, validation, and normalization of BitTorrent magnet URIs
 */

export {
  parseMagnetUri,
  validateMagnetUri,
  extractInfohash,
  normalizeMagnetUri,
  MagnetParseError,
} from './magnet';

export type { ParsedMagnet } from './magnet';
