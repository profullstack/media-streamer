/**
 * Radio Library
 *
 * Exports for radio station functionality including provider integrations,
 * favorites management, and streaming.
 */

// Types
export * from './types';
export * from './station-utils';

// SiriusXM provider
export {
  createSiriusXmService,
  getSiriusXmService,
  resetSiriusXmService,
  parseSiriusXmId,
  getSiriusXmTuneUrl,
  siriusXmHeaders,
  rewriteSiriusXmPlaylist,
  decodeSiriusXmKeyJson,
  looksLikePlaylist,
  SIRIUSXM_STATION_ID_PREFIX,
} from './siriusxm';
export type { SiriusXmService } from './siriusxm';

// Free/open radio providers
export { createManualRadioService } from './manual';
export { createRadioBrowserService } from './radio-browser';

// Repository
export { createRadioRepository, getRadioRepository } from './repository';
export type { RadioRepository } from './repository';

// Service
export { createRadioService, getRadioService, resetRadioService } from './service';
export type { RadioService } from './service';
