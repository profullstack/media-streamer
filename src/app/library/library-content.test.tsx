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

// Mock useRouter for navigation testing
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock HlsPlayerModal component
vi.mock('@/components/live-tv', () => ({
  HlsPlayerModal: ({ isOpen, channel }: { isOpen: boolean; channel: { name: string } }) => {
    return isOpen ? <div data-testid="hls-player-modal">Playing: {channel.name}</div> : null;
  },
}));

import { LibraryContent } from './library-content';
import type { Favorite, Collection, HistoryItem } from '@/lib/library';
import type { TorrentFavoriteWithDetails, IptvChannelFavoriteWithDetails } from '@/lib/favorites';

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
    bt_torrent_files: {
      id: 'file-1',
      name: 'Song.mp3',
      media_category: 'audio',
      bt_torrents: {
        id: 'torrent-1',
        name: 'Test Album',
        infohash: 'audio123hash',
      },
    },
  },
  {
    id: 'fav-2',
    user_id: 'user-123',
    file_id: 'file-2',
    created_at: '2024-01-14T00:00:00Z',
    bt_torrent_files: {
      id: 'file-2',
      name: 'Movie.mp4',
      media_category: 'video',
      bt_torrents: {
        id: 'torrent-2',
        name: 'Test Movie',
        infohash: 'video456hash',
      },
    },
  },
  {
    id: 'fav-3',
    user_id: 'user-123',
    file_id: 'file-ebook-1',
    created_at: '2024-01-13T00:00:00Z',
    bt_torrent_files: {
      id: 'file-ebook-1',
      name: 'Programming.epub',
      media_category: 'ebook',
      bt_torrents: {
        id: 'torrent-3',
        name: 'Programming Guide',
        infohash: 'ebook789hash',
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

const mockTorrentFavorites: TorrentFavoriteWithDetails[] = [
  {
    id: 'tf-1',
    user_id: 'user-123',
    torrent_id: 'torrent-music-1',
    created_at: '2024-01-15T00:00:00Z',
    bt_torrents: {
      id: 'torrent-music-1',
      name: 'Greatest Hits Album',
      infohash: 'abc123',
      content_type: 'music',
      poster_url: null,
      cover_url: null,
    },
  },
  {
    id: 'tf-2',
    user_id: 'user-123',
    torrent_id: 'torrent-movie-1',
    created_at: '2024-01-14T00:00:00Z',
    bt_torrents: {
      id: 'torrent-movie-1',
      name: 'Action Movie 2024',
      infohash: 'def456',
      content_type: 'movie',
      poster_url: 'http://example.com/poster.jpg',
      cover_url: null,
    },
  },
  {
    id: 'tf-3',
    user_id: 'user-123',
    torrent_id: 'torrent-tvshow-1',
    created_at: '2024-01-13T00:00:00Z',
    bt_torrents: {
      id: 'torrent-tvshow-1',
      name: 'Drama Series Season 1',
      infohash: 'ghi789',
      content_type: 'tvshow',
      poster_url: null,
      cover_url: null,
    },
  },
  {
    id: 'tf-4',
    user_id: 'user-123',
    torrent_id: 'torrent-book-1',
    created_at: '2024-01-12T00:00:00Z',
    bt_torrents: {
      id: 'torrent-book-1',
      name: 'Programming Guide eBook',
      infohash: 'jkl012',
      content_type: 'book',
      poster_url: null,
      cover_url: null,
    },
  },
];

const mockIptvChannelFavorites: IptvChannelFavoriteWithDetails[] = [
  {
    id: 'iptv-fav-1',
    user_id: 'user-123',
    playlist_id: 'playlist-1',
    channel_id: 'channel-1',
    channel_name: 'ESPN HD',
    channel_url: 'http://example.com/espn.m3u8',
    channel_logo: 'http://example.com/espn-logo.png',
    channel_group: 'Sports',
    tvg_id: 'espn.us',
    tvg_name: 'ESPN HD',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'iptv-fav-2',
    user_id: 'user-123',
    playlist_id: 'playlist-1',
    channel_id: 'channel-2',
    channel_name: 'CNN International',
    channel_url: 'http://example.com/cnn.m3u8',
    channel_logo: null,
    channel_group: 'News',
    tvg_id: null,
    tvg_name: null,
    created_at: '2024-01-14T00:00:00Z',
  },
];

describe('LibraryContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockPush.mockReset();
  });

  describe('Tabs', () => {
    it('renders all tabs with counts', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={mockCollections}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Check that all tabs are rendered
      expect(screen.getByText('Favorites')).toBeInTheDocument();
      expect(screen.getByText('Collections')).toBeInTheDocument();
      expect(screen.getByText('History')).toBeInTheDocument();
      
      // Check that counts are displayed
      // Favorites: 3 (mockFavorites), Collections: 2, History: 2
      expect(screen.getByText('(3)')).toBeInTheDocument(); // Favorites
      const countTwoElements = screen.getAllByText('(2)');
      expect(countTwoElements).toHaveLength(2); // Collections and History
    });

    it('switches between tabs', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={mockCollections}
          initialHistory={mockHistory}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
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
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      expect(screen.getByText('My Library')).toBeInTheDocument();
      expect(
        screen.getByText('Your favorites, collections, and watch history')
      ).toBeInTheDocument();
    });
  });

  describe('IPTV Channel Favorites', () => {
    it('displays IPTV channel favorites', () => {
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={mockIptvChannelFavorites}
        />
      );

      expect(screen.getByText('ESPN HD')).toBeInTheDocument();
      expect(screen.getByText('CNN International')).toBeInTheDocument();
      expect(screen.getByText('Sports')).toBeInTheDocument();
      expect(screen.getByText('News')).toBeInTheDocument();
    });

    it('shows IPTV channels when Live TV filter is selected', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={mockIptvChannelFavorites}
        />
      );

      // Click Live TV filter
      await user.click(screen.getByText('Live TV'));

      // IPTV channels should be visible
      expect(screen.getByText('ESPN HD')).toBeInTheDocument();
      expect(screen.getByText('CNN International')).toBeInTheDocument();

      // File favorites should not be visible
      expect(screen.queryByText('Song.mp3')).not.toBeInTheDocument();
    });

    it('opens HLS player modal when clicking play on IPTV channel', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={mockIptvChannelFavorites}
        />
      );

      // Find and click the play button for ESPN HD
      const playButtons = screen.getAllByTitle('Play channel');
      await user.click(playButtons[0]);

      // HLS player modal should be open with the channel name
      expect(screen.getByTestId('hls-player-modal')).toBeInTheDocument();
      expect(screen.getByText('Playing: ESPN HD')).toBeInTheDocument();
    });

    it('removes IPTV channel favorite when clicking remove button', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={mockIptvChannelFavorites}
        />
      );

      // Find and click the remove button for the first IPTV channel
      const removeButtons = screen.getAllByTitle('Remove from favorites');
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/favorites/iptv-channels', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId: 'playlist-1', channelId: 'channel-1' }),
        });
      });

      // Channel should be removed from the list
      await waitFor(() => {
        expect(screen.queryByText('ESPN HD')).not.toBeInTheDocument();
      });
    });

    it('includes IPTV channel count in favorites tab', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={mockIptvChannelFavorites}
        />
      );

      // Total count should include file favorites (3) + IPTV favorites (2) = 5
      expect(screen.getByText('(5)')).toBeInTheDocument();
    });
  });

  describe('Torrent Favorites Filtering', () => {
    it('displays all torrent favorites when All filter is selected', () => {
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // All torrent favorites should be visible
      expect(screen.getByText('Greatest Hits Album')).toBeInTheDocument();
      expect(screen.getByText('Action Movie 2024')).toBeInTheDocument();
      expect(screen.getByText('Drama Series Season 1')).toBeInTheDocument();
      expect(screen.getByText('Programming Guide eBook')).toBeInTheDocument();
    });

    it('filters torrent favorites to show only music when Music filter is selected', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      await user.click(screen.getByText('Music'));

      // Only music torrent should be visible
      expect(screen.getByText('Greatest Hits Album')).toBeInTheDocument();
      // Others should not be visible
      expect(screen.queryByText('Action Movie 2024')).not.toBeInTheDocument();
      expect(screen.queryByText('Drama Series Season 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Programming Guide eBook')).not.toBeInTheDocument();
    });

    it('filters torrent favorites to show movies and tvshows when Videos filter is selected', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      await user.click(screen.getByText('Videos'));

      // Movie and TV show torrents should be visible
      expect(screen.getByText('Action Movie 2024')).toBeInTheDocument();
      expect(screen.getByText('Drama Series Season 1')).toBeInTheDocument();
      // Others should not be visible
      expect(screen.queryByText('Greatest Hits Album')).not.toBeInTheDocument();
      expect(screen.queryByText('Programming Guide eBook')).not.toBeInTheDocument();
    });

    it('filters torrent favorites to show only books when Ebooks filter is selected', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      await user.click(screen.getByText('Ebooks'));

      // Only book torrent should be visible
      expect(screen.getByText('Programming Guide eBook')).toBeInTheDocument();
      // Others should not be visible
      expect(screen.queryByText('Greatest Hits Album')).not.toBeInTheDocument();
      expect(screen.queryByText('Action Movie 2024')).not.toBeInTheDocument();
      expect(screen.queryByText('Drama Series Season 1')).not.toBeInTheDocument();
    });

    it('hides all torrent favorites when Live TV filter is selected', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={mockIptvChannelFavorites}
        />
      );

      await user.click(screen.getByText('Live TV'));

      // No torrent favorites should be visible
      expect(screen.queryByText('Greatest Hits Album')).not.toBeInTheDocument();
      expect(screen.queryByText('Action Movie 2024')).not.toBeInTheDocument();
      expect(screen.queryByText('Drama Series Season 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Programming Guide eBook')).not.toBeInTheDocument();
      // But IPTV channels should be visible
      expect(screen.getByText('ESPN HD')).toBeInTheDocument();
    });

    it('removes torrent favorite when clicking remove button', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Find and click the remove button for the first torrent favorite
      const removeButtons = screen.getAllByTitle('Remove from favorites');
      await user.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/favorites/torrents', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ torrentId: 'torrent-music-1' }),
        });
      });

      // Torrent favorite should be removed from the list
      await waitFor(() => {
        expect(screen.queryByText('Greatest Hits Album')).not.toBeInTheDocument();
      });
    });

    it('includes torrent favorites count in favorites tab total', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Total count should include file favorites (3) + torrent favorites (4) = 7
      expect(screen.getByText('(7)')).toBeInTheDocument();
    });

    it('displays correct filtered count in section header', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={[]}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={mockTorrentFavorites}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // All filter should show 4 torrents
      expect(screen.getByText('Favorite Torrents (4)')).toBeInTheDocument();

      // Videos filter should show 2 torrents (movie + tvshow)
      await user.click(screen.getByText('Videos'));
      expect(screen.getByText('Favorite Torrents (2)')).toBeInTheDocument();

      // Music filter should show 1 torrent
      await user.click(screen.getByText('Music'));
      expect(screen.getByText('Favorite Torrents (1)')).toBeInTheDocument();
    });
  });

  describe('File Favorites Navigation', () => {
    it('displays ebook favorites with Book icon', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Ebook should be visible
      expect(screen.getByText('Programming.epub')).toBeInTheDocument();

      // Should have a "Read" button for ebook
      expect(screen.getByTitle('Read')).toBeInTheDocument();

      // Should have "Play" buttons for audio/video
      const playButtons = screen.getAllByTitle('Play');
      expect(playButtons).toHaveLength(2);
    });

    it('navigates to ebook reader when clicking Read button on ebook', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Click the Read button for ebook
      await user.click(screen.getByTitle('Read'));

      // Should navigate to reader page with file ID
      expect(mockPush).toHaveBeenCalledWith('/reader/file-ebook-1');
    });

    it('navigates to torrent details when clicking Play button on audio file', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Click the first Play button (for audio file)
      const playButtons = screen.getAllByTitle('Play');
      await user.click(playButtons[0]);

      // Should navigate to torrent details page with infohash
      expect(mockPush).toHaveBeenCalledWith('/torrents/audio123hash');
    });

    it('navigates to torrent details when clicking Play button on video file', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Click the second Play button (for video file)
      const playButtons = screen.getAllByTitle('Play');
      await user.click(playButtons[1]);

      // Should navigate to torrent details page with infohash
      expect(mockPush).toHaveBeenCalledWith('/torrents/video456hash');
    });

    it('file names link to torrent details page', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Check that file names are links to torrent details
      const songLink = screen.getByRole('link', { name: 'Song.mp3' });
      expect(songLink).toHaveAttribute('href', '/torrents/audio123hash');

      const movieLink = screen.getByRole('link', { name: 'Movie.mp4' });
      expect(movieLink).toHaveAttribute('href', '/torrents/video456hash');

      const ebookLink = screen.getByRole('link', { name: 'Programming.epub' });
      expect(ebookLink).toHaveAttribute('href', '/torrents/ebook789hash');
    });

    it('torrent names link to torrent details page', () => {
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Check that torrent names are links to torrent details
      const albumLink = screen.getByRole('link', { name: 'Test Album' });
      expect(albumLink).toHaveAttribute('href', '/torrents/audio123hash');

      const guideLink = screen.getByRole('link', { name: 'Programming Guide' });
      expect(guideLink).toHaveAttribute('href', '/torrents/ebook789hash');
    });

    it('filters ebooks correctly when Ebooks filter is selected', async () => {
      const user = userEvent.setup();
      render(
        <LibraryContent
          initialFavorites={mockFavorites}
          initialCollections={[]}
          initialHistory={[]}
          initialTorrentFavorites={[]}
          initialWatchlistItems={[]} initialIptvChannelFavorites={[]}
        />
      );

      // Click Ebooks filter
      await user.click(screen.getByText('Ebooks'));

      // Only ebook should be visible
      expect(screen.getByText('Programming.epub')).toBeInTheDocument();
      expect(screen.queryByText('Song.mp3')).not.toBeInTheDocument();
      expect(screen.queryByText('Movie.mp4')).not.toBeInTheDocument();
    });
  });
});
