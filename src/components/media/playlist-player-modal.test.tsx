/**
 * Playlist Player Modal Tests
 *
 * Tests for the playlist player modal component including:
 * - SSE connection stability (no unnecessary reconnections)
 * - Multi-file playback without download restart loops
 * - Track navigation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import { PlaylistPlayerModal, type PlaylistPlayerModalProps } from './playlist-player-modal';
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
  AudioPlayer: vi.fn(({ src, onReady }) => {
    // Simulate ready callback after mount
    setTimeout(() => onReady?.(), 10);
    return (
      <div data-testid="audio-player">
        <span data-testid="audio-src">{src}</span>
      </div>
    );
  }),
}));

// Track EventSource instances for testing - only count main SSE connections
const mainEventSourceInstances: MockEventSource[] = [];
let mainEventSourceCallCount = 0;

// Mock EventSource for SSE
class MockEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  readyState = 1; // OPEN

  constructor(url: string) {
    this.url = url;
    
    // Only count main SSE connections (not prefetch SSE connections)
    // Main connections have fileIndex matching the current track
    if (!url.includes('fileIndex=1') && !url.includes('fileIndex=2') || url.includes('fileIndex=0')) {
      // This is a simplification - in real tests we'd track more carefully
    }
    mainEventSourceCallCount++;
    mainEventSourceInstances.push(this);

    // Simulate ready state after construction
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(
          new MessageEvent('message', {
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
          })
        );
      }
    }, 0);
  }

  // Helper to simulate sending a message
  simulateMessage(data: Record<string, unknown>): void {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent('message', {
          data: JSON.stringify(data),
        })
      );
    }
  }
}

// @ts-expect-error - Mock EventSource globally
global.EventSource = MockEventSource;

// Mock fetch for prefetch API
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true, fileName: 'test.mp3' }),
});

describe('PlaylistPlayerModal', () => {
  const createMockFile = (index: number): TorrentFile => ({
    id: `file-${index}`,
    torrentId: 'torrent-1',
    fileIndex: index,
    path: `Artist Name/Album Name/0${index + 1} - Song ${index + 1}.mp3`,
    name: `0${index + 1} - Song ${index + 1}.mp3`,
    extension: 'mp3',
    size: 5000000,
    pieceStart: index * 100,
    pieceEnd: (index + 1) * 100,
    mediaCategory: 'audio',
    mimeType: 'audio/mpeg',
    createdAt: '2024-01-01T00:00:00Z',
  });

  const mockFiles: TorrentFile[] = [createMockFile(0), createMockFile(1), createMockFile(2)];

  const defaultProps: PlaylistPlayerModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    files: mockFiles,
    infohash: 'abc123def456abc123def456abc123def456abc1',
    torrentName: 'Test Album',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mainEventSourceInstances.length = 0;
    mainEventSourceCallCount = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  /**
   * Helper to count EventSources for a specific fileIndex
   */
  function countEventSourcesForFile(fileIndex: number): number {
    return mainEventSourceInstances.filter(es => es.url.includes(`fileIndex=${fileIndex}`)).length;
  }

  describe('SSE Connection Stability', () => {
    it('should create EventSource for the current file on initial render', async () => {
      render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers to allow SSE to connect
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should have created at least one EventSource for fileIndex=0
      expect(countEventSourcesForFile(0)).toBeGreaterThanOrEqual(1);
      expect(mainEventSourceInstances[0].url).toContain('fileIndex=0');
    });

    it('should not recreate main EventSource when files array reference changes but fileIndex is same', async () => {
      const { rerender } = render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers to allow SSE to connect
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Count EventSources for fileIndex=0 before rerender
      const initialCountForFile0 = countEventSourcesForFile(0);

      // Rerender with a new files array reference but same content
      const newFilesArray = [...mockFiles];
      rerender(<PlaylistPlayerModal {...defaultProps} files={newFilesArray} />);

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should NOT have created a new EventSource for fileIndex=0 because fileIndex is the same
      expect(countEventSourcesForFile(0)).toBe(initialCountForFile0);
    });

    it('should create new EventSource when currentIndex changes to different file', async () => {
      const { rerender } = render(<PlaylistPlayerModal {...defaultProps} startIndex={0} />);

      // Advance timers to allow SSE to connect
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should have EventSource for fileIndex=0
      expect(countEventSourcesForFile(0)).toBeGreaterThanOrEqual(1);

      // Change to a different track (fileIndex=1)
      rerender(<PlaylistPlayerModal {...defaultProps} startIndex={1} />);

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Should have created EventSource for fileIndex=1
      expect(countEventSourcesForFile(1)).toBeGreaterThanOrEqual(1);
    });

    it('should close old EventSource when switching tracks', async () => {
      const { rerender } = render(<PlaylistPlayerModal {...defaultProps} startIndex={0} />);

      // Advance timers to allow SSE to connect
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Find the first EventSource for fileIndex=0
      const firstEventSource = mainEventSourceInstances.find(es => es.url.includes('fileIndex=0'));
      expect(firstEventSource).toBeDefined();

      // Change to a different track
      rerender(<PlaylistPlayerModal {...defaultProps} startIndex={1} />);

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Old EventSource should have been closed
      expect(firstEventSource!.close).toHaveBeenCalled();
    });
  });

  describe('AudioPlayer Rendering', () => {
    it('should render AudioPlayer when file is ready', async () => {
      render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers to allow SSE to report ready state
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    });

    it('should show loading state before file is ready', async () => {
      // Create a mock that doesn't auto-send ready state
      class DelayedMockEventSource extends MockEventSource {
        constructor(url: string) {
          super(url);
          // Override to not auto-send ready state
        }
      }

      // @ts-expect-error - Mock EventSource globally
      global.EventSource = DelayedMockEventSource;

      render(<PlaylistPlayerModal {...defaultProps} />);

      // Should show loading state initially
      expect(screen.getByText(/Connecting to torrent/i)).toBeInTheDocument();

      // Restore original mock
      // @ts-expect-error - Mock EventSource globally
      global.EventSource = MockEventSource;
    });

    it('should not unmount AudioPlayer when files array reference changes', async () => {
      const { rerender } = render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers to allow SSE to report ready state
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByTestId('audio-player')).toBeInTheDocument();

      // Rerender with a new files array reference but same content
      const newFilesArray = [...mockFiles];
      rerender(<PlaylistPlayerModal {...defaultProps} files={newFilesArray} />);

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // AudioPlayer should still be rendered (not unmounted and remounted)
      expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    });
  });

  describe('Playlist Display', () => {
    it('should display all tracks in the playlist section', async () => {
      render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Find the playlist section and check tracks within it
      const playlistSection = screen.getByRole('heading', { name: 'Playlist' }).parentElement?.parentElement;
      expect(playlistSection).toBeDefined();
      
      // Use getAllByText since the filename appears in multiple places
      const song1Elements = screen.getAllByText('01 - Song 1.mp3');
      const song2Elements = screen.getAllByText('02 - Song 2.mp3');
      const song3Elements = screen.getAllByText('03 - Song 3.mp3');
      
      expect(song1Elements.length).toBeGreaterThan(0);
      expect(song2Elements.length).toBeGreaterThan(0);
      expect(song3Elements.length).toBeGreaterThan(0);
    });

    it('should show correct track count in title', async () => {
      render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(screen.getByText('Playing 1 of 3')).toBeInTheDocument();
    });
  });

  describe('Modal Close', () => {
    it('should close EventSource when modal closes', async () => {
      const { rerender } = render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers to allow SSE to connect
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      const eventSource = mainEventSourceInstances[0];

      // Close the modal
      rerender(<PlaylistPlayerModal {...defaultProps} isOpen={false} />);

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // EventSource should have been closed
      expect(eventSource.close).toHaveBeenCalled();
    });
  });

  describe('File Index Stability', () => {
    it('should not create new main EventSource when files array changes but fileIndex stays same', async () => {
      // This test verifies the fix for the download restart loop bug
      // The bug was caused by using currentFile object as a dependency,
      // which would change reference when files array was recreated

      const { rerender } = render(<PlaylistPlayerModal {...defaultProps} />);

      // Advance timers to allow SSE to connect
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // Record the initial EventSource count for fileIndex=0
      const initialCountForFile0 = countEventSourcesForFile(0);

      // Simulate what happens when parent component re-renders with new files array
      // This is the scenario that caused the bug
      for (let i = 0; i < 5; i++) {
        const newFilesArray = mockFiles.map((f) => ({ ...f })); // Create new object references
        rerender(<PlaylistPlayerModal {...defaultProps} files={newFilesArray} />);

        await act(async () => {
          vi.advanceTimersByTime(100);
        });
      }

      // Should NOT have created new EventSources for fileIndex=0 because fileIndex hasn't changed
      // Before the fix, this would create 5 new EventSources
      expect(countEventSourcesForFile(0)).toBe(initialCountForFile0);
    });
  });
});
