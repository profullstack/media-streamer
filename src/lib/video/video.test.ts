/**
 * Video Player Utility Tests
 * 
 * Tests for video format detection, source configuration, and player options
 */

import { describe, it, expect } from 'vitest';
import {
  detectVideoFormat,
  isHlsSource,
  isSupportedVideoFormat,
  getVideoMimeType,
  createVideoSource,
  getDefaultPlayerOptions,
  VideoFormat,
} from './video';

describe('Video Player Utilities', () => {
  describe('detectVideoFormat', () => {
    it('should detect MP4 format', () => {
      expect(detectVideoFormat('video.mp4')).toBe('mp4');
      expect(detectVideoFormat('video.MP4')).toBe('mp4');
      expect(detectVideoFormat('/path/to/video.mp4')).toBe('mp4');
    });

    it('should detect WebM format', () => {
      expect(detectVideoFormat('video.webm')).toBe('webm');
      expect(detectVideoFormat('video.WEBM')).toBe('webm');
    });

    it('should detect MKV format', () => {
      expect(detectVideoFormat('video.mkv')).toBe('mkv');
      expect(detectVideoFormat('video.MKV')).toBe('mkv');
    });

    it('should detect AVI format', () => {
      expect(detectVideoFormat('video.avi')).toBe('avi');
      expect(detectVideoFormat('video.AVI')).toBe('avi');
    });

    it('should detect MOV format', () => {
      expect(detectVideoFormat('video.mov')).toBe('mov');
      expect(detectVideoFormat('video.MOV')).toBe('mov');
    });

    it('should detect OGG/OGV format', () => {
      expect(detectVideoFormat('video.ogg')).toBe('ogg');
      expect(detectVideoFormat('video.ogv')).toBe('ogg');
      expect(detectVideoFormat('video.OGV')).toBe('ogg');
    });

    it('should detect HLS M3U8 format', () => {
      expect(detectVideoFormat('stream.m3u8')).toBe('hls');
      expect(detectVideoFormat('stream.M3U8')).toBe('hls');
      expect(detectVideoFormat('/live/stream.m3u8')).toBe('hls');
    });

    it('should detect MPEG-TS format', () => {
      expect(detectVideoFormat('video.ts')).toBe('ts');
      expect(detectVideoFormat('video.TS')).toBe('ts');
    });

    it('should detect FLV format', () => {
      expect(detectVideoFormat('video.flv')).toBe('flv');
      expect(detectVideoFormat('video.FLV')).toBe('flv');
    });

    it('should detect WMV format', () => {
      expect(detectVideoFormat('video.wmv')).toBe('wmv');
      expect(detectVideoFormat('video.WMV')).toBe('wmv');
    });

    it('should return unknown for unrecognized formats', () => {
      expect(detectVideoFormat('video.xyz')).toBe('unknown');
      expect(detectVideoFormat('video')).toBe('unknown');
      expect(detectVideoFormat('')).toBe('unknown');
    });

    it('should handle URLs with query parameters', () => {
      expect(detectVideoFormat('video.mp4?token=abc')).toBe('mp4');
      expect(detectVideoFormat('stream.m3u8?key=123')).toBe('hls');
    });

    it('should handle URLs with fragments', () => {
      expect(detectVideoFormat('video.mp4#t=10')).toBe('mp4');
    });
  });

  describe('isHlsSource', () => {
    it('should return true for M3U8 files', () => {
      expect(isHlsSource('stream.m3u8')).toBe(true);
      expect(isHlsSource('/live/stream.m3u8')).toBe(true);
      expect(isHlsSource('https://example.com/stream.m3u8')).toBe(true);
    });

    it('should return true for M3U8 URLs with query params', () => {
      expect(isHlsSource('stream.m3u8?token=abc')).toBe(true);
    });

    it('should return false for non-HLS sources', () => {
      expect(isHlsSource('video.mp4')).toBe(false);
      expect(isHlsSource('video.webm')).toBe(false);
      expect(isHlsSource('video.mkv')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isHlsSource('stream.M3U8')).toBe(true);
      expect(isHlsSource('stream.M3u8')).toBe(true);
    });
  });

  describe('isSupportedVideoFormat', () => {
    it('should return true for natively supported formats', () => {
      expect(isSupportedVideoFormat('mp4')).toBe(true);
      expect(isSupportedVideoFormat('webm')).toBe(true);
      expect(isSupportedVideoFormat('ogg')).toBe(true);
      expect(isSupportedVideoFormat('hls')).toBe(true);
    });

    it('should return false for formats requiring transcoding', () => {
      expect(isSupportedVideoFormat('mkv')).toBe(false);
      expect(isSupportedVideoFormat('avi')).toBe(false);
      expect(isSupportedVideoFormat('wmv')).toBe(false);
      expect(isSupportedVideoFormat('flv')).toBe(false);
    });

    it('should return false for unknown formats', () => {
      expect(isSupportedVideoFormat('unknown')).toBe(false);
    });
  });

  describe('getVideoMimeType', () => {
    it('should return correct MIME type for MP4', () => {
      expect(getVideoMimeType('mp4')).toBe('video/mp4');
    });

    it('should return correct MIME type for WebM', () => {
      expect(getVideoMimeType('webm')).toBe('video/webm');
    });

    it('should return correct MIME type for OGG', () => {
      expect(getVideoMimeType('ogg')).toBe('video/ogg');
    });

    it('should return correct MIME type for HLS', () => {
      expect(getVideoMimeType('hls')).toBe('application/x-mpegURL');
    });

    it('should return correct MIME type for MKV', () => {
      expect(getVideoMimeType('mkv')).toBe('video/x-matroska');
    });

    it('should return correct MIME type for AVI', () => {
      expect(getVideoMimeType('avi')).toBe('video/x-msvideo');
    });

    it('should return correct MIME type for MOV', () => {
      expect(getVideoMimeType('mov')).toBe('video/quicktime');
    });

    it('should return correct MIME type for TS', () => {
      expect(getVideoMimeType('ts')).toBe('video/mp2t');
    });

    it('should return correct MIME type for FLV', () => {
      expect(getVideoMimeType('flv')).toBe('video/x-flv');
    });

    it('should return correct MIME type for WMV', () => {
      expect(getVideoMimeType('wmv')).toBe('video/x-ms-wmv');
    });

    it('should return octet-stream for unknown formats', () => {
      expect(getVideoMimeType('unknown')).toBe('application/octet-stream');
    });
  });

  describe('createVideoSource', () => {
    it('should create source object for MP4 (native playback)', () => {
      const source = createVideoSource('/api/stream?file=video.mp4', 'video.mp4');
      expect(source).toEqual({
        src: '/api/stream?file=video.mp4',
        type: 'video/mp4',
        playbackType: 'video/mp4', // Same as type for native formats
        format: 'mp4',
        requiresTranscoding: false,
      });
    });

    it('should create source object for HLS (native playback)', () => {
      const source = createVideoSource('https://example.com/stream.m3u8', 'stream.m3u8');
      expect(source).toEqual({
        src: 'https://example.com/stream.m3u8',
        type: 'application/x-mpegURL',
        playbackType: 'application/x-mpegURL', // Same as type for native formats
        format: 'hls',
        requiresTranscoding: false,
      });
    });

    it('should mark MKV as requiring transcoding with MP4 playback type', () => {
      const source = createVideoSource('/api/stream?file=video.mkv', 'video.mkv');
      expect(source).toEqual({
        src: '/api/stream?file=video.mkv',
        type: 'video/x-matroska', // Original type
        playbackType: 'video/mp4', // Transcoded output type
        format: 'mkv',
        requiresTranscoding: true,
      });
    });

    it('should mark AVI as requiring transcoding with MP4 playback type', () => {
      const source = createVideoSource('/api/stream?file=video.avi', 'video.avi');
      expect(source.requiresTranscoding).toBe(true);
      expect(source.playbackType).toBe('video/mp4'); // Transcoded to MP4
    });

    it('should handle WebM without transcoding', () => {
      const source = createVideoSource('/api/stream?file=video.webm', 'video.webm');
      expect(source.requiresTranscoding).toBe(false);
      expect(source.playbackType).toBe('video/webm'); // Same as original
    });
  });

  describe('getDefaultPlayerOptions', () => {
    it('should return default player options', () => {
      const options = getDefaultPlayerOptions();
      
      expect(options.controls).toBe(true);
      expect(options.autoplay).toBe(false);
      expect(options.preload).toBe('auto');
      expect(options.fluid).toBe(true);
      expect(options.responsive).toBe(true);
    });

    it('should include playback rates', () => {
      const options = getDefaultPlayerOptions();
      
      expect(options.playbackRates).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
    });

    it('should include control bar configuration', () => {
      const options = getDefaultPlayerOptions();
      
      expect(options.controlBar).toBeDefined();
      expect(options.controlBar?.pictureInPictureToggle).toBe(true);
      expect(options.controlBar?.fullscreenToggle).toBe(true);
    });

    it('should allow overriding options', () => {
      const options = getDefaultPlayerOptions({
        autoplay: true,
        muted: true,
      });
      
      expect(options.autoplay).toBe(true);
      expect(options.muted).toBe(true);
      expect(options.controls).toBe(true); // Default preserved
    });

    it('should allow overriding control bar options', () => {
      const options = getDefaultPlayerOptions({
        controlBar: {
          pictureInPictureToggle: false,
        },
      });
      
      expect(options.controlBar?.pictureInPictureToggle).toBe(false);
      expect(options.controlBar?.fullscreenToggle).toBe(true); // Default preserved
    });
  });

  describe('VideoFormat type', () => {
    it('should include all supported formats', () => {
      const formats: VideoFormat[] = [
        'mp4', 'webm', 'mkv', 'avi', 'mov', 'ogg', 'hls', 'ts', 'flv', 'wmv', 'unknown'
      ];
      
      // Type check - this will fail at compile time if VideoFormat is missing any
      formats.forEach(format => {
        expect(typeof format).toBe('string');
      });
    });
  });
});
