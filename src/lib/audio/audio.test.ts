/**
 * Audio Player Utility Tests
 * 
 * Tests for audio format detection, source configuration, and player options
 */

import { describe, it, expect } from 'vitest';
import {
  detectAudioFormat,
  isSupportedAudioFormat,
  getAudioMimeType,
  createAudioSource,
  formatDuration,
  AudioFormat,
} from './audio';

describe('Audio Player Utilities', () => {
  describe('detectAudioFormat', () => {
    it('should detect MP3 format', () => {
      expect(detectAudioFormat('song.mp3')).toBe('mp3');
      expect(detectAudioFormat('song.MP3')).toBe('mp3');
      expect(detectAudioFormat('/path/to/song.mp3')).toBe('mp3');
    });

    it('should detect FLAC format', () => {
      expect(detectAudioFormat('song.flac')).toBe('flac');
      expect(detectAudioFormat('song.FLAC')).toBe('flac');
    });

    it('should detect WAV format', () => {
      expect(detectAudioFormat('song.wav')).toBe('wav');
      expect(detectAudioFormat('song.WAV')).toBe('wav');
    });

    it('should detect OGG format', () => {
      expect(detectAudioFormat('song.ogg')).toBe('ogg');
      expect(detectAudioFormat('song.oga')).toBe('ogg');
      expect(detectAudioFormat('song.OGG')).toBe('ogg');
    });

    it('should detect AAC format', () => {
      expect(detectAudioFormat('song.aac')).toBe('aac');
      expect(detectAudioFormat('song.m4a')).toBe('aac');
      expect(detectAudioFormat('song.M4A')).toBe('aac');
    });

    it('should detect OPUS format', () => {
      expect(detectAudioFormat('song.opus')).toBe('opus');
      expect(detectAudioFormat('song.OPUS')).toBe('opus');
    });

    it('should detect WebM audio format', () => {
      expect(detectAudioFormat('song.weba')).toBe('webm');
      expect(detectAudioFormat('song.webm')).toBe('webm');
    });

    it('should detect WMA format', () => {
      expect(detectAudioFormat('song.wma')).toBe('wma');
      expect(detectAudioFormat('song.WMA')).toBe('wma');
    });

    it('should detect AIFF format', () => {
      expect(detectAudioFormat('song.aiff')).toBe('aiff');
      expect(detectAudioFormat('song.aif')).toBe('aiff');
    });

    it('should detect APE format', () => {
      expect(detectAudioFormat('song.ape')).toBe('ape');
    });

    it('should return unknown for unrecognized formats', () => {
      expect(detectAudioFormat('song.xyz')).toBe('unknown');
      expect(detectAudioFormat('song')).toBe('unknown');
      expect(detectAudioFormat('')).toBe('unknown');
    });

    it('should handle URLs with query parameters', () => {
      expect(detectAudioFormat('song.mp3?token=abc')).toBe('mp3');
      expect(detectAudioFormat('song.flac?key=123')).toBe('flac');
    });

    it('should handle URLs with fragments', () => {
      expect(detectAudioFormat('song.mp3#t=10')).toBe('mp3');
    });
  });

  describe('isSupportedAudioFormat', () => {
    it('should return true for natively supported formats', () => {
      expect(isSupportedAudioFormat('mp3')).toBe(true);
      expect(isSupportedAudioFormat('wav')).toBe(true);
      expect(isSupportedAudioFormat('ogg')).toBe(true);
      expect(isSupportedAudioFormat('aac')).toBe(true);
      expect(isSupportedAudioFormat('webm')).toBe(true);
      expect(isSupportedAudioFormat('opus')).toBe(true);
    });

    it('should return false for formats requiring transcoding', () => {
      expect(isSupportedAudioFormat('wma')).toBe(false);
      expect(isSupportedAudioFormat('aiff')).toBe(false);
      expect(isSupportedAudioFormat('ape')).toBe(false);
      // FLAC requires transcoding for iOS Safari compatibility
      expect(isSupportedAudioFormat('flac')).toBe(false);
    });

    it('should return false for unknown formats', () => {
      expect(isSupportedAudioFormat('unknown')).toBe(false);
    });
  });

  describe('getAudioMimeType', () => {
    it('should return correct MIME type for MP3', () => {
      expect(getAudioMimeType('mp3')).toBe('audio/mpeg');
    });

    it('should return correct MIME type for FLAC', () => {
      expect(getAudioMimeType('flac')).toBe('audio/flac');
    });

    it('should return correct MIME type for WAV', () => {
      expect(getAudioMimeType('wav')).toBe('audio/wav');
    });

    it('should return correct MIME type for OGG', () => {
      expect(getAudioMimeType('ogg')).toBe('audio/ogg');
    });

    it('should return correct MIME type for AAC', () => {
      expect(getAudioMimeType('aac')).toBe('audio/aac');
    });

    it('should return correct MIME type for OPUS', () => {
      expect(getAudioMimeType('opus')).toBe('audio/opus');
    });

    it('should return correct MIME type for WebM', () => {
      expect(getAudioMimeType('webm')).toBe('audio/webm');
    });

    it('should return correct MIME type for WMA', () => {
      expect(getAudioMimeType('wma')).toBe('audio/x-ms-wma');
    });

    it('should return correct MIME type for AIFF', () => {
      expect(getAudioMimeType('aiff')).toBe('audio/aiff');
    });

    it('should return correct MIME type for APE', () => {
      expect(getAudioMimeType('ape')).toBe('audio/x-ape');
    });

    it('should return octet-stream for unknown formats', () => {
      expect(getAudioMimeType('unknown')).toBe('application/octet-stream');
    });
  });

  describe('createAudioSource', () => {
    it('should create source object for MP3', () => {
      const source = createAudioSource('/api/stream?file=song.mp3', 'song.mp3');
      expect(source).toEqual({
        src: '/api/stream?file=song.mp3',
        type: 'audio/mpeg',
        format: 'mp3',
        requiresTranscoding: false,
      });
    });

    it('should create source object for FLAC (requires transcoding for iOS Safari)', () => {
      const source = createAudioSource('/api/stream?file=song.flac', 'song.flac');
      expect(source).toEqual({
        src: '/api/stream?file=song.flac',
        type: 'audio/flac',
        format: 'flac',
        requiresTranscoding: true, // FLAC requires transcoding for iOS Safari compatibility
      });
    });

    it('should mark WAV as not requiring transcoding', () => {
      const source = createAudioSource('/api/stream?file=song.wav', 'song.wav');
      expect(source.requiresTranscoding).toBe(false);
    });

    it('should mark WMA as requiring transcoding', () => {
      const source = createAudioSource('/api/stream?file=song.wma', 'song.wma');
      expect(source.requiresTranscoding).toBe(true);
    });

    it('should handle OGG without transcoding', () => {
      const source = createAudioSource('/api/stream?file=song.ogg', 'song.ogg');
      expect(source.requiresTranscoding).toBe(false);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds to MM:SS', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(30)).toBe('0:30');
      expect(formatDuration(60)).toBe('1:00');
      expect(formatDuration(90)).toBe('1:30');
      expect(formatDuration(125)).toBe('2:05');
    });

    it('should format minutes and seconds correctly', () => {
      expect(formatDuration(300)).toBe('5:00');
      expect(formatDuration(599)).toBe('9:59');
      expect(formatDuration(600)).toBe('10:00');
    });

    it('should format hours correctly', () => {
      expect(formatDuration(3600)).toBe('1:00:00');
      expect(formatDuration(3661)).toBe('1:01:01');
      expect(formatDuration(7200)).toBe('2:00:00');
      expect(formatDuration(7325)).toBe('2:02:05');
    });

    it('should handle decimal seconds', () => {
      expect(formatDuration(30.5)).toBe('0:30');
      expect(formatDuration(90.9)).toBe('1:30');
    });

    it('should handle negative values', () => {
      expect(formatDuration(-10)).toBe('0:00');
    });

    it('should handle NaN and Infinity', () => {
      expect(formatDuration(NaN)).toBe('0:00');
      expect(formatDuration(Infinity)).toBe('0:00');
    });
  });

  describe('AudioFormat type', () => {
    it('should include all supported formats', () => {
      const formats: AudioFormat[] = [
        'mp3', 'flac', 'wav', 'ogg', 'aac', 'opus', 'webm', 'wma', 'aiff', 'ape', 'unknown'
      ];
      
      // Type check - this will fail at compile time if AudioFormat is missing any
      formats.forEach(format => {
        expect(typeof format).toBe('string');
      });
    });
  });
});
