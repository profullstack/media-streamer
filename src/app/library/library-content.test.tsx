/**
 * Library Content Component Tests
 *
 * Tests for the interactive library content component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock useTvDetection hook to avoid issues in test environment
vi.mock('@/hooks/use-tv-detection', () => ({
  useTvDetection: () => ({ isTv: false, isLoading: false, browserType: null }),
}));

import { LibraryContent } from './library-content';
import type { Favorite, Collection, HistoryItem } from '@/lib/library';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock data - using partial types for testing
const mockFavorites = [
  {
    id: 'fav-1',
    user_id: 'user-123',
    file_id: 'file-1',
    created_at: '2024-01-15T00:00:00Z',
    torrent_files: {
      id: 'file-1',
      name: 'Song.mp3',
      media_category: 'audio',
      torrents: {
        id: 'torrent-1',
        name: 'Test Album',
      },
    },
  },
  {
    id: 'fav-2',
    user_id: 'user-123',
    file_id: 'file-2',
    created_at: '2024-01-14T00:00:00Z',
    torrent_files: {
      id: 'file-2',
      name: 'Movie.mp4',
      media_category: 'video',
      torrents: {
        id: 'torrent-2',
        name: 'Test Movie',
      },
    },
  },
] as Favorite[];

const mockCollections = [
  {
    id: 'col-1',
    user_id: 'user-123',
    name: 'My Playlist',
    collection_type: 'playlist',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    item_count: 5,
  },
  {
    id: 'col-2',
    user_id: 'user-123',
    name: 'Watch Later',
    collection_type: 'watchlist',
    created_at: '2024-01-14T00:00:00Z',
    updated_at: '2024-01-14T00:00:00Z',
    item_count: 3,
  },
] as Collection[];

const mockHistory: HistoryItem[] = [
  {
    id: 'wp-1',
    type: 'watch',
    file_id: 'file-3',
    percentage: 50,
    last_activity_at: '2024-01-15T12:00:00Z',
    file: {
      id: 'file-3',
      name: 'Another Movie.mp4',
      media_category: 'video',
    } as HistoryItem['file'],
    current_time_seconds: 3600,
    duration_seconds: 7200,
  },
  {
    id: 'rp-1',
    type: 'reading',
    file_id: 'file-4',
    percentage: 25,
    last_activity_at: '2024-01-15T10:00:00Z',
    file: {
      id: 'file-4',
      name: 'Book.epub',
      media_category: 'ebook',
    } as HistoryItem['file'],
    current_page: 50,
    total_pages: 200,
  },
];

describe('LibraryContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Tabs', () => {
    it('renders all tabs with counts', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={mockCollections}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
        />
      );

      // Check that all tabs are rendered
      expect(screen.getByText('Favorites')).toBeInTheDocument();
      expect(screen.getByText('Collections')).toBeInTheDocument();
      expect(screen.getByText('History')).toBeInTheDocument();
      
      // Check that counts are displayed (all tabs have count 2)
      const countElements = screen.getAllByText('(2)');
      expect(countElements).toHaveLength(3);
    });

    it('switches between tabs', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={mockCollections}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
        />
      );

      // Initially on favorites tab
      expect(screen.getByText('Song.mp3')).toBeInTheDocument();

      // Switch to collections
      await user.click(screen.getByText('Collections'));
      expect(screen.getByText('My Playlist')).toBeInTheDocument();

      // Switch to history
      await user.click(screen.getByText('History'));
      expect(screen.getByText('Another Movie.mp4')).toBeInTheDocument();
    });
  });

  describe('Favorites Tab', () => {
    it('displays favorites list', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      expect(screen.getByText('Song.mp3')).toBeInTheDocument();
      expect(screen.getByText('Movie.mp4')).toBeInTheDocument();
    });

    it('shows empty state when no favorites', () => {
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      expect(screen.getByText('No favorites yet')).toBeInTheDocument();
    });

    it('filters favorites by media type', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      // Click Music filter
      await user.click(screen.getByText('Music'));
      expect(screen.getByText('Song.mp3')).toBeInTheDocument();
      expect(screen.queryByText('Movie.mp4')).not.toBeInTheDocument();

      // Click Videos filter
      await user.click(screen.getByText('Videos'));
      expect(screen.queryByText('Song.mp3')).not.toBeInTheDocument();
      expect(screen.getByText('Movie.mp4')).toBeInTheDocument();

      // Click All filter
      await user.click(screen.getByText('All'));
      expect(screen.getByText('Song.mp3')).toBeInTheDocument();
      expect(screen.getByText('Movie.mp4')).toBeInTheDocument();
    });

    it('removes favorite when clicking remove button', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      // Find and click the remove button for the first favorite
      const removeButtons = screen.getAllByTitle('Remove from favorites');
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/library/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: 'file-1' }),
        });
      });

      // Favorite should be removed from the list
      await waitFor(() => {
        expect(screen.queryByText('Song.mp3')).not.toBeInTheDocument();
      });
    });
  });

  describe('Collections Tab', () => {
    it('displays collections list', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={mockCollections}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('Collections'));

      expect(screen.getByText('My Playlist')).toBeInTheDocument();
      expect(screen.getByText('5 items')).toBeInTheDocument();
      expect(screen.getByText('Watch Later')).toBeInTheDocument();
      expect(screen.getByText('3 items')).toBeInTheDocument();
    });

    it('shows new collection button', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('Collections'));

      expect(screen.getByText('New Collection')).toBeInTheDocument();
    });

    it('creates new collection', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            collection: {
              id: 'col-new',
              user_id: 'user-123',
              name: 'New Playlist',
              collection_type: 'playlist',
              created_at: '2024-01-16T00:00:00Z',
              updated_at: '2024-01-16T00:00:00Z',
            },
          }),
      });

      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('Collections'));
      await user.click(screen.getByText('New Collection'));

      // Fill in the form
      const nameInput = screen.getByPlaceholderText('Collection name');
      await user.type(nameInput, 'New Playlist');

      // Select type
      const typeSelect = screen.getByRole('combobox');
      await user.selectOptions(typeSelect, 'playlist');

      // Submit
      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/library/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Playlist', type: 'playlist' }),
        });
      });

      // New collection should appear
      await waitFor(() => {
        expect(screen.getByText('New Playlist')).toBeInTheDocument();
      });
    });

    it('cancels collection creation', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('Collections'));
      await user.click(screen.getByText('New Collection'));

      // Form should be visible
      expect(screen.getByPlaceholderText('Collection name')).toBeInTheDocument();

      // Cancel
      await user.click(screen.getByText('Cancel'));

      // Form should be hidden
      expect(screen.queryByPlaceholderText('Collection name')).not.toBeInTheDocument();
    });
  });

  describe('History Tab', () => {
    it('displays history list', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('History'));

      expect(screen.getByText('Another Movie.mp4')).toBeInTheDocument();
      expect(screen.getByText('Book.epub')).toBeInTheDocument();
    });

    it('shows empty state when no history', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('History'));

      expect(screen.getByText('No watch history')).toBeInTheDocument();
    });

    it('displays progress information', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('History'));

      // Check for progress percentages
      expect(screen.getByText(/50% complete/)).toBeInTheDocument();
      expect(screen.getByText(/25% complete/)).toBeInTheDocument();
    });

    it('filters history by media type', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('History'));

      // Click Videos filter
      await user.click(screen.getByText('Videos'));
      expect(screen.getByText('Another Movie.mp4')).toBeInTheDocument();
      expect(screen.queryByText('Book.epub')).not.toBeInTheDocument();

      // Click Ebooks filter
      await user.click(screen.getByText('Ebooks'));
      expect(screen.queryByText('Another Movie.mp4')).not.toBeInTheDocument();
      expect(screen.getByText('Book.epub')).toBeInTheDocument();
    });

    it('clears history when clicking clear button', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
        />
      );

      await user.click(screen.getByText('History'));
      await user.click(screen.getByText('Clear History'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/library/history', {
          method: 'DELETE',
        });
      });

      // History should be cleared
      await waitFor(() => {
        expect(screen.getByText('No watch history')).toBeInTheDocument();
      });
    });
  });

  describe('Header', () => {
    it('displays page title and description', () => {
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
        />
      );

      expect(screen.getByText('My Library')).toBeInTheDocument();
      expect(
        screen.getByText('Your favorites, collections, and watch history')
      ).toBeInTheDocument();
    });
  });
});
