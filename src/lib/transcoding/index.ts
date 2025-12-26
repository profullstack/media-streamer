/**
 * Transcoding Module
 * 
 * Exports transcoding utilities and types
 */

export {
  getTranscodeProfile,
  buildFFmpegArgs,
  getOutputFormat,
  isTranscodingSupported,
  generateOutputFilename,
  estimateTranscodeTime,
} from './transcoding';

export type {
  MediaType,
  TranscodeProfile,
  TranscodeStatus,
  TranscodeJob,
  TranscodeOptions,
} from './transcoding';
