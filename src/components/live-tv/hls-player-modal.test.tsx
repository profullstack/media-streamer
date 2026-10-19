/**
 * HLS Player Modal Tests
 *
 * Tests for the live TV HLS player modal component.
 * Supports both HLS (.m3u8) and MPEG-TS (.ts) streams.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Channel } from '@/lib/iptv';

/*
 * The modal no longer builds hls.js or mpegts.js itself: it hands its <video>
 * to @profullstack/player's attachSource with the kind it detected. So the
 * double is the package, and the assertions are about what this component
 * still owns -- which kind it asks for, that it tears the attachment down, and
 * what its UI does with the engine's callbacks.
 */
interface AttachCall {
  media: HTMLMediaElement;
  options: {
    src: string;
    kind?: string;
    onError?: (message: string) => void;
    onNotice?: (message: string | null) => void;
  };
}

const { attachCalls, destroyAttached } = vi.hoisted(() => ({
  attachCalls: [] as AttachCall[],
  destroyAttached: vi.fn(),
}));

vi.mock('@profullstack/player', () => ({
  attachSource: vi.fn(async (media: HTMLMediaElement, options: AttachCall['options']) => {
    attachCalls.push({ media, options });
    return Promise.resolve({
      destroy: destroyAttached,
      engine: options.kind === 'mpegts' ? 'mpegts' : 'hls',
      kind: options.kind ?? 'unknown',
      levels: () => [],
    });
  }),
}));

// Import after mocks are set up
import { HlsPlayerModal } from './hls-player-modal';

const hlsAttaches = (): number => attachCalls.filter((c) => c.options.kind === 'hls').length;
const mpegtsAttaches = (): number => attachCalls.filter((c) => c.options.kind === 'mpegts').length;

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
    attachCalls.length = 0;
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
        expect(hlsAttaches()).toBeGreaterThan(0);
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
        expect(hlsAttaches()).toBeGreaterThan(0);
      });
      
      unmount();
      
      // The attachment should have been torn down
      await waitFor(() => {
        expect(destroyAttached).toHaveBeenCalled();
      });
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
        expect(hlsAttaches()).toBeGreaterThan(0);
      });
      
      rerender(
        <HlsPlayerModal
          isOpen={false}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      // The attachment should have been torn down
      await waitFor(() => {
        expect(destroyAttached).toHaveBeenCalled();
      });
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
        expect(mpegtsAttaches()).toBeGreaterThan(0);
      });
      
      // HLS.js should NOT be used for .ts streams
      expect(hlsAttaches()).toBe(0);
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
        expect(mpegtsAttaches()).toBeGreaterThan(0);
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
        expect(hlsAttaches()).toBeGreaterThan(0);
      });
      
      // mpegts.js should NOT be used for .m3u8 streams
      expect(mpegtsAttaches()).toBe(0);
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
        expect(mpegtsAttaches()).toBeGreaterThan(0);
      });
      
      unmount();
      
      // The attachment should have been torn down
      await waitFor(() => {
        expect(destroyAttached).toHaveBeenCalled();
      });
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
        expect(mpegtsAttaches()).toBeGreaterThan(0);
      });
      
      rerender(
        <HlsPlayerModal
          isOpen={false}
          onClose={mockOnClose}
          channel={mpegtsChannel}
        />
      );
      
      // The attachment should have been torn down
      await waitFor(() => {
        expect(destroyAttached).toHaveBeenCalled();
      });
    });
  });

  describe('Engine attachment', () => {
    it('declares HLS for a proxied playlist, whose path says nothing', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={{
            id: 'proxied-hls',
            name: 'Proxied HLS',
            url: '/api/iptv-proxy?url=https%3A%2F%2Fexample.com%2Flive.m3u8',
          }}
        />
      );

      await waitFor(() => {
        expect(hlsAttaches()).toBe(1);
      });
      expect(attachCalls[0]?.options.src).toBe(
        '/api/iptv-proxy?url=https%3A%2F%2Fexample.com%2Flive.m3u8'
      );
    });

    it('hands mpegts.js an absolute URL for a proxied transport stream', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={{
            id: 'proxied-ts',
            name: 'Proxied TS',
            url: '/api/iptv-proxy?url=https%3A%2F%2Fexample.com%2Fstream.ts',
          }}
        />
      );

      await waitFor(() => {
        expect(mpegtsAttaches()).toBe(1);
      });
      expect(attachCalls[0]?.options.src).toBe(
        `${window.location.origin}/api/iptv-proxy?url=https%3A%2F%2Fexample.com%2Fstream.ts`
      );
    });

    it('shows the engine notice while it reconnects on its own', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={{ id: 'ts', name: 'TS', url: 'https://example.com/stream.ts' }}
        />
      );

      await waitFor(() => {
        expect(mpegtsAttaches()).toBe(1);
      });
      act(() => {
        attachCalls[0]?.options.onNotice?.('Reconnecting… (1/5)');
      });
      expect(screen.getByTestId('loading-indicator')).toHaveTextContent('Reconnecting… (1/5)');
    });

    it('shows a transport stream failure with no rebuild of its own', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={{ id: 'ts', name: 'TS', url: 'https://example.com/stream.ts' }}
        />
      );

      await waitFor(() => {
        expect(mpegtsAttaches()).toBe(1);
      });
      act(() => {
        attachCalls[0]?.options.onError?.('This stream could not be played (NetworkError).');
      });
      expect(screen.getByText('This stream could not be played (NetworkError).')).toBeInTheDocument();
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
          expect.stringContaining('[HLS Player] requestFullscreen failed'),
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

  describe('Refresh functionality', () => {
    it('renders refresh button in the header', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      expect(refreshButton).toBeInTheDocument();
    });

    it('refresh button is positioned to the right of the channel title', () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      const channelTitle = screen.getByText('ESPN HD');
      
      // Both should be in the same header container
      const header = refreshButton.closest('.flex.items-center.justify-between');
      expect(header).toContainElement(channelTitle);
      expect(header).toContainElement(refreshButton);
    });

    it('reloads the stream when refresh button is clicked for HLS streams', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      await waitFor(() => {
        expect(hlsAttaches()).toBeGreaterThan(0);
      });
      
      // Clear the mock to track new calls
      attachCalls.length = 0;
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);
      
      // Should create a new HLS instance
      await waitFor(() => {
        expect(hlsAttaches()).toBeGreaterThan(0);
      });
    });

    it('reloads the stream when refresh button is clicked for MPEG-TS streams', async () => {
      const mpegtsChannel: Channel = {
        id: 'mpeg-ts-channel',
        name: 'MPEG-TS Channel',
        url: 'https://example.com/stream.ts',
        group: 'Test',
      };

      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mpegtsChannel}
        />
      );
      
      await waitFor(() => {
        expect(mpegtsAttaches()).toBeGreaterThan(0);
      });
      
      // Clear the mock to track new calls
      attachCalls.length = 0;
      destroyAttached.mockClear();
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);
      
      // Should destroy old player and create a new one
      await waitFor(() => {
        expect(destroyAttached).toHaveBeenCalled();
        expect(mpegtsAttaches()).toBeGreaterThan(0);
      });
    });

    it('shows loading state when refresh is clicked', async () => {
      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={mockChannel}
        />
      );
      
      // Wait for initial load to complete
      await waitFor(() => {
        expect(hlsAttaches()).toBeGreaterThan(0);
      });
      
      // Simulate metadata arriving to clear loading state
      fireEvent(screen.getByTestId('hls-video'), new Event('loadedmetadata'));
      
      // Click refresh
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);
      
      // Should show loading indicator again
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });

    it('clears error state when refresh is clicked', async () => {
      // Create a channel that will trigger an error
      const channelWithError: Channel = {
        id: 'error-channel',
        name: 'Error Channel',
        url: 'https://example.com/error.m3u8',
        group: 'Test',
      };

      render(
        <HlsPlayerModal
          isOpen={true}
          onClose={mockOnClose}
          channel={channelWithError}
        />
      );
      
      await waitFor(() => {
        expect(hlsAttaches()).toBeGreaterThan(0);
      });
      
      // Simulate the engine giving up
      attachCalls[0]?.options.onError?.('This stream could not be played.');
      
      // Click refresh - should clear error and show loading
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);
      
      // Should show loading indicator (error cleared)
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });
  });

  describe('TV-specific sizing', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('uses smaller modal dimensions on TV browsers', async () => {
      // Mock TV detection by setting a TV user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 9; AFTN Build/NS6264) AppleWebKit/537.36 (KHTML, like Gecko) Silk/88.3.1 like Chrome/88.0.4324.152 Safari/537.36',
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

      const modalContent = screen.getByTestId('modal-content');
      // TV modal should have max-w-2xl class instead of max-w-4xl
      expect(modalContent.className).toContain('max-w-2xl');
      expect(modalContent.className).not.toContain('max-w-4xl');
    });

    it('uses standard modal dimensions on non-TV browsers', async () => {
      // Mock non-TV user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

      const modalContent = screen.getByTestId('modal-content');
      // Standard modal should have max-w-4xl class
      expect(modalContent.className).toContain('max-w-4xl');
      expect(modalContent.className).not.toContain('max-w-2xl');
    });

    it('uses smaller header padding on TV browsers', async () => {
      // Mock TV detection
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 9; AFTN Build/NS6264) AppleWebKit/537.36 (KHTML, like Gecko) Silk/88.3.1 like Chrome/88.0.4324.152 Safari/537.36',
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

      const header = screen.getByTestId('modal-header');
      // TV header should have p-2 class instead of p-4
      expect(header.className).toContain('p-2');
      expect(header.className).not.toContain('p-4');
    });

    it('uses smaller channel logo on TV browsers', async () => {
      // Mock TV detection
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 9; AFTN Build/NS6264) AppleWebKit/537.36 (KHTML, like Gecko) Silk/88.3.1 like Chrome/88.0.4324.152 Safari/537.36',
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

      const logo = screen.getByAltText('ESPN HD logo');
      // TV logo should have w-8 h-8 classes instead of w-10 h-10
      expect(logo.className).toContain('w-8');
      expect(logo.className).toContain('h-8');
      expect(logo.className).not.toContain('w-10');
      expect(logo.className).not.toContain('h-10');
    });

    it('uses smaller title text on TV browsers', async () => {
      // Mock TV detection
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 9; AFTN Build/NS6264) AppleWebKit/537.36 (KHTML, like Gecko) Silk/88.3.1 like Chrome/88.0.4324.152 Safari/537.36',
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

      const title = screen.getByText('ESPN HD');
      // TV title should have text-base class instead of text-lg
      expect(title.className).toContain('text-base');
      expect(title.className).not.toContain('text-lg');
    });
  });
});
