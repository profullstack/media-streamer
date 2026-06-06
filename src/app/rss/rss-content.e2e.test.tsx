import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RssContent } from './rss-content';

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockFetch = vi.fn();

const readerResponse = {
  subscriptions: [
    {
      id: 'sub-1',
      profileId: 'profile-1',
      feedId: 'feed-1',
      customTitle: null,
      folder: 'Tech',
      notifyNewItems: false,
      isActive: true,
      createdAt: '2026-06-06T00:00:00.000Z',
      updatedAt: '2026-06-06T00:00:00.000Z',
      feed: {
        id: 'feed-1',
        title: 'Example Feed',
        feedUrl: 'https://example.com/feed.xml',
        siteUrl: 'https://example.com',
        imageUrl: null,
        description: 'Example updates',
        lastFetchedAt: '2026-06-06T00:00:00.000Z',
        lastFetchError: null,
      },
    },
  ],
  items: [
    {
      id: 'item-1',
      feedId: 'feed-1',
      title: 'First RSS Article',
      link: 'https://example.com/first',
      author: 'Reporter',
      summary: '<p>Article summary</p>',
      content: null,
      publishedAt: '2026-06-06T12:00:00.000Z',
      feed: {
        id: 'feed-1',
        title: 'Example Feed',
        feedUrl: 'https://example.com/feed.xml',
        siteUrl: 'https://example.com',
        imageUrl: null,
      },
      isRead: false,
      isSaved: false,
    },
  ],
};

describe('RSS reader browser flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockFetch.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.startsWith('/api/rss/import')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ total: 1, imported: [{ feedUrl: 'https://example.com/feed.xml', feedId: 'feed-1', title: 'Example Feed', folder: 'Tech' }], failed: [] }),
        });
      }

      if (url.startsWith('/api/rss/items/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ itemId: 'item-1', isRead: true, isSaved: false, readAt: '2026-06-06T12:00:00.000Z', savedAt: null }),
        });
      }

      if (url === '/api/rss/items' && method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ feedId: null, isRead: true, updatedCount: 1 }),
        });
      }

      if (url === '/api/rss' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ subscription: readerResponse.subscriptions[0] }),
        });
      }

      if (url.startsWith('/api/rss')) {
        return Promise.resolve({
          ok: true,
          json: async () => readerResponse,
        });
      }

      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('loads articles, previews one, adds a feed, and imports OPML', async () => {
    const user = userEvent.setup();
    render(<RssContent />);

    await waitFor(() => {
      expect(screen.getAllByText('First RSS Article').length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByText('First RSS Article')[0]);
    expect(screen.getByRole('link', { name: /open article/i })).toHaveAttribute('href', 'https://example.com/first');
    expect(screen.getAllByText('Article summary').length).toBeGreaterThan(1);

    await user.click(screen.getByRole('button', { name: /all read/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/rss/items', expect.objectContaining({ method: 'PATCH' }));
    });

    await user.click(screen.getByRole('button', { name: /https:\/\/example\.com\/feed\.xml/i }));
    await user.click(screen.getByRole('button', { name: /feed unread/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/rss/items', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ feedId: 'feed-1', isRead: false }),
      }));
    });

    await user.type(screen.getByPlaceholderText('https://example.com/feed.xml'), 'https://another.example.com/rss');
    await user.type(screen.getByPlaceholderText('Folder'), 'News');
    await user.click(screen.getByRole('button', { name: /add rss feed/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/rss', expect.objectContaining({ method: 'POST' }));
    });

    const upload = screen.getByLabelText('OPML file') as HTMLInputElement;
    const file = new File(['<opml><body><outline xmlUrl="https://example.com/feed.xml"/></body></opml>'], 'feeds.opml', { type: 'text/xml' });
    await user.upload(upload, file);

    await waitFor(() => {
      expect(screen.getByText(/imported 1 of 1 feeds/i)).toBeInTheDocument();
    });
  });
});
