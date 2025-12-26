/**
 * Audio Player Module
 * 
 * Exports audio player utilities and types
 */

export {
  detectAudioFormat,
  isSupportedAudioFormat,
  getAudioMimeType,
  createAudioSource,
  formatDuration,
} from './audio';

export type {
  AudioFormat,
  AudioSource,
} from './audio';
