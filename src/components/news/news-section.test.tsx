/**
 * News Section Component Tests
 *
 * Tests for the news section that displays articles from TheNewsAPI
 * with a modal iframe for viewing full articles.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewsSection } from './news-section';

// Mock useAuth - default to non-premium, can be overridden per test
const mockUseAuth = vi.fn(() => ({ isPremium: false }));
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('NewsSection', () => {
  const mockArticles = [
    {
      uuid: 'article-1',
      title: 'Bitcoin Reaches New High',
      description: 'Bitcoin has reached a new all-time high today.',
      snippet: 'Bitcoin has reached a new all-time high today, surpassing previous records...',
      url: 'https://example.com/bitcoin-high',
      imageUrl: 'https://example.com/bitcoin.jpg',
      publishedAt: '2026-01-04T06:00:00.000000Z',
      source: 'cryptonews.com',
      categories: ['crypto', 'finance'],
    },
    {
      uuid: 'article-2',
      title: 'Ethereum Update Released',
      description: 'The latest Ethereum update brings new features.',
      snippet: 'The latest Ethereum update brings new features and improvements...',
      url: 'https://example.com/ethereum-update',
      imageUrl: 'https://example.com/ethereum.jpg',
      publishedAt: '2026-01-04T05:00:00.000000Z',
      source: 'blocknews.com',
      categories: ['crypto'],
    },
    {
      uuid: 'article-3',
      title: 'Market Analysis',
      description: null,
      snippet: null,
      url: 'https://example.com/market',
      imageUrl: null,
      publishedAt: '2026-01-04T04:00:00.000000Z',
      source: 'finance.com',
      categories: [],
    },
  ];

  const mockApiResponse = {
    articles: mockArticles,
    meta: {
      found: 100,
      returned: 3,
      limit: 10,
      page: 1,
    },
  };

  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isPremium: false });
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should show loading state initially', () => {
      render(<NewsSection />);

      expect(screen.getByTestId('news-loading')).toBeInTheDocument();
    });

    it('should display articles after loading', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        })).toBeInTheDocument();
      });

      expect(screen.getByText((content, element) => {
        return element?.tagName.toLowerCase() === 'h3' && content === 'Ethereum Update Released';
      })).toBeInTheDocument();
      expect(screen.getByText((content, element) => {
        return element?.tagName.toLowerCase() === 'h3' && content === 'Market Analysis';
      })).toBeInTheDocument();
    });

    it('should display article title', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        })).toBeInTheDocument();
      });
    });

    it('should display article snippet', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByText(/Bitcoin has reached a new all-time high today, surpassing/)).toBeInTheDocument();
      });
    });

    it('should display article source', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByText('cryptonews.com')).toBeInTheDocument();
      });
    });

    it('should display article snippet or description', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        // Component shows snippet if available, otherwise description
        // First article has snippet, so we look for that
        expect(screen.getByText(/Bitcoin has reached a new all-time high today, surpassing/)).toBeInTheDocument();
      });
    });

    it('should display article categories', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        // Use getAllByText since 'crypto' appears in multiple articles
        const cryptoCategories = screen.getAllByText('crypto');
        expect(cryptoCategories.length).toBeGreaterThan(0);
        expect(screen.getByText('finance')).toBeInTheDocument();
      });
    });

    it('should handle articles with null description gracefully', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByText('Market Analysis')).toBeInTheDocument();
      });

      // Should not crash when description is null
      const articleCard = screen.getByText('Market Analysis').closest('[data-testid="news-article"]');
      expect(articleCard).toBeInTheDocument();
    });

    it('should handle articles with empty categories', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByText('Market Analysis')).toBeInTheDocument();
      });

      // Article with empty categories should still render
      const articleCard = screen.getByText('Market Analysis').closest('[data-testid="news-article"]');
      expect(articleCard).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when API fails', async () => {
      fetchSpy.mockReset();
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByTestId('news-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/Failed to load news/)).toBeInTheDocument();
    });

    it('should display error message when fetch throws', async () => {
      fetchSpy.mockReset();
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByTestId('news-error')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      fetchSpy.mockReset();
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('should retry fetching when retry button is clicked', async () => {
      fetchSpy.mockReset();
      fetchSpy
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        } as Response);

      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        })).toBeInTheDocument();
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Modal Functionality', () => {
    it('should open modal when article is clicked', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });
    });

    it('should display iframe with article URL in modal', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        const iframe = screen.getByTestId('news-iframe');
        expect(iframe).toBeInTheDocument();
        expect(iframe).toHaveAttribute('src', 'https://example.com/bitcoin-high');
      });
    });

    it('should close modal when close button is clicked', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('modal-close-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('news-modal')).not.toBeInTheDocument();
      });
    });

    it('should close modal when clicking outside', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('modal-backdrop'));

      await waitFor(() => {
        expect(screen.queryByTestId('news-modal')).not.toBeInTheDocument();
      });
    });

    it('should close modal when Escape key is pressed', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('news-modal')).not.toBeInTheDocument();
      });
    });

    it('should display article title in modal header', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        const modalHeader = screen.getByTestId('modal-header');
        expect(modalHeader).toHaveTextContent('Bitcoin Reaches New High');
      });
    });

    it('should have link to open article in new tab', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        const externalLink = screen.getByTestId('open-external-link');
        expect(externalLink).toBeInTheDocument();
        expect(externalLink).toHaveAttribute('href', 'https://example.com/bitcoin-high');
        expect(externalLink).toHaveAttribute('target', '_blank');
        expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });
  });

  describe('API Integration', () => {
    it('should call the news API on mount', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/news?limit=10');
      });
    });

    it('should pass custom search term to API', async () => {
      render(<NewsSection searchTerm="bitcoin" />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/news?limit=10&search=bitcoin');
      });
    });

    it('should pass custom limit to API', async () => {
      render(<NewsSection limit={5} />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/news?limit=5');
      });
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no articles are returned', async () => {
      fetchSpy.mockReset();
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ articles: [], meta: { found: 0, returned: 0, limit: 10, page: 1 } }),
      } as Response);

      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByTestId('news-empty')).toBeInTheDocument();
      });

      expect(screen.getByText(/No news articles found/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible article cards', async () => {
      render(<NewsSection />);

      await waitFor(() => {
        expect(screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        })).toBeInTheDocument();
      });

      const articles = screen.getAllByTestId('news-article');
      articles.forEach(article => {
        expect(article).toHaveAttribute('role', 'article');
      });
    });

    it('should have accessible modal', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        const modal = screen.getByTestId('news-modal');
        expect(modal).toHaveAttribute('role', 'dialog');
        expect(modal).toHaveAttribute('aria-modal', 'true');
      });
    });
  });

  describe('Scroll Buttons', () => {
    const mockSummaryResponse = {
      success: true,
      data: {
        title: 'Bitcoin Reaches New High',
        summary: 'This is a test summary of the article about Bitcoin reaching new highs.',
        keyPoints: ['Key point 1', 'Key point 2', 'Key point 3'],
        images: [],
        publishedDate: null,
        author: 'John Doe',
        source: 'cryptonews.com',
      },
    };

    it('should show scroll buttons when viewing iframe', async () => {
      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-iframe')).toBeInTheDocument();
      });

      // Scroll buttons should be present in iframe view for TV navigation
      expect(screen.getByRole('button', { name: /scroll up/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /scroll down/i })).toBeInTheDocument();
    });

    it('should show scroll buttons when viewing AI summary', async () => {
      mockUseAuth.mockReturnValue({ isPremium: true });

      fetchSpy.mockReset();
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummaryResponse),
        } as Response);

      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });

      // Click the summarize button
      const summarizeButton = screen.getByRole('button', { name: /summarize/i });
      fireEvent.click(summarizeButton);

      // Wait for summary to load and scroll buttons to appear
      await waitFor(() => {
        expect(screen.getByText(/This is a test summary/)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /scroll up/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /scroll down/i })).toBeInTheDocument();
    });

    it('should have correct aria-labels on scroll buttons', async () => {
      mockUseAuth.mockReturnValue({ isPremium: true });

      fetchSpy.mockReset();
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummaryResponse),
        } as Response);

      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });

      const summarizeButton = screen.getByRole('button', { name: /summarize/i });
      fireEvent.click(summarizeButton);

      await waitFor(() => {
        expect(screen.getByText(/This is a test summary/)).toBeInTheDocument();
      });

      const scrollUpButton = screen.getByRole('button', { name: /scroll up/i });
      const scrollDownButton = screen.getByRole('button', { name: /scroll down/i });

      expect(scrollUpButton).toHaveAttribute('aria-label', 'Scroll up');
      expect(scrollDownButton).toHaveAttribute('aria-label', 'Scroll down');
    });

    it('should call scrollBy when scroll buttons are clicked', async () => {
      mockUseAuth.mockReturnValue({ isPremium: true });

      fetchSpy.mockReset();
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummaryResponse),
        } as Response);

      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });

      const summarizeButton = screen.getByRole('button', { name: /summarize/i });
      fireEvent.click(summarizeButton);

      await waitFor(() => {
        expect(screen.getByText(/This is a test summary/)).toBeInTheDocument();
      });

      // Mock scrollBy on the content element
      const scrollByMock = vi.fn();
      const summaryContent = screen.getByText(/This is a test summary/).closest('.overflow-y-auto');
      if (summaryContent) {
        summaryContent.scrollBy = scrollByMock;
      }

      const scrollDownButton = screen.getByRole('button', { name: /scroll down/i });
      fireEvent.click(scrollDownButton);

      expect(scrollByMock).toHaveBeenCalledWith({
        top: 200,
        behavior: 'smooth',
      });

      const scrollUpButton = screen.getByRole('button', { name: /scroll up/i });
      fireEvent.click(scrollUpButton);

      expect(scrollByMock).toHaveBeenCalledWith({
        top: -200,
        behavior: 'smooth',
      });
    });

    it('should keep scroll buttons visible when switching from summary to iframe view', async () => {
      mockUseAuth.mockReturnValue({ isPremium: true });

      fetchSpy.mockReset();
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummaryResponse),
        } as Response);

      render(<NewsSection />);

      let articleTitle: HTMLElement;
      await waitFor(() => {
        articleTitle = screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'h3' && content === 'Bitcoin Reaches New High';
        });
        expect(articleTitle).toBeInTheDocument();
      });

      fireEvent.click(articleTitle!);

      await waitFor(() => {
        expect(screen.getByTestId('news-modal')).toBeInTheDocument();
      });

      const summarizeButton = screen.getByRole('button', { name: /summarize/i });
      fireEvent.click(summarizeButton);

      await waitFor(() => {
        expect(screen.getByText(/This is a test summary/)).toBeInTheDocument();
      });

      // Scroll buttons should be visible in summary view
      expect(screen.getByRole('button', { name: /scroll up/i })).toBeInTheDocument();

      // Click the toggle button to switch back to iframe view (FileText icon button)
      const toggleButton = screen.getByTitle(/show original article/i);
      fireEvent.click(toggleButton);

      // Scroll buttons should remain visible in iframe view for TV navigation
      await waitFor(() => {
        expect(screen.getByTestId('news-iframe')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /scroll up/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /scroll down/i })).toBeInTheDocument();
    });
  });
});
