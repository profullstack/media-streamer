/**
 * Transcoding Service Tests
 *
 * Tests for FFmpeg transcoding configuration and command generation
 */

import { describe, it, expect } from 'vitest';
import {
  getTranscodeProfile,
  buildFFmpegArgs,
  getOutputFormat,
  isTranscodingSupported,
  buildStreamingFFmpegArgs,
  getStreamingTranscodeProfile,
  getTranscodedMimeType,
  TRANSCODE_PRE_BUFFER_BYTES,
  TRANSCODE_PRE_BUFFER_TIMEOUT_MS,
  type TranscodeProfile,
  type MediaType,
} from './transcoding';

describe('Transcoding Service', () => {
  describe('getTranscodeProfile', () => {
    describe('video profiles', () => {
      it('should return web-optimized profile for MKV', () => {
        const profile = getTranscodeProfile('video', 'mkv');
        expect(profile).toEqual({
          outputFormat: 'mp4',
          videoCodec: 'libx264',
          audioCodec: 'aac',
          videoBitrate: '2000k',
          audioBitrate: '128k',
          preset: 'fast',
          crf: 23,
        });
      });

      it('should return web-optimized profile for AVI', () => {
        const profile = getTranscodeProfile('video', 'avi');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp4');
        expect(profile!.videoCodec).toBe('libx264');
      });

      it('should return web-optimized profile for WMV', () => {
        const profile = getTranscodeProfile('video', 'wmv');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp4');
      });

      it('should return web-optimized profile for FLV', () => {
        const profile = getTranscodeProfile('video', 'flv');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp4');
      });

      it('should return web-optimized profile for MOV', () => {
        const profile = getTranscodeProfile('video', 'mov');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp4');
      });

      it('should return null for already supported formats', () => {
        expect(getTranscodeProfile('video', 'mp4')).toBeNull();
        expect(getTranscodeProfile('video', 'webm')).toBeNull();
        expect(getTranscodeProfile('video', 'ogg')).toBeNull();
      });
    });

    describe('audio profiles', () => {
      it('should return web-optimized profile for WMA', () => {
        const profile = getTranscodeProfile('audio', 'wma');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp3');
        expect(profile!.audioCodec).toBe('libmp3lame');
      });

      it('should return web-optimized profile for AIFF', () => {
        const profile = getTranscodeProfile('audio', 'aiff');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp3');
      });

      it('should return web-optimized profile for APE', () => {
        const profile = getTranscodeProfile('audio', 'ape');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp3');
      });

      it('should return web-optimized profile for FLAC (iOS Safari compatibility)', () => {
        // FLAC is NOT supported on iOS Safari, so we transcode to MP3
        const profile = getTranscodeProfile('audio', 'flac');
        expect(profile).not.toBeNull();
        expect(profile!.outputFormat).toBe('mp3');
        expect(profile!.audioCodec).toBe('libmp3lame');
      });

      it('should return null for already supported formats', () => {
        // These formats are natively supported in all browsers including iOS Safari
        expect(getTranscodeProfile('audio', 'mp3')).toBeNull();
        expect(getTranscodeProfile('audio', 'wav')).toBeNull();
        expect(getTranscodeProfile('audio', 'ogg')).toBeNull();
        expect(getTranscodeProfile('audio', 'aac')).toBeNull();
      });
    });
  });

  describe('buildFFmpegArgs', () => {
    it('should build video transcoding arguments', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrate: '2000k',
        audioBitrate: '128k',
        preset: 'fast',
        crf: 23,
      };

      const args = buildFFmpegArgs('/input/video.mkv', '/output/video.mp4', profile);

      expect(args).toContain('-i');
      expect(args).toContain('/input/video.mkv');
      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
      expect(args).toContain('-b:v');
      expect(args).toContain('2000k');
      expect(args).toContain('-b:a');
      expect(args).toContain('128k');
      expect(args).toContain('-preset');
      expect(args).toContain('fast');
      expect(args).toContain('-crf');
      expect(args).toContain('23');
      expect(args).toContain('/output/video.mp4');
    });

    it('should build audio transcoding arguments', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp3',
        audioCodec: 'libmp3lame',
        audioBitrate: '320k',
        sampleRate: 44100,
      };

      const args = buildFFmpegArgs('/input/audio.flac', '/output/audio.mp3', profile);

      expect(args).toContain('-i');
      expect(args).toContain('/input/audio.flac');
      expect(args).toContain('-c:a');
      expect(args).toContain('libmp3lame');
      expect(args).toContain('-b:a');
      expect(args).toContain('320k');
      expect(args).toContain('-ar');
      expect(args).toContain('44100');
      expect(args).toContain('/output/audio.mp3');
    });

    it('should include movflags for MP4 output', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
      };

      const args = buildFFmpegArgs('/input/video.mkv', '/output/video.mp4', profile);

      expect(args).toContain('-movflags');
      expect(args).toContain('+faststart');
    });

    it('should include overwrite flag', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp3',
        audioCodec: 'libmp3lame',
      };

      const args = buildFFmpegArgs('/input/audio.flac', '/output/audio.mp3', profile);

      expect(args).toContain('-y');
    });
  });

  describe('getOutputFormat', () => {
    it('should return mp4 for video formats requiring transcoding', () => {
      expect(getOutputFormat('video', 'mkv')).toBe('mp4');
      expect(getOutputFormat('video', 'avi')).toBe('mp4');
      expect(getOutputFormat('video', 'wmv')).toBe('mp4');
      expect(getOutputFormat('video', 'flv')).toBe('mp4');
    });

    it('should return mp3 for audio formats requiring transcoding', () => {
      expect(getOutputFormat('audio', 'wma')).toBe('mp3');
      expect(getOutputFormat('audio', 'aiff')).toBe('mp3');
      expect(getOutputFormat('audio', 'ape')).toBe('mp3');
      // FLAC requires transcoding for iOS Safari compatibility
      expect(getOutputFormat('audio', 'flac')).toBe('mp3');
    });

    it('should return null for already supported formats', () => {
      expect(getOutputFormat('video', 'mp4')).toBeNull();
      expect(getOutputFormat('video', 'webm')).toBeNull();
      expect(getOutputFormat('audio', 'mp3')).toBeNull();
      expect(getOutputFormat('audio', 'ogg')).toBeNull();
    });
  });

  describe('isTranscodingSupported', () => {
    it('should return true for video formats that need transcoding', () => {
      expect(isTranscodingSupported('video', 'mkv')).toBe(true);
      expect(isTranscodingSupported('video', 'avi')).toBe(true);
      expect(isTranscodingSupported('video', 'wmv')).toBe(true);
      expect(isTranscodingSupported('video', 'flv')).toBe(true);
      expect(isTranscodingSupported('video', 'mov')).toBe(true);
    });

    it('should return true for audio formats that need transcoding', () => {
      expect(isTranscodingSupported('audio', 'wma')).toBe(true);
      expect(isTranscodingSupported('audio', 'aiff')).toBe(true);
      expect(isTranscodingSupported('audio', 'ape')).toBe(true);
      // FLAC requires transcoding for iOS Safari compatibility
      expect(isTranscodingSupported('audio', 'flac')).toBe(true);
    });

    it('should return false for already supported formats', () => {
      expect(isTranscodingSupported('video', 'mp4')).toBe(false);
      expect(isTranscodingSupported('video', 'webm')).toBe(false);
      expect(isTranscodingSupported('audio', 'mp3')).toBe(false);
      expect(isTranscodingSupported('audio', 'ogg')).toBe(false);
    });

    it('should return false for unknown formats', () => {
      expect(isTranscodingSupported('video', 'xyz')).toBe(false);
      expect(isTranscodingSupported('audio', 'abc')).toBe(false);
    });
  });

  describe('MediaType type', () => {
    it('should include video and audio', () => {
      const types: MediaType[] = ['video', 'audio'];
      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('TranscodeProfile type', () => {
    it('should allow video profile properties', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrate: '2000k',
        audioBitrate: '128k',
        preset: 'fast',
        crf: 23,
      };
      expect(profile.outputFormat).toBe('mp4');
    });

    it('should allow audio-only profile properties', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp3',
        audioCodec: 'libmp3lame',
        audioBitrate: '320k',
        sampleRate: 44100,
      };
      expect(profile.outputFormat).toBe('mp3');
    });
  });

  describe('buildStreamingFFmpegArgs', () => {
    it('should build video streaming arguments for pipe input/output', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrate: '2000k',
        audioBitrate: '128k',
        preset: 'ultrafast',
        crf: 23,
      };

      const args = buildStreamingFFmpegArgs(profile);

      // Should use pipe for input
      expect(args).toContain('-i');
      expect(args).toContain('pipe:0');
      // Should output to pipe
      expect(args).toContain('pipe:1');
      // Should use fragmented MP4 for streaming
      expect(args).toContain('-movflags');
      expect(args).toContain('frag_keyframe+empty_moov+default_base_moof');
      // Should use threads for performance
      expect(args).toContain('-threads');
      expect(args).toContain('4');
      // Should use video codec
      expect(args).toContain('-vcodec');
      expect(args).toContain('libx264');
      // Should use audio codec
      expect(args).toContain('-acodec');
      expect(args).toContain('aac');
    });

    it('should include bitrate limiting for streaming', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        videoBitrate: '2000k',
        audioBitrate: '128k',
        preset: 'ultrafast',
        crf: 23,
      };

      const args = buildStreamingFFmpegArgs(profile);

      // Should limit bitrate for streaming
      expect(args).toContain('-maxrate');
      expect(args).toContain('2M');
      expect(args).toContain('-bufsize');
      expect(args).toContain('1M');
      // Should output as MP4 format
      expect(args).toContain('-f');
      expect(args).toContain('mp4');
    });

    it('should build audio streaming arguments for pipe input/output', () => {
      const profile: TranscodeProfile = {
        outputFormat: 'mp3',
        audioCodec: 'libmp3lame',
        audioBitrate: '320k',
        sampleRate: 44100,
      };

      const args = buildStreamingFFmpegArgs(profile);

      expect(args).toContain('-i');
      expect(args).toContain('pipe:0');
      expect(args).toContain('pipe:1');
      expect(args).toContain('-acodec');
      expect(args).toContain('libmp3lame');
    });

    describe('iOS/Safari compatibility', () => {
      it('should include H.264 profile and level constraints for iOS Safari video playback', () => {
        const profile: TranscodeProfile = {
          outputFormat: 'mp4',
          videoCodec: 'libx264',
          audioCodec: 'aac',
          videoBitrate: '2000k',
          audioBitrate: '128k',
          preset: 'ultrafast',
          crf: 23,
        };

        const args = buildStreamingFFmpegArgs(profile);

        // iOS Safari requires H.264 Main profile with level 3.1 or lower
        expect(args).toContain('-profile:v');
        expect(args).toContain('main');
        expect(args).toContain('-level:v');
        expect(args).toContain('3.1');
      });

      it('should include yuv420p pixel format for iOS Safari video playback', () => {
        const profile: TranscodeProfile = {
          outputFormat: 'mp4',
          videoCodec: 'libx264',
          audioCodec: 'aac',
          videoBitrate: '2000k',
          audioBitrate: '128k',
          preset: 'ultrafast',
          crf: 23,
        };

        const args = buildStreamingFFmpegArgs(profile);

        // iOS Safari requires yuv420p pixel format
        expect(args).toContain('-pix_fmt');
        expect(args).toContain('yuv420p');
      });

      it('should include default_base_moof movflag for iOS Safari fragmented MP4 playback', () => {
        const profile: TranscodeProfile = {
          outputFormat: 'mp4',
          videoCodec: 'libx264',
          audioCodec: 'aac',
          videoBitrate: '2000k',
          audioBitrate: '128k',
          preset: 'ultrafast',
          crf: 23,
        };

        const args = buildStreamingFFmpegArgs(profile);

        // iOS Safari requires default_base_moof for proper fragmented MP4 playback
        const movflagsIndex = args.indexOf('-movflags');
        expect(movflagsIndex).toBeGreaterThan(-1);
        const movflagsValue = args[movflagsIndex + 1];
        expect(movflagsValue).toContain('default_base_moof');
      });

      it('should include write_xing option for iOS Safari MP3 streaming', () => {
        const profile: TranscodeProfile = {
          outputFormat: 'mp3',
          audioCodec: 'libmp3lame',
          audioBitrate: '192k',
          sampleRate: 44100,
        };

        const args = buildStreamingFFmpegArgs(profile);

        // iOS Safari needs Xing/LAME header for proper duration estimation
        expect(args).toContain('-write_xing');
        expect(args).toContain('1');
      });

      it('should include id3v2_version for iOS Safari MP3 metadata compatibility', () => {
        const profile: TranscodeProfile = {
          outputFormat: 'mp3',
          audioCodec: 'libmp3lame',
          audioBitrate: '192k',
          sampleRate: 44100,
        };

        const args = buildStreamingFFmpegArgs(profile);

        // iOS Safari needs ID3v2.3 for proper metadata handling
        expect(args).toContain('-id3v2_version');
        expect(args).toContain('3');
      });

      it('should include reservoir option disabled for iOS Safari MP3 streaming', () => {
        const profile: TranscodeProfile = {
          outputFormat: 'mp3',
          audioCodec: 'libmp3lame',
          audioBitrate: '192k',
          sampleRate: 44100,
        };

        const args = buildStreamingFFmpegArgs(profile);

        // Disable bit reservoir for more consistent frame sizes in streaming
        expect(args).toContain('-reservoir');
        expect(args).toContain('0');
      });
    });
  });

  describe('getStreamingTranscodeProfile', () => {
    it('should return streaming-optimized profile for MKV', () => {
      const profile = getStreamingTranscodeProfile('video', 'mkv');
      
      expect(profile).not.toBeNull();
      expect(profile!.outputFormat).toBe('mp4');
      expect(profile!.preset).toBe('ultrafast'); // Optimized for real-time
    });

    it('should return streaming-optimized profile for WMA', () => {
      const profile = getStreamingTranscodeProfile('audio', 'wma');
      
      expect(profile).not.toBeNull();
      expect(profile!.outputFormat).toBe('mp3');
    });

    it('should return streaming-optimized profile for FLAC (iOS Safari compatibility)', () => {
      // FLAC is NOT supported on iOS Safari, so we transcode to MP3
      const profile = getStreamingTranscodeProfile('audio', 'flac');
      
      expect(profile).not.toBeNull();
      expect(profile!.outputFormat).toBe('mp3');
    });

    it('should return null for already supported formats', () => {
      expect(getStreamingTranscodeProfile('video', 'mp4')).toBeNull();
      expect(getStreamingTranscodeProfile('audio', 'mp3')).toBeNull();
    });
  });

  describe('getTranscodedMimeType', () => {
    it('should return video/mp4 for transcoded video', () => {
      expect(getTranscodedMimeType('video', 'mkv')).toBe('video/mp4');
      expect(getTranscodedMimeType('video', 'avi')).toBe('video/mp4');
    });

    it('should return audio/mpeg for transcoded audio', () => {
      expect(getTranscodedMimeType('audio', 'wma')).toBe('audio/mpeg');
      expect(getTranscodedMimeType('audio', 'aiff')).toBe('audio/mpeg');
      // FLAC requires transcoding for iOS Safari compatibility
      expect(getTranscodedMimeType('audio', 'flac')).toBe('audio/mpeg');
    });

    it('should return null for formats that do not need transcoding', () => {
      expect(getTranscodedMimeType('video', 'mp4')).toBeNull();
      expect(getTranscodedMimeType('audio', 'mp3')).toBeNull();
    });
  });

  describe('Pre-buffer configuration', () => {
    it('should have a reasonable pre-buffer size (2MB)', () => {
      expect(TRANSCODE_PRE_BUFFER_BYTES).toBe(2 * 1024 * 1024);
    });

    it('should have a reasonable pre-buffer timeout (30 seconds)', () => {
      expect(TRANSCODE_PRE_BUFFER_TIMEOUT_MS).toBe(30_000);
    });

    it('should have pre-buffer size greater than 0', () => {
      expect(TRANSCODE_PRE_BUFFER_BYTES).toBeGreaterThan(0);
    });

    it('should have pre-buffer timeout greater than 0', () => {
      expect(TRANSCODE_PRE_BUFFER_TIMEOUT_MS).toBeGreaterThan(0);
    });
  });
});
