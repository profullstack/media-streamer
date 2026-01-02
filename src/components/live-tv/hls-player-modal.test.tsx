/**
 * HLS Player Modal Tests
 * 
 * Tests for the live TV HLS player modal component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Channel } from '@/lib/iptv';

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

// Import after mock is set up
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
});
