/**
 * Codec Detection Tests
 *
 * Tests for FFmpeg-based codec detection for video and audio files.
 */

import { describe, it, expect } from 'vitest';
import {
  type CodecInfo,
  type StreamInfo,
  isCodecBrowserCompatible,
  needsTranscoding,
  formatCodecInfoForDb,
  BROWSER_COMPATIBLE_VIDEO_CODECS,
  BROWSER_COMPATIBLE_AUDIO_CODECS,
} from './codec-detection';

describe('codec-detection', () => {
  describe('BROWSER_COMPATIBLE_VIDEO_CODECS', () => {
    it('should include h264', () => {
      expect(BROWSER_COMPATIBLE_VIDEO_CODECS.has('h264')).toBe(true);
    });

    it('should include vp8', () => {
      expect(BROWSER_COMPATIBLE_VIDEO_CODECS.has('vp8')).toBe(true);
    });

    it('should include vp9', () => {
      expect(BROWSER_COMPATIBLE_VIDEO_CODECS.has('vp9')).toBe(true);
    });

    it('should include av1', () => {
      expect(BROWSER_COMPATIBLE_VIDEO_CODECS.has('av1')).toBe(true);
    });

    it('should NOT include hevc by default (limited browser support)', () => {
      expect(BROWSER_COMPATIBLE_VIDEO_CODECS.has('hevc')).toBe(false);
    });
  });

  describe('BROWSER_COMPATIBLE_AUDIO_CODECS', () => {
    it('should include aac', () => {
      expect(BROWSER_COMPATIBLE_AUDIO_CODECS.has('aac')).toBe(true);
    });

    it('should include mp3', () => {
      expect(BROWSER_COMPATIBLE_AUDIO_CODECS.has('mp3')).toBe(true);
    });

    it('should include opus', () => {
      expect(BROWSER_COMPATIBLE_AUDIO_CODECS.has('opus')).toBe(true);
    });

    it('should include vorbis', () => {
      expect(BROWSER_COMPATIBLE_AUDIO_CODECS.has('vorbis')).toBe(true);
    });

    it('should include flac', () => {
      expect(BROWSER_COMPATIBLE_AUDIO_CODECS.has('flac')).toBe(true);
    });
  });

  describe('isCodecBrowserCompatible', () => {
    it('should return true for h264 video', () => {
      expect(isCodecBrowserCompatible('h264', 'video')).toBe(true);
    });

    it('should return true for avc1 (h264 alias)', () => {
      expect(isCodecBrowserCompatible('avc1', 'video')).toBe(true);
    });

    it('should return false for hevc video', () => {
      expect(isCodecBrowserCompatible('hevc', 'video')).toBe(false);
    });

    it('should return false for h265 video', () => {
      expect(isCodecBrowserCompatible('h265', 'video')).toBe(false);
    });

    it('should return true for aac audio', () => {
      expect(isCodecBrowserCompatible('aac', 'audio')).toBe(true);
    });

    it('should return true for mp3 audio', () => {
      expect(isCodecBrowserCompatible('mp3', 'audio')).toBe(true);
    });

    it('should return false for ac3 audio', () => {
      expect(isCodecBrowserCompatible('ac3', 'audio')).toBe(false);
    });

    it('should return false for dts audio', () => {
      expect(isCodecBrowserCompatible('dts', 'audio')).toBe(false);
    });

    it('should handle case-insensitive codec names', () => {
      expect(isCodecBrowserCompatible('H264', 'video')).toBe(true);
      expect(isCodecBrowserCompatible('AAC', 'audio')).toBe(true);
    });
  });

  describe('needsTranscoding', () => {
    it('should return false for h264 + aac', () => {
      const codecInfo: CodecInfo = {
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mp4',
        streams: [],
      };
      expect(needsTranscoding(codecInfo)).toBe(false);
    });

    it('should return true for hevc + aac', () => {
      const codecInfo: CodecInfo = {
        videoCodec: 'hevc',
        audioCodec: 'aac',
        container: 'mp4',
        streams: [],
      };
      expect(needsTranscoding(codecInfo)).toBe(true);
    });

    it('should return true for h264 + ac3', () => {
      const codecInfo: CodecInfo = {
        videoCodec: 'h264',
        audioCodec: 'ac3',
        container: 'mp4',
        streams: [],
      };
      expect(needsTranscoding(codecInfo)).toBe(true);
    });

    it('should return true for hevc + dts', () => {
      const codecInfo: CodecInfo = {
        videoCodec: 'hevc',
        audioCodec: 'dts',
        container: 'mkv',
        streams: [],
      };
      expect(needsTranscoding(codecInfo)).toBe(true);
    });

    it('should return false for audio-only with aac', () => {
      const codecInfo: CodecInfo = {
        audioCodec: 'aac',
        container: 'm4a',
        streams: [],
      };
      expect(needsTranscoding(codecInfo)).toBe(false);
    });

    it('should return true for audio-only with wma', () => {
      const codecInfo: CodecInfo = {
        audioCodec: 'wma',
        container: 'wma',
        streams: [],
      };
      expect(needsTranscoding(codecInfo)).toBe(true);
    });

    it('should return false for vp9 + opus (WebM)', () => {
      const codecInfo: CodecInfo = {
        videoCodec: 'vp9',
        audioCodec: 'opus',
        container: 'webm',
        streams: [],
      };
      expect(needsTranscoding(codecInfo)).toBe(false);
    });
  });

  describe('formatCodecInfoForDb', () => {
    it('should format codec info for database storage', () => {
      const codecInfo: CodecInfo = {
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mp4',
        duration: 120.5,
        bitRate: 5000000,
        needsTranscoding: false,
        streams: [
          {
            codecType: 'video',
            codecName: 'h264',
            width: 1920,
            height: 1080,
          },
          {
            codecType: 'audio',
            codecName: 'aac',
            sampleRate: 48000,
            channels: 2,
          },
        ],
      };

      const result = formatCodecInfoForDb(codecInfo);

      expect(result.video_codec).toBe('h264');
      expect(result.audio_codec).toBe('aac');
      expect(result.container).toBe('mp4');
      expect(result.duration_seconds).toBe(120.5);
      expect(result.bit_rate).toBe(5000000);
      expect(result.needs_transcoding).toBe(false);
      expect(result.resolution).toBe('1920x1080');
    });

    it('should handle audio-only files', () => {
      const codecInfo: CodecInfo = {
        audioCodec: 'mp3',
        container: 'mp3',
        duration: 180.0,
        bitRate: 320000,
        needsTranscoding: false,
        streams: [
          {
            codecType: 'audio',
            codecName: 'mp3',
            sampleRate: 44100,
            channels: 2,
          },
        ],
      };

      const result = formatCodecInfoForDb(codecInfo);

      expect(result.video_codec).toBeNull();
      expect(result.audio_codec).toBe('mp3');
      expect(result.resolution).toBeNull();
    });

    it('should handle missing optional fields', () => {
      const codecInfo: CodecInfo = {
        container: 'unknown',
        streams: [],
      };

      const result = formatCodecInfoForDb(codecInfo);

      expect(result.video_codec).toBeNull();
      expect(result.audio_codec).toBeNull();
      expect(result.duration_seconds).toBeNull();
      expect(result.bit_rate).toBeNull();
      expect(result.needs_transcoding).toBe(false);
      expect(result.resolution).toBeNull();
    });
  });

  describe('StreamInfo type', () => {
    it('should have correct structure for video stream', () => {
      const videoStream: StreamInfo = {
        codecType: 'video',
        codecName: 'h264',
        width: 1920,
        height: 1080,
        bitRate: 5000000,
      };

      expect(videoStream.codecType).toBe('video');
      expect(videoStream.codecName).toBe('h264');
      expect(videoStream.width).toBe(1920);
      expect(videoStream.height).toBe(1080);
    });

    it('should have correct structure for audio stream', () => {
      const audioStream: StreamInfo = {
        codecType: 'audio',
        codecName: 'aac',
        sampleRate: 48000,
        channels: 2,
        bitRate: 128000,
      };

      expect(audioStream.codecType).toBe('audio');
      expect(audioStream.codecName).toBe('aac');
      expect(audioStream.sampleRate).toBe(48000);
      expect(audioStream.channels).toBe(2);
    });
  });

  describe('CodecInfo type', () => {
    it('should have correct structure', () => {
      const codecInfo: CodecInfo = {
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mp4',
        duration: 120.5,
        bitRate: 5000000,
        streams: [
          {
            codecType: 'video',
            codecName: 'h264',
            width: 1920,
            height: 1080,
          },
          {
            codecType: 'audio',
            codecName: 'aac',
            sampleRate: 48000,
            channels: 2,
          },
        ],
      };

      expect(codecInfo.videoCodec).toBe('h264');
      expect(codecInfo.audioCodec).toBe('aac');
      expect(codecInfo.container).toBe('mp4');
      expect(codecInfo.duration).toBe(120.5);
      expect(codecInfo.streams).toHaveLength(2);
    });
  });
});
