/**
 * Media Session API Tests
 * 
 * Tests for the Media Session API integration that enables
 * iOS lock screen, CarPlay, and other media control surfaces.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  updateMediaSessionPositionState,
  setMediaSessionActionHandlers,
  clearMediaSession,
  type MediaSessionMetadata,
  type MediaSessionActionHandlers,
} from './media-session';

// Mock navigator.mediaSession
const mockMediaSession = {
  metadata: null as MediaMetadata | null,
  playbackState: 'none' as MediaSessionPlaybackState,
  setActionHandler: vi.fn(),
  setPositionState: vi.fn(),
};

describe('Media Session API', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockMediaSession.metadata = null;
    mockMediaSession.playbackState = 'none';
    
    // Mock navigator.mediaSession
    Object.defineProperty(navigator, 'mediaSession', {
      value: mockMediaSession,
      writable: true,
      configurable: true,
    });
    
    // Mock MediaMetadata constructor
    vi.stubGlobal('MediaMetadata', class MockMediaMetadata {
      title: string;
      artist: string;
      album: string;
      artwork: MediaImage[];
      
      constructor(init: MediaMetadataInit) {
        this.title = init.title ?? '';
        this.artist = init.artist ?? '';
        this.album = init.album ?? '';
        this.artwork = init.artwork ?? [];
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('setMediaSessionMetadata', () => {
    it('should set metadata with all fields', () => {
      const metadata: MediaSessionMetadata = {
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        artwork: 'https://example.com/cover.jpg',
      };

      setMediaSessionMetadata(metadata);

      expect(mockMediaSession.metadata).not.toBeNull();
      expect(mockMediaSession.metadata?.title).toBe('Test Song');
      expect(mockMediaSession.metadata?.artist).toBe('Test Artist');
      expect(mockMediaSession.metadata?.album).toBe('Test Album');
      expect(mockMediaSession.metadata?.artwork).toHaveLength(4); // 96, 128, 256, 512
    });

    it('should set metadata with only title', () => {
      const metadata: MediaSessionMetadata = {
        title: 'Test Song',
      };

      setMediaSessionMetadata(metadata);

      expect(mockMediaSession.metadata).not.toBeNull();
      expect(mockMediaSession.metadata?.title).toBe('Test Song');
      expect(mockMediaSession.metadata?.artist).toBe('');
      expect(mockMediaSession.metadata?.album).toBe('');
      expect(mockMediaSession.metadata?.artwork).toHaveLength(0);
    });

    it('should generate multiple artwork sizes from single URL', () => {
      const metadata: MediaSessionMetadata = {
        title: 'Test Song',
        artwork: 'https://example.com/cover.jpg',
      };

      setMediaSessionMetadata(metadata);

      const artwork = mockMediaSession.metadata?.artwork ?? [];
      expect(artwork).toHaveLength(4);
      expect(artwork[0]).toEqual({ src: 'https://example.com/cover.jpg', sizes: '96x96', type: 'image/jpeg' });
      expect(artwork[1]).toEqual({ src: 'https://example.com/cover.jpg', sizes: '128x128', type: 'image/jpeg' });
      expect(artwork[2]).toEqual({ src: 'https://example.com/cover.jpg', sizes: '256x256', type: 'image/jpeg' });
      expect(artwork[3]).toEqual({ src: 'https://example.com/cover.jpg', sizes: '512x512', type: 'image/jpeg' });
    });

    it('should detect PNG artwork type', () => {
      const metadata: MediaSessionMetadata = {
        title: 'Test Song',
        artwork: 'https://example.com/cover.png',
      };

      setMediaSessionMetadata(metadata);

      const artwork = mockMediaSession.metadata?.artwork ?? [];
      expect(artwork[0]?.type).toBe('image/png');
    });

    it('should detect WebP artwork type', () => {
      const metadata: MediaSessionMetadata = {
        title: 'Test Song',
        artwork: 'https://example.com/cover.webp',
      };

      setMediaSessionMetadata(metadata);

      const artwork = mockMediaSession.metadata?.artwork ?? [];
      expect(artwork[0]?.type).toBe('image/webp');
    });
  });

  describe('updateMediaSessionPlaybackState', () => {
    it('should set playback state to playing', () => {
      updateMediaSessionPlaybackState('playing');
      expect(mockMediaSession.playbackState).toBe('playing');
    });

    it('should set playback state to paused', () => {
      updateMediaSessionPlaybackState('paused');
      expect(mockMediaSession.playbackState).toBe('paused');
    });

    it('should set playback state to none', () => {
      updateMediaSessionPlaybackState('none');
      expect(mockMediaSession.playbackState).toBe('none');
    });
  });

  describe('updateMediaSessionPositionState', () => {
    it('should set position state with all fields', () => {
      updateMediaSessionPositionState({
        duration: 300,
        position: 60,
        playbackRate: 1,
      });

      expect(mockMediaSession.setPositionState).toHaveBeenCalledWith({
        duration: 300,
        position: 60,
        playbackRate: 1,
      });
    });

    it('should set position state with default playback rate', () => {
      updateMediaSessionPositionState({
        duration: 300,
        position: 60,
      });

      expect(mockMediaSession.setPositionState).toHaveBeenCalledWith({
        duration: 300,
        position: 60,
        playbackRate: 1,
      });
    });

    it('should handle zero duration', () => {
      updateMediaSessionPositionState({
        duration: 0,
        position: 0,
      });

      expect(mockMediaSession.setPositionState).toHaveBeenCalledWith({
        duration: 0,
        position: 0,
        playbackRate: 1,
      });
    });
  });

  describe('setMediaSessionActionHandlers', () => {
    it('should set play action handler', () => {
      const handlers: MediaSessionActionHandlers = {
        play: vi.fn(),
      };

      setMediaSessionActionHandlers(handlers);

      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('play', handlers.play);
    });

    it('should set pause action handler', () => {
      const handlers: MediaSessionActionHandlers = {
        pause: vi.fn(),
      };

      setMediaSessionActionHandlers(handlers);

      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('pause', handlers.pause);
    });

    it('should set all action handlers', () => {
      const handlers: MediaSessionActionHandlers = {
        play: vi.fn(),
        pause: vi.fn(),
        seekbackward: vi.fn(),
        seekforward: vi.fn(),
        previoustrack: vi.fn(),
        nexttrack: vi.fn(),
        stop: vi.fn(),
        seekto: vi.fn(),
      };

      setMediaSessionActionHandlers(handlers);

      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('play', handlers.play);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('pause', handlers.pause);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekbackward', handlers.seekbackward);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekforward', handlers.seekforward);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('previoustrack', handlers.previoustrack);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('nexttrack', handlers.nexttrack);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('stop', handlers.stop);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekto', handlers.seekto);
    });

    it('should clear handlers when undefined', () => {
      const handlers: MediaSessionActionHandlers = {
        play: undefined,
        pause: undefined,
      };

      setMediaSessionActionHandlers(handlers);

      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('play', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('pause', null);
    });
  });

  describe('clearMediaSession', () => {
    it('should clear metadata', () => {
      mockMediaSession.metadata = new MediaMetadata({ title: 'Test' });
      
      clearMediaSession();

      expect(mockMediaSession.metadata).toBeNull();
    });

    it('should set playback state to none', () => {
      mockMediaSession.playbackState = 'playing';
      
      clearMediaSession();

      expect(mockMediaSession.playbackState).toBe('none');
    });

    it('should clear all action handlers', () => {
      clearMediaSession();

      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('play', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('pause', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekbackward', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekforward', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('previoustrack', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('nexttrack', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('stop', null);
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith('seekto', null);
    });
  });

  describe('browser compatibility', () => {
    it('should handle missing mediaSession gracefully', () => {
      // Remove mediaSession by deleting the property
      delete (navigator as { mediaSession?: unknown }).mediaSession;
      
      // Also unstub MediaMetadata to simulate missing API
      vi.unstubAllGlobals();

      // These should not throw
      expect(() => setMediaSessionMetadata({ title: 'Test' })).not.toThrow();
      expect(() => updateMediaSessionPlaybackState('playing')).not.toThrow();
      expect(() => updateMediaSessionPositionState({ duration: 100, position: 0 })).not.toThrow();
      expect(() => setMediaSessionActionHandlers({ play: vi.fn() })).not.toThrow();
      expect(() => clearMediaSession()).not.toThrow();
    });

    it('should handle missing MediaMetadata constructor gracefully', () => {
      vi.unstubAllGlobals();
      
      // This should not throw even without MediaMetadata
      expect(() => setMediaSessionMetadata({ title: 'Test' })).not.toThrow();
    });
  });
});
