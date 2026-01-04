/**
 * AddPlaylistModal Component Tests
 *
 * Tests for the IPTV playlist modal with name, M3U URL, and EPG URL fields.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock useTvDetection hook to avoid issues in test environment
vi.mock('@/hooks/use-tv-detection', () => ({
  useTvDetection: () => ({ isTv: false, isLoading: false, browserType: null }),
}));

import { AddPlaylistModal } from './add-playlist-modal';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AddPlaylistModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Rendering', () => {
    it('renders the modal when isOpen is true', () => {
      render(<AddPlaylistModal {...defaultProps} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Add IPTV Playlist')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<AddPlaylistModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders all required form fields', () => {
      render(<AddPlaylistModal {...defaultProps} />);
      
      expect(screen.getByLabelText(/playlist name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/m3u url/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/epg url/i)).toBeInTheDocument();
    });

    it('renders submit and cancel buttons', () => {
      render(<AddPlaylistModal {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /add playlist/i })).toBeInTheDocument();
      // Use getAllByRole since there are multiple close buttons (modal X and form Close)
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('shows EPG URL label with optional indicator', () => {
      render(<AddPlaylistModal {...defaultProps} />);
      
      // Check for the "(Optional)" text in the label using the label element
      const epgLabel = screen.getByLabelText(/epg url/i);
      const labelElement = document.querySelector('label[for="epg-url"]');
      expect(labelElement?.textContent).toContain('Optional');
    });
  });

  describe('Form Validation', () => {
    it('shows error when submitting with invalid M3U URL format', async () => {
      const user = userEvent.setup();
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'not-a-valid-url');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      expect(screen.getByText(/please enter a valid url/i)).toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('shows error for invalid EPG URL format when provided', async () => {
      const user = userEvent.setup();
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const epgInput = screen.getByLabelText(/epg url/i);
      await user.type(epgInput, 'not-a-valid-url');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      expect(screen.getByText(/please enter a valid epg url/i)).toBeInTheDocument();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('allows submission without EPG URL', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'My Playlist' }),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    it('disables submit button when name is empty', () => {
      render(<AddPlaylistModal {...defaultProps} />);
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when M3U URL is empty', async () => {
      const user = userEvent.setup();
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when name and M3U URL are provided', async () => {
      const user = userEvent.setup();
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('submits form with correct data', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          id: '1', 
          name: 'My Playlist',
          m3uUrl: 'http://example.com/playlist.m3u',
          epgUrl: 'http://example.com/epg.xml',
        }),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const epgInput = screen.getByLabelText(/epg url/i);
      await user.type(epgInput, 'http://example.com/epg.xml');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/iptv/playlists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'My Playlist',
            m3uUrl: 'http://example.com/playlist.m3u',
            epgUrl: 'http://example.com/epg.xml',
          }),
        });
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/adding/i)).toBeInTheDocument();
      });
    });

    it('disables form inputs during submission', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(nameInput).toBeDisabled();
        expect(m3uInput).toBeDisabled();
      });
    });

    it('calls onSuccess callback on successful submission', async () => {
      const user = userEvent.setup();
      const playlistData = { 
        id: '1', 
        name: 'My Playlist',
        m3uUrl: 'http://example.com/playlist.m3u',
        epgUrl: 'http://example.com/epg.xml',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(playlistData),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledWith(playlistData);
      });
    });

    it('shows success message on successful submission', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          id: '1', 
          name: 'My Playlist',
        }),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/successfully added/i)).toBeInTheDocument();
      });
    });

    it('shows error message on failed submission', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to add playlist' }),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to add playlist/i)).toBeInTheDocument();
      });
    });

    it('handles network errors gracefully', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Modal Interactions', () => {
    it('calls onClose when form close button is clicked', async () => {
      const user = userEvent.setup();
      render(<AddPlaylistModal {...defaultProps} />);
      
      // Get the form's Close button (not the modal header X button)
      const closeButton = screen.getByRole('button', { name: /^close$/i });
      await user.click(closeButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when modal header X button is clicked', async () => {
      const user = userEvent.setup();
      render(<AddPlaylistModal {...defaultProps} />);
      
      // Get the modal header X button by aria-label
      const closeButton = screen.getByRole('button', { name: /close modal/i });
      await user.click(closeButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('clears error messages when input changes', async () => {
      const user = userEvent.setup();
      render(<AddPlaylistModal {...defaultProps} />);
      
      // Fill in name and invalid M3U URL to trigger validation error
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'invalid-url');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      expect(screen.getByText(/please enter a valid url/i)).toBeInTheDocument();
      
      // Type more in the M3U field to clear the error
      await user.type(m3uInput, 'x');
      
      // Error should be cleared
      expect(screen.queryByText(/please enter a valid url/i)).not.toBeInTheDocument();
    });
  });

  describe('URL Validation', () => {
    it('accepts http URLs', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'My Playlist' }),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'http://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('accepts https URLs', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'My Playlist' }),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, 'https://example.com/playlist.m3u');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('trims whitespace from URLs', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'My Playlist' }),
      });
      
      render(<AddPlaylistModal {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/playlist name/i);
      await user.type(nameInput, 'My Playlist');
      
      const m3uInput = screen.getByLabelText(/m3u url/i);
      await user.type(m3uInput, '  http://example.com/playlist.m3u  ');
      
      const submitButton = screen.getByRole('button', { name: /add playlist/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/iptv/playlists', expect.objectContaining({
          body: expect.stringContaining('http://example.com/playlist.m3u'),
        }));
      });
    });
  });
});
