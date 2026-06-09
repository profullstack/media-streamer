import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YouTubeContent } from './youtube-content';

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
                hasSubscriptionManageAccess: true,
                hasCommentWriteAccess: true,
                createdAt: '2026-04-19T00:00:00.000Z',
              },
            ],
          }),
        });
      }

      if (url.startsWith('/api/youtube/subscriptions?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [],
            nextPageToken: null,
            prevPageToken: null,
          }),
        });
      }

      if (url === '/api/youtube/subscriptions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ subscriptionId: 'subscription-123', channelId: 'channel-123' }),
        });
      }

      if (url.startsWith('/api/youtube/videos?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            video: {
              videoId: 'video-123',
              title: 'Lex Fridman Podcast #1',
              description:
                'Long-form interview and discussion.\n\nThis is the full video description with enough extra detail to require the collapsed description preview in the player panel. It includes guest notes, links, timestamps, and production credits for viewers who want the complete context before reading comments.',
              channelTitle: 'Lex Clips',
              channelId: 'channel-123',
              publishedAt: '2026-04-18T12:00:00.000Z',
              thumbnailUrl: 'https://example.com/thumb.jpg',
            },
          }),
        });
      }

      if (url.startsWith('/api/youtube/comments?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                commentId: 'comment-1',
                authorDisplayName: 'Ada Viewer',
                authorProfileImageUrl: null,
                authorChannelUrl: 'https://youtube.com/@ada',
                publishedAt: '2026-04-18T13:30:00.000Z',
                updatedAt: null,
                body: 'The discussion around AI alignment was useful.',
                likeCount: 12,
                totalReplyCount: 1,
              },
            ],
            nextPageToken: null,
            prevPageToken: null,
          }),
        });
      }

      if (url === '/api/youtube/comments') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            comment: {
              commentId: 'comment-new',
              authorDisplayName: 'User Account',
              authorProfileImageUrl: null,
              authorChannelUrl: null,
              publishedAt: '2026-04-18T14:00:00.000Z',
              updatedAt: null,
              body: 'Thanks for the interview.',
              likeCount: 0,
              totalReplyCount: 0,
            },
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Read more' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Read more' }));
    expect(screen.getByText(/production credits for viewers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();

    expect(await screen.findByText('Ada Viewer')).toBeInTheDocument();
    expect(screen.getByText('The discussion around AI alignment was useful.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Add a comment'), 'Thanks for the interview.');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/youtube/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            accountId: 'account-1',
            videoId: 'video-123',
            body: 'Thanks for the interview.',
          }),
        })
      );
    });
    expect(await screen.findByText('Comment posted.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/youtube/subscriptions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            accountId: 'account-1',
            channelId: 'channel-123',
          }),
        })
      );
    });
  });

  it('shows subscribed channels and plays a recent channel video', async () => {
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
                hasSubscriptionManageAccess: true,
                hasCommentWriteAccess: true,
                createdAt: '2026-04-19T00:00:00.000Z',
              },
            ],
          }),
        });
      }

      if (url === '/api/youtube/subscriptions?accountId=account-1') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                subscriptionId: 'subscription-1',
                channelId: 'channel-1',
                title: 'Science Channel',
                description: 'Science videos.',
                thumbnailUrl: 'https://example.com/channel.jpg',
                publishedAt: '2026-04-01T00:00:00.000Z',
                newItemCount: 2,
                totalItemCount: 50,
              },
            ],
            nextPageToken: null,
            prevPageToken: null,
          }),
        });
      }

      if (url === '/api/youtube/subscriptions/videos?accountId=account-1&channelId=channel-1') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                videoId: 'channel-video-1',
                title: 'New Science Upload',
                description: 'Recent channel video.',
                channelTitle: 'Science Channel',
                channelId: 'channel-1',
                publishedAt: '2026-04-21T12:00:00.000Z',
                thumbnailUrl: 'https://example.com/video.jpg',
              },
            ],
            nextPageToken: null,
            prevPageToken: null,
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ items: [] }),
      });
    });

    render(<YouTubeContent />);

    expect(await screen.findByRole('button', { name: /Science Channel/i })).toBeInTheDocument();
    expect(await screen.findByText('New Science Upload')).toBeInTheDocument();

    await user.click(screen.getByText('New Science Upload').closest('button')!);

    expect(screen.getByRole('heading', { level: 2, name: 'New Science Upload' })).toBeInTheDocument();
    expect(screen.getByText('Recent channel video.')).toBeInTheDocument();
    expect(screen.getByTitle('YouTube video player')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/channel-video-1?autoplay=1'
    );
  });
});
