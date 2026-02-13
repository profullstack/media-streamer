/**
 * Live TV Page Tests
 *
 * Tests for IPTV channel search/filtering race condition fix
 * and duplicate clear button fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the hooks
vi.mock('@/hooks/use-auth', () => ({
  useAuth: vi.fn(function() {
    return {
      isLoggedIn: false,
      isLoading: false,
    };
  }),
}));

vi.mock('@/hooks/use-favorites', () => ({
  useIptvChannelFavorites: vi.fn(function() {
    return {
      favorites: [],
      refetch: vi.fn(),
      isLoading: false,
    };
  }),
}));

// Mock MainLayout
vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));

// Mock icons
vi.mock('@/components/ui/icons', () => ({
  TvIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="tv-icon" data-size={size} className={className}>TV</span>
  ),
  PlusIcon: ({ size }: { size?: number }) => <span data-testid="plus-icon" data-size={size}>+</span>,
  SearchIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="search-icon" data-size={size} className={className}>🔍</span>
  ),
  PlayIcon: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="play-icon" data-size={size} className={className}>▶</span>
  ),
  LoadingSpinner: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid="loading-spinner" data-size={size} className={className}>⏳</span>
  ),
  EditIcon: ({ size }: { size?: number }) => <span data-testid="edit-icon" data-size={size}>✏️</span>,
  TrashIcon: ({ size }: { size?: number }) => <span data-testid="trash-icon" data-size={size}>🗑️</span>,
}));

// Mock live-tv components
vi.mock('@/components/live-tv', () => ({
  AddPlaylistModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="add-playlist-modal">Add Playlist Modal</div> : null
  ),
  EditPlaylistModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="edit-playlist-modal">Edit Playlist Modal</div> : null
  ),
  HlsPlayerModal: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="hls-player-modal">HLS Player Modal</div> : null
  ),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import { LiveTvContent } from './live-tv-content';
import { useAuth } from '@/hooks/use-auth';

const mockUseAuth = vi.mocked(useAuth);

describe('LiveTvContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    
    // Default auth state
    mockUseAuth.mockReturnValue({
      isLoggedIn: false,
      isLoading: false,
      isPremium: false,
      isTrialExpired: false,
      user: null,
      error: null,
      refresh: vi.fn(),
    });
    
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Search Input', () => {
    it('renders search input with type="text" to avoid duplicate clear buttons', async () => {
      render(<LiveTvContent />);
      
      const searchInput = screen.getByPlaceholderText(/search channels/i);
      
      // Should be type="text" not type="search" to avoid browser's native clear button
      expect(searchInput).toHaveAttribute('type', 'text');
    });

    it('shows custom clear button when search query is present', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      // Setup localStorage with a playlist
      const mockPlaylists = [
        { id: '1', name: 'Test Playlist', m3uUrl: 'http://example.com/test.m3u' },
      ];
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'iptv-playlists') return JSON.stringify(mockPlaylists);
        if (key === 'iptv-active-playlist-id') return '1';
        return null;
      });
      
      // Mock successful channel fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          channels: [],
          groups: [],
          total: 0,
          limit: 50,
          offset: 0,
          cached: true,
          fetchedAt: Date.now(),
        }),
      });
      
      render(<LiveTvContent />);
      
      // Wait for initialization
      await vi.advanceTimersByTimeAsync(100);
      
      const searchInput = screen.getByPlaceholderText(/search channels/i);
      await user.type(searchInput, 'test');
      
      // Clear button should appear
      const clearButton = screen.getByRole('button', { name: /clear search/i });
      expect(clearButton).toBeInTheDocument();
    });

    it('clears search when clear button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      // Setup localStorage with a playlist
      const mockPlaylists = [
        { id: '1', name: 'Test Playlist', m3uUrl: 'http://example.com/test.m3u' },
      ];
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'iptv-playlists') return JSON.stringify(mockPlaylists);
        if (key === 'iptv-active-playlist-id') return '1';
        return null;
      });
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          channels: [],
          groups: [],
          total: 0,
          limit: 50,
          offset: 0,
          cached: true,
          fetchedAt: Date.now(),
        }),
      });
      
      render(<LiveTvContent />);
      
      await vi.advanceTimersByTimeAsync(100);
      
      const searchInput = screen.getByPlaceholderText(/search channels/i);
      await user.type(searchInput, 'test');
      
      expect(searchInput).toHaveValue('test');
      
      const clearButton = screen.getByRole('button', { name: /clear search/i });
      await user.click(clearButton);
      
      expect(searchInput).toHaveValue('');
    });
  });

  describe('Race Condition Prevention', () => {
    it('waits for playlist to be cached before applying search filters', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      // Setup localStorage with a playlist
      const mockPlaylists = [
        { id: '1', name: 'Test Playlist', m3uUrl: 'http://example.com/test.m3u' },
      ];
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'iptv-playlists') return JSON.stringify(mockPlaylists);
        if (key === 'iptv-active-playlist-id') return '1';
        return null;
      });
      
      // Track fetch calls
      const fetchCalls: string[] = [];
      mockFetch.mockImplementation((url: string) => {
        fetchCalls.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channels: [{ id: 'ch1', name: 'Channel 1', url: 'http://example.com/ch1.m3u8' }],
            groups: ['Group 1'],
            total: 1,
            limit: 50,
            offset: 0,
            cached: fetchCalls.length > 1, // First call is not cached, subsequent are
            fetchedAt: Date.now(),
          }),
        });
      });
      
      render(<LiveTvContent />);
      
      // Wait for initial load
      await vi.advanceTimersByTimeAsync(100);
      
      // Initial fetch should happen
      await waitFor(() => {
        expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
      });
      
      // Type in search - this should wait for debounce
      const searchInput = screen.getByPlaceholderText(/search channels/i);
      await user.type(searchInput, 'test');
      
      // Advance past debounce timer
      await vi.advanceTimersByTimeAsync(350);
      
      // Should have made additional fetch with search query
      await waitFor(() => {
        const searchFetches = fetchCalls.filter(url => url.includes('q=test'));
        expect(searchFetches.length).toBe(1);
      });
    });

    it('does not send filter request until initial playlist load completes', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      // Setup localStorage with a playlist
      const mockPlaylists = [
        { id: '1', name: 'Test Playlist', m3uUrl: 'http://example.com/test.m3u' },
      ];
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'iptv-playlists') return JSON.stringify(mockPlaylists);
        if (key === 'iptv-active-playlist-id') return '1';
        return null;
      });
      
      // Slow initial fetch
      let resolveInitialFetch: (value: unknown) => void;
      const initialFetchPromise = new Promise((resolve) => {
        resolveInitialFetch = resolve;
      });
      
      const fetchCalls: string[] = [];
      mockFetch.mockImplementation((url: string) => {
        fetchCalls.push(url);
        if (fetchCalls.length === 1) {
          // First call is slow
          return initialFetchPromise;
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channels: [],
            groups: [],
            total: 0,
            limit: 50,
            offset: 0,
            cached: true,
            fetchedAt: Date.now(),
          }),
        });
      });
      
      render(<LiveTvContent />);
      
      // Type search while initial load is pending
      const searchInput = screen.getByPlaceholderText(/search channels/i);
      await user.type(searchInput, 'test');
      
      // Advance past debounce
      await vi.advanceTimersByTimeAsync(350);
      
      // Should only have the initial fetch, not a search fetch yet
      // because we're waiting for the playlist to be loaded
      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0]).not.toContain('q=test');
      
      // Now resolve the initial fetch
      resolveInitialFetch!({
        ok: true,
        json: () => Promise.resolve({
          channels: [],
          groups: [],
          total: 0,
          limit: 50,
          offset: 0,
          cached: false,
          fetchedAt: Date.now(),
        }),
      });
      
      // Wait for the search fetch to happen after initial load completes
      await vi.advanceTimersByTimeAsync(100);
      
      await waitFor(() => {
        const searchFetches = fetchCalls.filter(url => url.includes('q=test'));
        expect(searchFetches.length).toBe(1);
      });
    });

    it('cancels pending search when playlist changes', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      // Setup localStorage with multiple playlists
      const mockPlaylists = [
        { id: '1', name: 'Playlist A', m3uUrl: 'http://example.com/a.m3u' },
        { id: '2', name: 'Playlist B', m3uUrl: 'http://example.com/b.m3u' },
      ];
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'iptv-playlists') return JSON.stringify(mockPlaylists);
        if (key === 'iptv-active-playlist-id') return '1';
        return null;
      });
      
      const fetchCalls: string[] = [];
      mockFetch.mockImplementation((url: string) => {
        fetchCalls.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            channels: [],
            groups: [],
            total: 0,
            limit: 50,
            offset: 0,
            cached: true,
            fetchedAt: Date.now(),
          }),
        });
      });
      
      render(<LiveTvContent />);
      
      await vi.advanceTimersByTimeAsync(100);
      
      // Type search
      const searchInput = screen.getByPlaceholderText(/search channels/i);
      await user.type(searchInput, 'test');
      
      // Before debounce completes, change playlist using the select element by id
      const playlistSelect = screen.getByRole('combobox', { name: /playlist/i });
      await user.selectOptions(playlistSelect, '2');
      
      // Advance past debounce
      await vi.advanceTimersByTimeAsync(350);
      
      // The search query should be cleared when playlist changes
      expect(searchInput).toHaveValue('');
      
      // Should not have a fetch with the old search query for the new playlist
      const searchFetchesForB = fetchCalls.filter(
        url => url.includes('b.m3u') && url.includes('q=test')
      );
      expect(searchFetchesForB.length).toBe(0);
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner during initial channel fetch', async () => {
      // Setup localStorage with a playlist
      const mockPlaylists = [
        { id: '1', name: 'Test Playlist', m3uUrl: 'http://example.com/test.m3u' },
      ];
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'iptv-playlists') return JSON.stringify(mockPlaylists);
        if (key === 'iptv-active-playlist-id') return '1';
        return null;
      });
      
      // Never-resolving fetch
      mockFetch.mockImplementation(() => new Promise(() => {}));
      
      render(<LiveTvContent />);
      
      await vi.advanceTimersByTimeAsync(100);
      
      // Should show loading state
      expect(screen.getByText(/loading channels/i)).toBeInTheDocument();
    });

    it('shows loading indicator in search input while searching', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      const mockPlaylists = [
        { id: '1', name: 'Test Playlist', m3uUrl: 'http://example.com/test.m3u' },
      ];
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'iptv-playlists') return JSON.stringify(mockPlaylists);
        if (key === 'iptv-active-playlist-id') return '1';
        return null;
      });
      
      let fetchCount = 0;
      mockFetch.mockImplementation(() => {
        fetchCount++;
        if (fetchCount === 1) {
          // First fetch resolves immediately
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              channels: [{ id: 'ch1', name: 'Channel 1', url: 'http://example.com/ch1.m3u8' }],
              groups: [],
              total: 1,
              limit: 50,
              offset: 0,
              cached: true,
              fetchedAt: Date.now(),
            }),
          });
        }
        // Subsequent fetches are slow
        return new Promise(() => {});
      });
      
      render(<LiveTvContent />);
      
      await vi.advanceTimersByTimeAsync(100);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Channel 1')).toBeInTheDocument();
      });
      
      // Type search
      const searchInput = screen.getByPlaceholderText(/search channels/i);
      await user.type(searchInput, 'test');
      
      // Advance past debounce
      await vi.advanceTimersByTimeAsync(350);
      
      // Should show loading spinner in search input
      const loadingSpinners = screen.getAllByTestId('loading-spinner');
      expect(loadingSpinners.length).toBeGreaterThan(0);
    });
  });
});
