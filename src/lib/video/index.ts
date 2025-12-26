/**
 * Video Player Module
 * 
 * Exports video player utilities and types
 */

export {
  detectVideoFormat,
  isHlsSource,
  isSupportedVideoFormat,
  getVideoMimeType,
  createVideoSource,
  getDefaultPlayerOptions,
} from './video';

export type {
  VideoFormat,
  VideoSource,
  PlayerOptions,
  ControlBarOptions,
  Html5Options,
} from './video';
