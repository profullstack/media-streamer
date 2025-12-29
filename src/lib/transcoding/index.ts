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
  getPreBufferSize,
  // Pre-buffer configuration
  TRANSCODE_PRE_BUFFER_BYTES_VIDEO,
  TRANSCODE_PRE_BUFFER_BYTES_AUDIO,
  TRANSCODE_PRE_BUFFER_BYTES,
  TRANSCODE_PRE_BUFFER_TIMEOUT_MS,
} from './transcoding';

export type {
  MediaType,
  TranscodeProfile,
  TranscodeStatus,
  TranscodeJob,
  TranscodeOptions,
} from './transcoding';
