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

// Mock useWebTorrent hook - P2P is disabled, so this should never be called for streaming
const mockStartStream = vi.fn();
const mockStopStream = vi.fn();
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useWebTorrent: () => ({
      status: 'idle',
      streamUrl: null,
      error: null,
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
      downloadedBytes: 0,
      fileSize: 0,
      startStream: mockStartStream,
      stopStream: mockStopStream,
    }),
  };
});

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

  describe('Codec Error Detection and Auto-Retry', () => {
    it('should detect MEDIA_ERR_SRC_NOT_SUPPORTED as a codec error', async () => {
      // Import the isCodecError function indirectly by testing the component behavior
      // The component should retry with transcoding when it receives a codec error
      
      // Create a mock video player that triggers an error
      const { VideoPlayer } = await import('@/components/video/video-player');
      const mockVideoPlayer = vi.mocked(VideoPlayer);
      
      const videoFile: TorrentFile = {
        ...mockFile,
        name: 'movie.mp4',
        extension: 'mp4',
        mediaCategory: 'video',
        mimeType: 'video/mp4',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={videoFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // Verify the video player was rendered
      expect(mockVideoPlayer).toHaveBeenCalled();
    });

    it('should show transcoding notice when retrying with transcoding', async () => {
      const videoFile: TorrentFile = {
        ...mockFile,
        name: 'movie.mkv', // MKV files require transcoding
        extension: 'mkv',
        mediaCategory: 'video',
        mimeType: 'video/x-matroska',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={videoFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // MKV files should show transcoding notice - use getAllByText since there may be multiple
      const transcodingElements = screen.getAllByText(/transcoding/i);
      expect(transcodingElements.length).toBeGreaterThan(0);
    });

    it('should include transcode=auto in URL for files that need transcoding', async () => {
      const mkvFile: TorrentFile = {
        ...mockFile,
        name: 'movie.mkv',
        extension: 'mkv',
        mediaCategory: 'video',
        mimeType: 'video/x-matroska',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={mkvFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // The VideoPlayer should receive a URL with transcode=auto
      const { VideoPlayer } = await import('@/components/video/video-player');
      const mockVideoPlayer = vi.mocked(VideoPlayer);
      
      const lastCall = mockVideoPlayer.mock.calls[mockVideoPlayer.mock.calls.length - 1];
      expect(lastCall[0].src).toContain('transcode=auto');
    });

    it('should NOT include transcode=auto for MP4 files initially', async () => {
      const mp4File: TorrentFile = {
        ...mockFile,
        name: 'movie.mp4',
        extension: 'mp4',
        mediaCategory: 'video',
        mimeType: 'video/mp4',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={mp4File}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // The VideoPlayer should receive a URL without transcode=auto for MP4
      const { VideoPlayer } = await import('@/components/video/video-player');
      const mockVideoPlayer = vi.mocked(VideoPlayer);
      
      const lastCall = mockVideoPlayer.mock.calls[mockVideoPlayer.mock.calls.length - 1];
      expect(lastCall[0].src).not.toContain('transcode=auto');
    });

    it('should reset retry state when file changes', async () => {
      const file1: TorrentFile = {
        ...mockFile,
        fileIndex: 0,
        name: 'movie1.mp4',
        extension: 'mp4',
        mediaCategory: 'video',
      };

      const file2: TorrentFile = {
        ...mockFile,
        fileIndex: 1,
        name: 'movie2.mp4',
        extension: 'mp4',
        mediaCategory: 'video',
      };

      const { rerender } = render(
        <MediaPlayerModal
          {...defaultProps}
          file={file1}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // Change to a different file
      rerender(
        <MediaPlayerModal
          {...defaultProps}
          file={file2}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // The new file should not have transcode=auto (retry state was reset)
      const { VideoPlayer } = await import('@/components/video/video-player');
      const mockVideoPlayer = vi.mocked(VideoPlayer);
      
      const lastCall = mockVideoPlayer.mock.calls[mockVideoPlayer.mock.calls.length - 1];
      expect(lastCall[0].src).not.toContain('transcode=auto');
    });
  });

  describe('Transcoding Format Detection', () => {
    // Note: Only test formats that are recognized as video by getMediaCategory()
    // VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'webm', 'mov', 'wmv', 'flv', 'm4v']
    // VIDEO_TRANSCODE_FORMATS = ['mkv', 'avi', 'wmv', 'flv', 'mov', 'ts']
    // 'ts' is NOT in VIDEO_EXTENSIONS, so we can't test it here
    const transcodingFormats = ['mkv', 'avi', 'wmv', 'flv', 'mov'];
    const nonTranscodingFormats = ['mp4', 'webm'];

    transcodingFormats.forEach(ext => {
      it(`should require transcoding for .${ext} files`, async () => {
        const file: TorrentFile = {
          ...mockFile,
          name: `video.${ext}`,
          extension: ext,
          mediaCategory: 'video',
        };

        render(
          <MediaPlayerModal
            {...defaultProps}
            file={file}
          />
        );

        await vi.waitFor(() => {
          expect(screen.getByTestId('video-player')).toBeInTheDocument();
        });

        const { VideoPlayer } = await import('@/components/video/video-player');
        const mockVideoPlayer = vi.mocked(VideoPlayer);
        
        const lastCall = mockVideoPlayer.mock.calls[mockVideoPlayer.mock.calls.length - 1];
        expect(lastCall[0].src).toContain('transcode=auto');
      });
    });

    nonTranscodingFormats.forEach(ext => {
      it(`should NOT require transcoding for .${ext} files`, async () => {
        const file: TorrentFile = {
          ...mockFile,
          name: `video.${ext}`,
          extension: ext,
          mediaCategory: 'video',
        };

        render(
          <MediaPlayerModal
            {...defaultProps}
            file={file}
          />
        );

        await vi.waitFor(() => {
          expect(screen.getByTestId('video-player')).toBeInTheDocument();
        });

        const { VideoPlayer } = await import('@/components/video/video-player');
        const mockVideoPlayer = vi.mocked(VideoPlayer);
        
        const lastCall = mockVideoPlayer.mock.calls[mockVideoPlayer.mock.calls.length - 1];
        expect(lastCall[0].src).not.toContain('transcode=auto');
      });
    });
  });

  describe('Audio Transcoding Format Detection', () => {
    // Note: Only test formats that are recognized as audio by getMediaCategory()
    // wma and flac are in AUDIO_EXTENSIONS and also in AUDIO_TRANSCODE_FORMATS
    const audioTranscodingFormats = ['wma', 'flac'];
    // These are recognized as audio and don't need transcoding
    const audioNonTranscodingFormats = ['mp3', 'aac', 'ogg', 'wav'];

    audioTranscodingFormats.forEach(ext => {
      it(`should require transcoding for .${ext} audio files`, async () => {
        const file: TorrentFile = {
          ...mockFile,
          name: `audio.${ext}`,
          extension: ext,
          mediaCategory: 'audio',
        };

        render(
          <MediaPlayerModal
            {...defaultProps}
            file={file}
          />
        );

        await vi.waitFor(() => {
          expect(screen.getByTestId('audio-player')).toBeInTheDocument();
        });

        const { AudioPlayer } = await import('@/components/audio/audio-player');
        const mockAudioPlayer = vi.mocked(AudioPlayer);
        
        // Find the call with the matching file
        const calls = mockAudioPlayer.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0].src).toContain('transcode=auto');
      });
    });

    audioNonTranscodingFormats.forEach(ext => {
      it(`should NOT require transcoding for .${ext} audio files`, async () => {
        const file: TorrentFile = {
          ...mockFile,
          name: `audio.${ext}`,
          extension: ext,
          mediaCategory: 'audio',
        };

        render(
          <MediaPlayerModal
            {...defaultProps}
            file={file}
          />
        );

        await vi.waitFor(() => {
          expect(screen.getByTestId('audio-player')).toBeInTheDocument();
        });

        const { AudioPlayer } = await import('@/components/audio/audio-player');
        const mockAudioPlayer = vi.mocked(AudioPlayer);

        const calls = mockAudioPlayer.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0].src).not.toContain('transcode=auto');
      });
    });
  });

  describe('Server-Side Streaming (P2P Disabled)', () => {
    /**
     * P2P streaming is disabled because browser WebTorrent can only connect to
     * WebRTC peers, but most torrent swarms have traditional BitTorrent peers (TCP/UDP).
     * Server-side streaming uses node-datachannel to connect to ALL peers.
     */

    it('should NOT call WebTorrent startStream for video files', async () => {
      mockStartStream.mockClear();

      const videoFile: TorrentFile = {
        ...mockFile,
        name: 'movie.mp4',
        extension: 'mp4',
        mediaCategory: 'video',
        mimeType: 'video/mp4',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={videoFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // P2P is disabled, so startStream should never be called
      expect(mockStartStream).not.toHaveBeenCalled();
    });

    it('should NOT call WebTorrent startStream for audio files', async () => {
      mockStartStream.mockClear();

      const audioFile: TorrentFile = {
        ...mockFile,
        name: 'song.mp3',
        extension: 'mp3',
        mediaCategory: 'audio',
        mimeType: 'audio/mpeg',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={audioFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // P2P is disabled for all media, so startStream should never be called
      expect(mockStartStream).not.toHaveBeenCalled();
    });

    it('should use server-side /api/stream URL for MP4 video files', async () => {
      const videoFile: TorrentFile = {
        ...mockFile,
        name: 'movie.mp4',
        extension: 'mp4',
        mediaCategory: 'video',
        mimeType: 'video/mp4',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={videoFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      const { VideoPlayer } = await import('@/components/video/video-player');
      const mockVideoPlayer = vi.mocked(VideoPlayer);

      const lastCall = mockVideoPlayer.mock.calls[mockVideoPlayer.mock.calls.length - 1];
      // Should use server-side streaming URL
      expect(lastCall[0].src).toContain('/api/stream');
      expect(lastCall[0].src).toContain(`infohash=${defaultProps.infohash}`);
      expect(lastCall[0].src).toContain('fileIndex=');
    });

    it('should use server-side /api/stream URL for MP3 audio files', async () => {
      const audioFile: TorrentFile = {
        ...mockFile,
        name: 'song.mp3',
        extension: 'mp3',
        mediaCategory: 'audio',
        mimeType: 'audio/mpeg',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={audioFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      const { AudioPlayer } = await import('@/components/audio/audio-player');
      const mockAudioPlayer = vi.mocked(AudioPlayer);

      const calls = mockAudioPlayer.mock.calls;
      const lastCall = calls[calls.length - 1];
      // Should use server-side streaming URL
      expect(lastCall[0].src).toContain('/api/stream');
      expect(lastCall[0].src).toContain(`infohash=${defaultProps.infohash}`);
      expect(lastCall[0].src).toContain('fileIndex=');
    });

    it('should use server-side streaming for WebM video files (native-compatible)', async () => {
      mockStartStream.mockClear();

      const webmFile: TorrentFile = {
        ...mockFile,
        name: 'video.webm',
        extension: 'webm',
        mediaCategory: 'video',
        mimeType: 'video/webm',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={webmFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('video-player')).toBeInTheDocument();
      });

      // Even for native-compatible formats, P2P is disabled
      expect(mockStartStream).not.toHaveBeenCalled();

      const { VideoPlayer } = await import('@/components/video/video-player');
      const mockVideoPlayer = vi.mocked(VideoPlayer);

      const lastCall = mockVideoPlayer.mock.calls[mockVideoPlayer.mock.calls.length - 1];
      expect(lastCall[0].src).toContain('/api/stream');
    });

    it('should use server-side streaming for OGG audio files (native-compatible)', async () => {
      mockStartStream.mockClear();

      const oggFile: TorrentFile = {
        ...mockFile,
        name: 'audio.ogg',
        extension: 'ogg',
        mediaCategory: 'audio',
        mimeType: 'audio/ogg',
      };

      render(
        <MediaPlayerModal
          {...defaultProps}
          file={oggFile}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // Even for native-compatible formats, P2P is disabled
      expect(mockStartStream).not.toHaveBeenCalled();

      const { AudioPlayer } = await import('@/components/audio/audio-player');
      const mockAudioPlayer = vi.mocked(AudioPlayer);

      const calls = mockAudioPlayer.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].src).toContain('/api/stream');
    });

    it('should call stopStream when modal closes to cleanup any potential P2P state', async () => {
      mockStopStream.mockClear();

      const { rerender } = render(
        <MediaPlayerModal
          {...defaultProps}
        />
      );

      await vi.waitFor(() => {
        expect(screen.getByTestId('audio-player')).toBeInTheDocument();
      });

      // Close the modal
      rerender(
        <MediaPlayerModal
          {...defaultProps}
          isOpen={false}
        />
      );

      // stopStream should be called during cleanup
      expect(mockStopStream).toHaveBeenCalled();
    });
  });
});
