'use client';

/**
 * News Section Component
 * 
 * Displays news articles from TheNewsAPI with a modal iframe for viewing full articles.
 * Shows title, snippet, source, description, and categories for each article.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, RefreshCw, Newspaper } from 'lucide-react';

interface NewsArticle {
  uuid: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  source: string;
  categories: string[];
}

interface NewsResponse {
  articles: NewsArticle[];
  meta: {
    found: number;
    returned: number;
    limit: number;
    page: number;
  };
}

export interface NewsSectionProps {
  searchTerm?: string;
  limit?: number;
}

export function NewsSection({ searchTerm, limit = 10 }: NewsSectionProps): React.ReactElement {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (searchTerm) {
        params.set('search', searchTerm);
      }

      const response = await fetch(`/api/news?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch news');
      }

      const data: NewsResponse = await response.json();
      setArticles(data.articles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, limit]);

  useEffect(() => {
    void fetchNews();
  }, [fetchNews]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && selectedArticle) {
        setSelectedArticle(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedArticle]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <section>
        <div data-testid="news-loading" className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <div data-testid="news-error" className="text-center py-12">
          <p className="text-red-500 mb-4">Failed to load news: {error}</p>
          <button
            onClick={() => void fetchNews()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (articles.length === 0) {
    return (
      <section>
        <div data-testid="news-empty" className="text-center py-12 text-gray-500">
          <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No news articles found</p>
        </div>
      </section>
    );
  }

  return (
    <section>

      <div className="flex flex-col gap-2">
        {articles.map((article) => (
          <article
            key={article.uuid}
            data-testid="news-article"
            role="article"
            className="bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer flex items-center gap-3 p-3"
            onClick={() => setSelectedArticle(article)}
          >
            {article.imageUrl ? (
              <div className="w-16 h-16 flex-shrink-0 bg-gray-900 rounded overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- External news article images from TheNewsAPI */}
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-16 h-16 flex-shrink-0 bg-gray-900 rounded flex items-center justify-center">
                <Newspaper className="w-6 h-6 text-gray-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm line-clamp-1">{article.title}</h3>

              {(article.snippet || article.description) && (
                <p className="text-gray-400 text-xs line-clamp-1 mt-0.5">
                  {article.snippet || article.description}
                </p>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                <span>{article.source}</span>
                <span>{formatDate(article.publishedAt)}</span>
                {article.categories.length > 0 && (
                  <div className="flex gap-1">
                    {article.categories.slice(0, 2).map((category) => (
                      <span
                        key={category}
                        className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Modal */}
      {selectedArticle ? <div
          data-testid="news-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          {/* Backdrop */}
          <div
            data-testid="modal-backdrop"
            className="absolute inset-0 bg-black/80"
            onClick={() => setSelectedArticle(null)}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-6xl h-[90vh] mx-4 bg-gray-900 rounded-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div
              data-testid="modal-header"
              className="flex items-center justify-between p-4 border-b border-gray-700"
            >
              <h3 className="font-semibold text-lg truncate pr-4">{selectedArticle.title}</h3>
              <div className="flex items-center gap-2">
                <a
                  data-testid="open-external-link"
                  href={selectedArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-gray-700 rounded transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
                <button
                  data-testid="modal-close-button"
                  onClick={() => setSelectedArticle(null)}
                  className="p-2 hover:bg-gray-700 rounded transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Iframe */}
            <div className="flex-1 bg-white">
              <iframe
                data-testid="news-iframe"
                src={selectedArticle.url}
                className="w-full h-full border-0"
                title={selectedArticle.title}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            </div>
          </div>
        </div> : null}
    </section>
  );
}
