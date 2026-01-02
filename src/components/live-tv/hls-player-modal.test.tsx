/**
 * HLS Player Modal Tests
 *
 * Tests for the live TV HLS player modal component.
 * Supports both HLS (.m3u8) and MPEG-TS (.ts) streams.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Channel } from '@/lib/iptv';

// Mock mpegts.js player instance
const mockMpegtsPlayer = {
  attachMediaElement: vi.fn(),
  load: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

// Mock mpegts.js module
const mockMpegts = {
  isSupported: vi.fn(() => true),
  createPlayer: vi.fn(() => mockMpegtsPlayer),
  Events: {
    MEDIA_INFO: 'media_info',
    ERROR: 'error',
    LOADING_COMPLETE: 'loading_complete',
  },
};

// Mock HLS.js - must be defined inside the factory
vi.mock('hls.js', () => {
  const mockHlsInstance = {
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };

  const MockHls = Object.assign(
    vi.fn(() => mockHlsInstance),
    {
      isSupported: vi.fn(() => true),
      Events: {
        MANIFEST_PARSED: 'hlsManifestParsed',
        ERROR: 'hlsError',
      },
      ErrorTypes: {
        NETWORK_ERROR: 'networkError',
        MEDIA_ERROR: 'mediaError',
      },
    }
  );

  return {
    default: MockHls,
  };
});

// Mock mpegts.js for MPEG-TS stream support (dynamic import)
vi.mock('mpegts.js', () => {
  return {
    default: mockMpegts,
  };
});

// Import after mocks are set up
import { HlsPlayerModal } from './hls-player-modal';
import Hls from 'hls.js';

describe('HlsPlayerModal', () => {
  const mockChannel: Channel = {
    id: 'test-channel-1',
    name: 'ESPN HD',
    url: 'https://example.com/espn.m3u8',
    group: 'Sports',
    logo: 'https://example.com/espn-logo.png',
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock HTMLMediaElement.play
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <HlsPlayerModal
          isOpen={false}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      expect(container.firstChild).toBeNull();
    });

    it('renders modal when isOpen is true', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays channel name in header', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      expect(screen.getByText('ESPN HD')).toBeInTheDocument();
    });

    it('displays channel logo when available', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const logo = screen.getByAltText('ESPN HD logo');
      expect(logo).toBeInTheDocument();
      expect(logo).toHaveAttribute('src', 'https://example.com/espn-logo.png');
    });

    it('displays group badge when available', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      expect(screen.getByText('Sports')).toBeInTheDocument();
    });

    it('renders video element', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      expect(screen.getByTestId('hls-video')).toBeInTheDocument();
    });
  });

  describe('Close functionality', () => {
    it('calls onClose when close button is clicked', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const backdrop = screen.getByTestId('modal-backdrop');
      fireEvent.click(backdrop);
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when clicking inside modal content', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const modalContent = screen.getByTestId('modal-content');
      fireEvent.click(modalContent);
      
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('HLS playback', () => {
    it('initializes HLS.js with channel URL', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      await waitFor(() => {
        expect(Hls).toHaveBeenCalled();
      });
    });

    it('destroys HLS instance on unmount', async () => {
      const { unmount } = render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      await waitFor(() => {
        expect(Hls).toHaveBeenCalled();
      });
      
      unmount();
      
      // The destroy method should have been called
      const hlsInstance = vi.mocked(Hls).mock.results[0]?.value;
      if (hlsInstance) {
        expect(hlsInstance.destroy).toHaveBeenCalled();
      }
    });

    it('destroys HLS instance when modal closes', async () => {
      const { rerender } = render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      await waitFor(() => {
        expect(Hls).toHaveBeenCalled();
      });
      
      rerender(
        <HlsPlayerModal
          isOpen={false}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      // The destroy method should have been called
      const hlsInstance = vi.mocked(Hls).mock.results[0]?.value;
      if (hlsInstance) {
        expect(hlsInstance.destroy).toHaveBeenCalled();
      }
    });
  });

  describe('Loading state', () => {
    it('shows loading indicator initially', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('displays error message when channel has no URL', () => {
      const channelWithoutUrl: Channel = {
        id: 'test-channel-2',
        name: 'Broken Channel',
        url: '',
        group: 'Test',
      };
      
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={channelWithoutUrl}
        />
      );
      
      expect(screen.getByText(/no stream url/i)).toBeInTheDocument();
    });
  });

  describe('Channel without logo', () => {
    it('renders placeholder when logo is not available', () => {
      const channelWithoutLogo: Channel = {
        id: 'test-channel-3',
        name: 'No Logo Channel',
        url: 'https://example.com/stream.m3u8',
        group: 'Test',
      };
      
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={channelWithoutLogo}
        />
      );
      
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.getByTestId('channel-icon-placeholder')).toBeInTheDocument();
    });
  });

  describe('Channel without group', () => {
    it('does not render group badge when group is not available', () => {
      const channelWithoutGroup: Channel = {
        id: 'test-channel-4',
        name: 'No Group Channel',
        url: 'https://example.com/stream.m3u8',
      };
      
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={channelWithoutGroup}
        />
      );
      
      expect(screen.queryByTestId('group-badge')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper aria attributes', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('focuses close button when modal opens', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      await waitFor(() => {
        const closeButton = screen.getByRole('button', { name: /close/i });
        expect(document.activeElement).toBe(closeButton);
      });
    });
  });

  describe('MPEG-TS stream support', () => {
    const mpegtsChannel: Channel = {
      id: 'mpeg-ts-channel',
      name: 'MPEG-TS Channel',
      url: 'https://example.com/stream.ts',
      group: 'Test',
    };

    const proxiedMpegtsChannel: Channel = {
      id: 'proxied-mpeg-ts-channel',
      name: 'Proxied MPEG-TS Channel',
      url: '/api/iptv-proxy?url=https%3A%2F%2Fexample.com%2Fstream.ts',
      group: 'Test',
    };

    it('uses mpegts.js for .ts stream URLs', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mpegtsChannel}
        />
      );
      
      await waitFor(() => {
        expect(mockMpegts.createPlayer).toHaveBeenCalled();
      });
      
      // HLS.js should NOT be used for .ts streams
      expect(Hls).not.toHaveBeenCalled();
    });

    it('uses mpegts.js for proxied .ts stream URLs', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={proxiedMpegtsChannel}
        />
      );
      
      await waitFor(() => {
        expect(mockMpegts.createPlayer).toHaveBeenCalled();
      });
    });

    it('uses HLS.js for .m3u8 stream URLs', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      await waitFor(() => {
        expect(Hls).toHaveBeenCalled();
      });
      
      // mpegts.js should NOT be used for .m3u8 streams
      expect(mockMpegts.createPlayer).not.toHaveBeenCalled();
    });

    it('destroys mpegts.js player on unmount', async () => {
      const { unmount } = render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mpegtsChannel}
        />
      );
      
      await waitFor(() => {
        expect(mockMpegts.createPlayer).toHaveBeenCalled();
      });
      
      unmount();
      
      // The destroy method should have been called
      expect(mockMpegtsPlayer.destroy).toHaveBeenCalled();
    });

    it('destroys mpegts.js player when modal closes', async () => {
      const { rerender } = render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mpegtsChannel}
        />
      );
      
      await waitFor(() => {
        expect(mockMpegts.createPlayer).toHaveBeenCalled();
      });
      
      rerender(
        <HlsPlayerModal
          isOpen={false}
          onClose={mockOnClose}
          channel={mpegtsChannel}
        />
      );
      
      // The destroy method should have been called
      expect(mockMpegtsPlayer.destroy).toHaveBeenCalled();
    });
  });

  describe('Auto-fullscreen', () => {
    beforeEach(() => {
      // Mock requestFullscreen on video element
      HTMLVideoElement.prototype.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      // Mock document.fullscreenElement
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
        configurable: true,
      });
    });

    it('requests fullscreen when stream starts playing', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      // Get the video element
      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      
      // Simulate the video starting to play
      fireEvent.play(video);
      
      await waitFor(() => {
        expect(video.requestFullscreen).toHaveBeenCalled();
      });
    });

    it('does not request fullscreen if already in fullscreen', async () => {
      // Set document.fullscreenElement to simulate already being in fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.createElement('video'),
        writable: true,
        configurable: true,
      });
      
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      
      // Simulate the video starting to play
      fireEvent.play(video);
      
      // Should not request fullscreen since we're already in fullscreen
      expect(video.requestFullscreen).not.toHaveBeenCalled();
    });

    it('handles fullscreen request failure gracefully', async () => {
      // Mock requestFullscreen to reject
      HTMLVideoElement.prototype.requestFullscreen = vi.fn().mockRejectedValue(new Error('Fullscreen not allowed'));
      
      // Spy on console.warn to verify error is logged
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const video = screen.getByTestId('hls-video') as HTMLVideoElement;
      
      // Simulate the video starting to play
      fireEvent.play(video);
      
      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[HLS Player] Could not enter fullscreen'),
          expect.any(Error)
        );
      });
      
      consoleWarnSpy.mockRestore();
    });

    it('exits fullscreen when modal closes', async () => {
      // Mock document.exitFullscreen
      document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
      
      // Set fullscreenElement to simulate being in fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.createElement('video'),
        writable: true,
        configurable: true,
      });
      
      const { rerender } = render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      // Close the modal
      rerender(
        <HlsPlayerModal
          isOpen={false}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      await waitFor(() => {
        expect(document.exitFullscreen).toHaveBeenCalled();
      });
    });
  });
});
