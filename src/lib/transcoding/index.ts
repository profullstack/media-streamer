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
  // Streaming transcoding functions
  getStreamingTranscodeProfile,
  buildStreamingFFmpegArgs,
  getTranscodedMimeType,
  detectMediaType,
  needsTranscoding,
} from './transcoding';

export type {
  MediaType,
  TranscodeProfile,
  TranscodeStatus,
  TranscodeJob,
  TranscodeOptions,
} from './transcoding';
