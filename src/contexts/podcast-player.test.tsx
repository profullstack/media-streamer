/**
 * Podcast Player Context Tests
 *
 * Tests for the global podcast player context that persists across routes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PodcastPlayerProvider, usePodcastPlayer } from './podcast-player';

// Mock HTMLAudioElement
class MockAudioElement {
  src = '';
  currentTime = 0;
  duration = 0;
  paused = true;
  
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  
  play = vi.fn().mockImplementation(() => {
    this.paused = false;
    this.dispatchEvent('play');
    return Promise.resolve();
  });
  
  pause = vi.fn().mockImplementation(() => {
    this.paused = true;
    this.dispatchEvent('pause');
  });
  
  load = vi.fn();
  
  addEventListener(event: string, listener: EventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }
  
  removeEventListener(event: string, listener: EventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }
  
  dispatchEvent(event: string): void {
    this.eventListeners.get(event)?.forEach(listener => {
      listener(new Event(event));
    });
  }
  
  // Simulate time update
  simulateTimeUpdate(time: number): void {
    this.currentTime = time;
    this.dispatchEvent('timeupdate');
  }
  
  // Simulate duration change
  simulateDurationChange(duration: number): void {
    this.duration = duration;
    this.dispatchEvent('durationchange');
  }
  
  // Simulate loaded metadata
  simulateLoadedMetadata(duration: number): void {
    this.duration = duration;
    this.dispatchEvent('loadedmetadata');
  }
  
  // Simulate ended
  simulateEnded(): void {
    this.paused = true;
    this.dispatchEvent('ended');
  }
}

// Test component that uses the context
function TestConsumer(): React.ReactElement {
  const {
    currentEpisode,
    currentPodcast,
    isPlaying,
    currentTime,
    duration,
    playEpisode,
    togglePlayPause,
    seek,
    stop,
  } = usePodcastPlayer();
  
  return (
    <div>
      <div data-testid="episode-title">{currentEpisode?.title ?? 'No episode'}</div>
      <div data-testid="podcast-title">{currentPodcast?.title ?? 'No podcast'}</div>
      <div data-testid="is-playing">{isPlaying ? 'playing' : 'paused'}</div>
      <div data-testid="current-time">{currentTime}</div>
      <div data-testid="duration">{duration}</div>
      <button
        data-testid="play-episode"
        onClick={() => playEpisode(
          {
            id: 'ep-1',
            guid: 'guid-1',
            title: 'Test Episode',
            description: 'Test description',
            audioUrl: 'https://example.com/audio.mp3',
            duration: 3600,
            publishedAt: '2024-01-01T00:00:00Z',
            imageUrl: 'https://example.com/episode.jpg',
          },
          {
            id: 'pod-1',
            title: 'Test Podcast',
            author: 'Test Author',
            description: 'Test podcast description',
            imageUrl: 'https://example.com/podcast.jpg',
            feedUrl: 'https://example.com/feed.xml',
            website: null,
            subscribedAt: '2024-01-01T00:00:00Z',
            notificationsEnabled: false,
          }
        )}
      >
        Play Episode
      </button>
      <button data-testid="toggle-play" onClick={togglePlayPause}>Toggle</button>
      <button data-testid="seek" onClick={() => seek(100)}>Seek to 100</button>
      <button data-testid="stop" onClick={stop}>Stop</button>
    </div>
  );
}

describe('PodcastPlayerContext', () => {
  let mockAudio: MockAudioElement;
  let originalAudio: typeof Audio;
  
  beforeEach(() => {
    mockAudio = new MockAudioElement();
    originalAudio = global.Audio;
    global.Audio = vi.fn(() => mockAudio) as unknown as typeof Audio;
  });
  
  afterEach(() => {
    global.Audio = originalAudio;
    vi.clearAllMocks();
  });
  
  describe('Initial State', () => {
    it('should have no episode playing initially', () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      expect(screen.getByTestId('episode-title')).toHaveTextContent('No episode');
      expect(screen.getByTestId('podcast-title')).toHaveTextContent('No podcast');
      expect(screen.getByTestId('is-playing')).toHaveTextContent('paused');
      expect(screen.getByTestId('current-time')).toHaveTextContent('0');
      expect(screen.getByTestId('duration')).toHaveTextContent('0');
    });
  });
  
  describe('playEpisode', () => {
    it('should set current episode and podcast when playing', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      expect(screen.getByTestId('episode-title')).toHaveTextContent('Test Episode');
      expect(screen.getByTestId('podcast-title')).toHaveTextContent('Test Podcast');
    });
    
    it('should set audio source and call play', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      expect(mockAudio.src).toBe('https://example.com/audio.mp3');
      expect(mockAudio.play).toHaveBeenCalled();
    });
    
    it('should update isPlaying state when audio plays', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      expect(screen.getByTestId('is-playing')).toHaveTextContent('playing');
    });
  });
  
  describe('togglePlayPause', () => {
    it('should pause when playing', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      // Start playing
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      expect(screen.getByTestId('is-playing')).toHaveTextContent('playing');
      
      // Toggle to pause
      await act(async () => {
        fireEvent.click(screen.getByTestId('toggle-play'));
      });
      
      expect(mockAudio.pause).toHaveBeenCalled();
      expect(screen.getByTestId('is-playing')).toHaveTextContent('paused');
    });
    
    it('should play when paused', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      // Start playing
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      // Pause
      await act(async () => {
        fireEvent.click(screen.getByTestId('toggle-play'));
      });
      
      // Clear mock to check next call
      mockAudio.play.mockClear();
      
      // Play again
      await act(async () => {
        fireEvent.click(screen.getByTestId('toggle-play'));
      });
      
      expect(mockAudio.play).toHaveBeenCalled();
    });
  });
  
  describe('Time Updates', () => {
    it('should update currentTime on timeupdate event', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      await act(async () => {
        mockAudio.simulateTimeUpdate(150);
      });
      
      expect(screen.getByTestId('current-time')).toHaveTextContent('150');
    });
    
    it('should update duration on durationchange event', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      await act(async () => {
        mockAudio.simulateDurationChange(3600);
      });
      
      expect(screen.getByTestId('duration')).toHaveTextContent('3600');
    });
    
    it('should update duration on loadedmetadata event', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      await act(async () => {
        mockAudio.simulateLoadedMetadata(1800);
      });
      
      expect(screen.getByTestId('duration')).toHaveTextContent('1800');
    });
  });
  
  describe('seek', () => {
    it('should set audio currentTime when seeking', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('seek'));
      });
      
      expect(mockAudio.currentTime).toBe(100);
    });
  });
  
  describe('stop', () => {
    it('should clear episode and podcast when stopped', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      expect(screen.getByTestId('episode-title')).toHaveTextContent('Test Episode');
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('stop'));
      });
      
      expect(screen.getByTestId('episode-title')).toHaveTextContent('No episode');
      expect(screen.getByTestId('podcast-title')).toHaveTextContent('No podcast');
      expect(screen.getByTestId('is-playing')).toHaveTextContent('paused');
    });
    
    it('should pause audio when stopped', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      mockAudio.pause.mockClear();
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('stop'));
      });
      
      expect(mockAudio.pause).toHaveBeenCalled();
    });
  });
  
  describe('Audio Ended', () => {
    it('should set isPlaying to false when audio ends', async () => {
      render(
        <PodcastPlayerProvider>
          <TestConsumer />
        </PodcastPlayerProvider>
      );
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('play-episode'));
      });
      
      expect(screen.getByTestId('is-playing')).toHaveTextContent('playing');
      
      await act(async () => {
        mockAudio.simulateEnded();
      });
      
      expect(screen.getByTestId('is-playing')).toHaveTextContent('paused');
    });
  });
  
  describe('usePodcastPlayer outside provider', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        render(<TestConsumer />);
      }).toThrow('usePodcastPlayer must be used within a PodcastPlayerProvider');
      
      consoleSpy.mockRestore();
    });
  });
});
