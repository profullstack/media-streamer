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
      <section className="p-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Newspaper className="w-6 h-6" />
          News
        </h2>
        <div data-testid="news-loading" className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="p-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Newspaper className="w-6 h-6" />
          News
        </h2>
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
      <section className="p-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Newspaper className="w-6 h-6" />
          News
        </h2>
        <div data-testid="news-empty" className="text-center py-12 text-gray-500">
          <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No news articles found</p>
        </div>
      </section>
    );
  }

  return (
    <section className="p-6">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Newspaper className="w-6 h-6" />
        News
      </h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <article
            key={article.uuid}
            data-testid="news-article"
            role="article"
            className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-700 transition-colors cursor-pointer"
            onClick={() => setSelectedArticle(article)}
          >
            {article.imageUrl && (
              <div className="aspect-video bg-gray-900">
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-2 line-clamp-2">{article.title}</h3>
              
              {article.snippet && (
                <p className="text-gray-400 text-sm mb-2 line-clamp-2">{article.snippet}</p>
              )}
              
              {article.description && (
                <p className="text-gray-300 text-sm mb-3 line-clamp-2">{article.description}</p>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{article.source}</span>
                <span>{formatDate(article.publishedAt)}</span>
              </div>

              {article.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {article.categories.map((category) => (
                    <span
                      key={category}
                      className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Modal */}
      {selectedArticle && (
        <div
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
        </div>
      )}
    </section>
  );
}
