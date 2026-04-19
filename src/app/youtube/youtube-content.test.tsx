import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YouTubeContent } from './youtube-content';

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockFetch = vi.fn();

describe('YouTubeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  it('shows video details in the player panel after selecting a result', async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === '/api/youtube/accounts') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            accounts: [
              {
                id: 'account-1',
                email: 'user@example.com',
                displayName: 'User Account',
                avatarUrl: null,
                isDefault: true,
                hasSearchAccess: true,
                createdAt: '2026-04-19T00:00:00.000Z',
              },
            ],
          }),
        });
      }

      if (url.startsWith('/api/youtube/search?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                videoId: 'video-123',
                title: 'Lex Fridman Podcast #1',
                description: 'Long-form interview and discussion.',
                channelTitle: 'Lex Clips',
                channelId: 'channel-123',
                publishedAt: '2026-04-18T12:00:00.000Z',
                thumbnailUrl: 'https://example.com/thumb.jpg',
              },
            ],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    render(<YouTubeContent />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/youtube/accounts');
    });

    await user.type(screen.getByPlaceholderText('Search YouTube…'), 'lex friedman');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    let resultButton: HTMLButtonElement | null = null;
    await waitFor(() => {
      resultButton = screen.getByText('Lex Fridman Podcast #1').closest('button');
      expect(resultButton).toBeInTheDocument();
    });

    await user.click(resultButton!);

    expect(screen.getByRole('heading', { level: 2, name: 'Lex Fridman Podcast #1' })).toBeInTheDocument();
    expect(screen.getByText('Long-form interview and discussion.')).toBeInTheDocument();
    expect(screen.getByText('Apr 18, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lex Clips' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/channel/channel-123'
    );
    expect(screen.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=video-123'
    );
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/video-123?autoplay=1'
    );
  });
});
