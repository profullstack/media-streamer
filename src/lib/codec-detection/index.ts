/**
 * Codec Detection Module
 *
 * Exports codec detection functionality for video and audio files.
 */

export {
  type CodecInfo,
  type StreamInfo,
  detectCodecFromStream,
  detectCodecFromFile,
  detectCodecFromUrl,
  isCodecBrowserCompatible,
  needsTranscoding,
  formatCodecInfoForDb,
  getFFmpegDemuxerForContainer,
  getFFmpegDemuxerForExtension,
  BROWSER_COMPATIBLE_VIDEO_CODECS,
  BROWSER_COMPATIBLE_AUDIO_CODECS,
} from './codec-detection';
