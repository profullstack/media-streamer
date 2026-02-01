/**
 * PodcastsContent Deep Link Tests
 *
 * Tests that notification deep link params (podcastId, episodeId, autoplay)
 * correctly select the podcast and auto-play the episode.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PodcastsContent } from './podcasts-content';

// ---- Test data ----

const mockPodcast1 = {
  id: 'pod-1',
  title: 'Podcast One',
  author: 'Author One',
  description: 'Description one',
  imageUrl: null,
  feedUrl: 'https://example.com/feed1.xml',
  website: null,
  subscribedAt: '2024-01-01T00:00:00Z',
  notificationsEnabled: false,
};

const mockPodcast2 = {
  id: 'pod-2',
  title: 'Podcast Two',
  author: 'Author Two',
  description: 'Description two',
  imageUrl: null,
  feedUrl: 'https://example.com/feed2.xml',
  website: null,
  subscribedAt: '2024-01-02T00:00:00Z',
  notificationsEnabled: true,
};

const mockEpisode1 = {
  id: 'ep-1',
  guid: 'guid-1',
  title: 'Episode One',
  description: 'Episode one desc',
  audioUrl: 'https://example.com/ep1.mp3',
  duration: 3600,
  publishedAt: '2024-06-01T00:00:00Z',
  imageUrl: null,
};

const mockEpisode2 = {
  id: 'ep-2',
  guid: 'guid-2',
  title: 'Episode Two',
  description: 'Episode two desc',
  audioUrl: 'https://example.com/ep2.mp3',
  duration: 1800,
  publishedAt: '2024-06-15T00:00:00Z',
  imageUrl: null,
};

// ---- Mocks ----

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isLoggedIn: true, isLoading: false }),
}));

const mockPlayEpisode = vi.fn();
vi.mock('@/contexts/podcast-player', () => ({
  usePodcastPlayer: () => ({
    currentEpisode: null,
    isPlaying: false,
    playEpisode: mockPlayEpisode,
    lastCompletedEpisodeId: null,
  }),
}));

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (html: string) => html },
}));

// Mock fetch
const mockFetch = vi.fn();

// Mock history.replaceState
const mockReplaceState = vi.fn();

function setupFetchMocks() {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/podcasts') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ subscriptions: [mockPodcast1, mockPodcast2] }),
      });
    }
    // Handle episodes for any podcast
    if (url.match(/\/api\/podcasts\/[^/]+\/episodes/)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          episodes: [mockEpisode1, mockEpisode2],
          podcast: { id: 'test', title: 'Test' },
        }),
      });
    }
    if (url.startsWith('/api/podcasts/progress')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ progress: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

describe('PodcastsContent deep link handling', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockPlayEpisode.mockClear();
    mockFetch.mockReset();
    mockReplaceState.mockReset();
    global.fetch = mockFetch;
    Object.defineProperty(window, 'history', {
      writable: true,
      value: { ...window.history, replaceState: mockReplaceState },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should auto-select first podcast when no deep link params', async () => {
    setupFetchMocks();

    render(<PodcastsContent />);

    // pod-1 episodes should load (first podcast auto-selected)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/podcasts/pod-1/episodes'));
    });
  });

  it('should auto-select deep link podcast instead of first', async () => {
    mockSearchParams = new URLSearchParams('podcastId=pod-2&episodeId=ep-2');
    setupFetchMocks();

    render(<PodcastsContent />);

    // pod-2 episodes should load (deep link podcast selected)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/podcasts/pod-2/episodes'));
    });
  });

  it('should auto-play episode when autoplay=true', async () => {
    mockSearchParams = new URLSearchParams('podcastId=pod-2&episodeId=ep-2&autoplay=true');
    setupFetchMocks();

    render(<PodcastsContent />);

    await waitFor(() => {
      expect(mockPlayEpisode).toHaveBeenCalledTimes(1);
    });

    // Verify it was called with the correct episode
    const [episodeArg, podcastArg] = mockPlayEpisode.mock.calls[0];
    expect(episodeArg.id).toBe('ep-2');
    expect(episodeArg.audioUrl).toBe('https://example.com/ep2.mp3');
    expect(podcastArg.id).toBe('pod-2');
  });

  it('should not auto-play episode when autoplay is not set', async () => {
    mockSearchParams = new URLSearchParams('podcastId=pod-2&episodeId=ep-2');
    setupFetchMocks();

    render(<PodcastsContent />);

    // Wait for episodes to load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/podcasts/pod-2/episodes'));
    });

    // playEpisode should NOT have been called
    expect(mockPlayEpisode).not.toHaveBeenCalled();
  });

  it('should clean up URL params after handling deep link', async () => {
    mockSearchParams = new URLSearchParams('podcastId=pod-2&episodeId=ep-2&autoplay=true');
    setupFetchMocks();

    render(<PodcastsContent />);

    await waitFor(() => {
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/podcasts');
    });
  });
});
