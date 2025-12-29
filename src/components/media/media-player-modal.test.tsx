/**
 * Media Player Modal Tests
 * 
 * Tests for enhanced metadata display functionality including:
 * - Artist, album, song display in "Artist → Album → Song" format
 * - Cover art display
 * - Media Session API integration for iOS lock screen and CarPlay
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MediaPlayerModal, type MediaPlayerModalProps } from './media-player-modal';
import type { TorrentFile } from '@/types';

// Mock the media-session module
vi.mock('@/lib/media-session', () => ({
  setMediaSessionMetadata: vi.fn(),
  updateMediaSessionPlaybackState: vi.fn(),
  updateMediaSessionPositionState: vi.fn(),
  setMediaSessionActionHandlers: vi.fn(),
  clearMediaSession: vi.fn(),
}));

// Mock the audio player to avoid actual audio loading
vi.mock('@/components/audio/audio-player', () => ({
  AudioPlayer: vi.fn(({ title, artist, album, coverArt }) => (
    <div data-testid="audio-player">
      <span data-testid="audio-title">{title}</span>
      <span data-testid="audio-artist">{artist}</span>
      <span data-testid="audio-album">{album}</span>
      <span data-testid="audio-cover">{coverArt}</span>
    </div>
  )),
}));

// Mock the video player
vi.mock('@/components/video/video-player', () => ({
  VideoPlayer: vi.fn(() => <div data-testid="video-player" />),
}));

// Track EventSource instances for testing
let eventSourceInstances: MockEventSource[] = [];
let eventSourceConstructorCalls: string[] = [];

// Mock EventSource for SSE
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  url: string;
  
  constructor(url: string) {
    this.url = url;
    eventSourceInstances.push(this);
    eventSourceConstructorCalls.push(url);
    
    // Simulate ready state after construction
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            stage: 'ready',
            message: 'Ready to stream',
            numPeers: 5,
            progress: 1,
            fileProgress: 1,
            downloadSpeed: 1024,
            uploadSpeed: 512,
            ready: true,
            fileReady: true,
            timestamp: Date.now(),
          }),
        }));
      }
    }, 0);
  }
}

// @ts-expect-error - Mock EventSource globally
global.EventSource = MockEventSource;

describe('MediaPlayerModal', () => {
  const mockFile: TorrentFile = {
    id: 'file-1',
    torrentId: 'torrent-1',
    fileIndex: 0,
    path: 'Artist Name/Album Name/01 - Song Title.mp3',
    name: '01 - Song Title.mp3',
    extension: 'mp3',
    size: 5000000,
    pieceStart: 0,
    pieceEnd: 100,
    mediaCategory: 'audio',
    mimeType: 'audio/mpeg',
    createdAt: '2024-01-01T00:00:00Z',
  };

  const defaultProps: MediaPlayerModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    file: mockFile,
    infohash: 'abc123def456',
    torrentName: 'Test Album',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset EventSource tracking
    eventSourceInstances = [];
    eventSourceConstructorCalls = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Metadata Display', () => {
    it('should pass artist metadata to AudioPlayer', async () => {
      render(
        <MediaPlayerModal
          {...defaultProps}
          artist="Test Artist"
        />
      );

      // Wait for SSE to trigger ready state
      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-artist')).toHaveTextContent('Test Artist');
    });

    it('should pass album metadata to AudioPlayer', async () => {
      render(
        <MediaPlayerModal
          {...defaultProps}
          album="Test Album"
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-album')).toHaveTextContent('Test Album');
    });

    it('should pass coverArt URL to AudioPlayer', async () => {
      render(
        <MediaPlayerModal
          {...defaultProps}
          coverArt="https://example.com/cover.jpg"
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-cover')).toHaveTextContent('https://example.com/cover.jpg');
    });

    it('should pass title extracted from filename to AudioPlayer', async () => {
      render(
        <MediaPlayerModal
          {...defaultProps}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // Title should be extracted from filename "01 - Song Title.mp3" -> "Song Title"
      expect(screen.getByTestId('audio-title')).toHaveTextContent('Song Title');
    });

    it('should display metadata header with Artist → Album → Song format', async () => {
      render(
        <MediaPlayerModal
          {...defaultProps}
          artist="Test Artist"
          album="Test Album"
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // Check for metadata header display
      const metadataHeader = screen.getByTestId('metadata-header');
      expect(metadataHeader).toBeInTheDocument();
      expect(metadataHeader).toHaveTextContent('Test Artist');
      expect(metadataHeader).toHaveTextContent('Test Album');
    });

    it('should display cover art image when provided', async () => {
      render(
        <MediaPlayerModal
          {...defaultProps}
          coverArt="https://example.com/cover.jpg"
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      const coverImage = screen.getByTestId('cover-art-image');
      expect(coverImage).toBeInTheDocument();
      expect(coverImage).toHaveAttribute('src', 'https://example.com/cover.jpg');
    });

    it('should display placeholder when no cover art is provided', async () => {
      render(
        <MediaPlayerModal
          {...defaultProps}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      const placeholder = screen.getByTestId('cover-art-placeholder');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('Track Info Extraction', () => {
    it('should extract track number and title from "01 - Track Name.mp3" format', async () => {
      const fileWithTrackNum: TorrentFile = {
        ...mockFile,
        name: '05 - My Favorite Song.mp3',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={fileWithTrackNum}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-title')).toHaveTextContent('My Favorite Song');
    });

    it('should extract title from "01. Track Name.mp3" format', async () => {
      const fileWithDot: TorrentFile = {
        ...mockFile,
        name: '03. Another Song.mp3',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={fileWithDot}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-title')).toHaveTextContent('Another Song');
    });

    it('should use filename as title when no pattern matches', async () => {
      const fileNoPattern: TorrentFile = {
        ...mockFile,
        name: 'random_song_name.mp3',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={fileNoPattern}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-title')).toHaveTextContent('random_song_name');
    });
  });

  describe('Album Extraction from Path', () => {
    it('should extract album name from file path', async () => {
      const fileWithPath: TorrentFile = {
        ...mockFile,
        path: 'Pink Floyd/The Dark Side of the Moon/01 - Speak to Me.mp3',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={fileWithPath}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // When no album prop is provided, should extract from path
      expect(screen.getByTestId('audio-album')).toHaveTextContent('The Dark Side of the Moon');
    });

    it('should prefer explicit album prop over path extraction', async () => {
      const fileWithPath: TorrentFile = {
        ...mockFile,
        path: 'Pink Floyd/The Dark Side of the Moon/01 - Speak to Me.mp3',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={fileWithPath}
          album="Explicit Album Name"
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-album')).toHaveTextContent('Explicit Album Name');
    });
  });

  describe('Artist Extraction from Path', () => {
    it('should extract artist name from file path when not provided', async () => {
      const fileWithPath: TorrentFile = {
        ...mockFile,
        path: 'Pink Floyd/The Dark Side of the Moon/01 - Speak to Me.mp3',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={fileWithPath}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // When no artist prop is provided, should extract from path
      expect(screen.getByTestId('audio-artist')).toHaveTextContent('Pink Floyd');
    });

    it('should prefer explicit artist prop over path extraction', async () => {
      const fileWithPath: TorrentFile = {
        ...mockFile,
        path: 'Pink Floyd/The Dark Side of the Moon/01 - Speak to Me.mp3',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={fileWithPath}
          artist="Explicit Artist"
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(screen.getByTestId('audio-artist')).toHaveTextContent('Explicit Artist');
    });
  });

  describe('SSE Connection Stability', () => {
    it('should not recreate EventSource when file object reference changes but fileIndex stays the same', async () => {
      const file1: TorrentFile = {
        ...mockFile,
        fileIndex: 0,
      };

      const file2: TorrentFile = {
        ...mockFile,
        fileIndex: 0, // Same fileIndex
      };

      const { rerender } = render(
        <MediaPlayerModal
          {...defaultProps}
          file={file1}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // Should have created exactly one EventSource
      const initialCount = eventSourceConstructorCalls.length;
      expect(initialCount).toBe(1);

      // Rerender with a new file object reference but same fileIndex
      rerender(
        <MediaPlayerModal
          {...defaultProps}
          file={file2}
        />
      );

      // Wait a tick for any potential effect re-runs
      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // Should NOT have created a new EventSource since fileIndex is the same
      expect(eventSourceConstructorCalls.length).toBe(initialCount);
    });

    it('should create new EventSource when fileIndex changes', async () => {
      const file1: TorrentFile = {
        ...mockFile,
        fileIndex: 0,
      };

      const file2: TorrentFile = {
        ...mockFile,
        fileIndex: 1, // Different fileIndex
      };

      const { rerender } = render(
        <MediaPlayerModal
          {...defaultProps}
          file={file1}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      const initialCount = eventSourceConstructorCalls.length;
      expect(initialCount).toBe(1);

      // Rerender with a different fileIndex
      rerender(
        <MediaPlayerModal
          {...defaultProps}
          file={file2}
        />
      );

      // Wait for the new SSE connection
      await vi.waitFor(() => {
        expect(eventSourceConstructorCalls.length).toBe(initialCount + 1);
      });

      // Verify the new URL has the correct fileIndex
      const lastUrl = eventSourceConstructorCalls[eventSourceConstructorCalls.length - 1];
      expect(lastUrl).toContain('fileIndex=1');
    });

    it('should close EventSource when modal closes', async () => {
      const { rerender } = render(
        <MediaPlayerModal
          {...defaultProps}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      expect(eventSourceInstances.length).toBe(1);
      const eventSource = eventSourceInstances[0];

      // Close the modal
      rerender(
        <MediaPlayerModal
          {...defaultProps}
          isOpen={false}
        />
      );

      // EventSource should be closed
      expect(eventSource.close).toHaveBeenCalled();
    });

    it('should maintain stable connection during parent re-renders', async () => {
      // Simulate a parent component that re-renders frequently
      const { rerender } = render(
        <MediaPlayerModal
          {...defaultProps}
          file={mockFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      const initialCount = eventSourceConstructorCalls.length;

      // Simulate multiple parent re-renders with new file object references
      for (let i = 0; i < 5; i++) {
        const newFileRef: TorrentFile = {
          ...mockFile,
          fileIndex: 0, // Same fileIndex
        };

        rerender(
          <MediaPlayerModal
            {...defaultProps}
            file={newFileRef}
          />
        );
      }

      // Wait a tick
      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // Should still have only the initial EventSource connection
      expect(eventSourceConstructorCalls.length).toBe(initialCount);
    });
  });
});
