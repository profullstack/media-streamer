'use client';

/**
 * News Section Component
 * 
 * Displays news articles from TheNewsAPI with a modal iframe for viewing full articles.
 * Shows title, snippet, source, description, and categories for each article.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, RefreshCw, Newspaper, Sparkles, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

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

interface ArticleSummary {
  title: string;
  summary: string;
  keyPoints: string[];
  images: string[];
  publishedDate: string | null;
  author: string | null;
  source: string | null;
}

export interface NewsSectionProps {
  searchTerm?: string;
  limit?: number;
}

export function NewsSection({ searchTerm, limit = 10 }: NewsSectionProps): React.ReactElement {
  const { isPremium } = useAuth();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  // AI Summary state
  const [summary, setSummary] = useState<ArticleSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);

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
        handleCloseModal();
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

  const handleSummarize = async (): Promise<void> => {
    if (!selectedArticle) return;

    setIsSummarizing(true);
    setSummaryError(null);

    try {
      const response = await fetch('/api/news/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: selectedArticle.url }),
      });

      const data = await response.json() as { success: boolean; data?: ArticleSummary; error?: string };

      if (!response.ok || !data.success) {
        setSummaryError(data.error || 'Failed to summarize article');
        return;
      }

      setSummary(data.data || null);
      setShowSummary(true);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to summarize article');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleCloseModal = (): void => {
    setSelectedArticle(null);
    setSummary(null);
    setSummaryError(null);
    setShowSummary(false);
    setIframeBlocked(false);
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8"
        >
          {/* Backdrop */}
          <div
            data-testid="modal-backdrop"
            className="absolute inset-0 bg-black/80"
            onClick={handleCloseModal}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-4xl h-[80vh] bg-gray-900 rounded-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div
              data-testid="modal-header"
              className="flex items-center justify-between p-4 border-b border-gray-700"
            >
              <h3 className="font-semibold text-lg truncate pr-4">{selectedArticle.title}</h3>
              <div className="flex items-center gap-2">
                {/* View Toggle (when summary exists) */}
                {summary && (
                  <button
                    onClick={() => setShowSummary(!showSummary)}
                    className={`p-2 rounded transition-colors ${showSummary ? 'bg-purple-600 hover:bg-purple-700' : 'hover:bg-gray-700'}`}
                    title={showSummary ? 'Show original article' : 'Show AI summary'}
                  >
                    <FileText className="w-5 h-5" />
                  </button>
                )}
                {/* Summarize Button (premium only) */}
                {isPremium && !summary && (
                  <button
                    onClick={() => void handleSummarize()}
                    disabled={isSummarizing}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-sm"
                    title="Summarize with AI"
                  >
                    {isSummarizing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>{isSummarizing ? 'Summarizing...' : 'Summarize'}</span>
                  </button>
                )}
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
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-gray-700 rounded transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Summary Error */}
            {summaryError && (
              <div className="px-4 py-2 bg-red-900/50 text-red-300 text-sm">
                {summaryError}
              </div>
            )}

            {/* Content Area */}
            {showSummary && summary ? (
              /* AI Summary View */
              <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-gray-800">
                {/* Summary Header */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">{summary.title}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    {summary.source && <span>{summary.source}</span>}
                    {summary.author && <span>By {summary.author}</span>}
                    {summary.publishedDate && <span>{formatDate(summary.publishedDate)}</span>}
                  </div>
                </div>

                {/* Images */}
                {summary.images.length > 0 && (
                  <div className="mb-6 flex gap-4 overflow-x-auto pb-2">
                    {summary.images.slice(0, 3).map((imageUrl, index) => (
                      <div key={index} className="flex-shrink-0 rounded-lg overflow-hidden bg-gray-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt={`Article image ${index + 1}`}
                          className="h-48 w-auto object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary Text */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-purple-400">Summary</h3>
                  <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{summary.summary}</p>
                </div>

                {/* Key Points */}
                {summary.keyPoints.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-purple-400">Key Points</h3>
                    <ul className="space-y-2">
                      {summary.keyPoints.map((point, index) => (
                        <li key={index} className="flex items-start gap-2 text-gray-200">
                          <span className="text-purple-400 mt-1">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI Disclaimer */}
                <div className="mt-8 pt-4 border-t border-gray-700 text-xs text-gray-500">
                  This summary was generated by AI and may not perfectly reflect the original article.
                </div>
              </div>
            ) : iframeBlocked ? (
              /* Iframe Blocked Fallback */
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 bg-gray-800 overflow-y-auto">
                <div className="text-center max-w-md">
                  <Newspaper className="w-16 h-16 mx-auto mb-4 text-gray-500" />
                  <h3 className="text-xl font-semibold mb-2">Article Preview Blocked</h3>
                  <p className="text-gray-400 mb-6">
                    This website doesn&apos;t allow embedding. You can open the article in a new tab or use AI to summarize it.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {isPremium && !summary && (
                      <button
                        onClick={() => void handleSummarize()}
                        disabled={isSummarizing}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        {isSummarizing ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Sparkles className="w-5 h-5" />
                        )}
                        <span>{isSummarizing ? 'Summarizing...' : 'Summarize with AI'}</span>
                      </button>
                    )}
                    <a
                      href={selectedArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-5 h-5" />
                      <span>Open in New Tab</span>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              /* Iframe View */
              <div className="flex-1 min-h-0 bg-white relative overflow-auto">
                <iframe
                  data-testid="news-iframe"
                  src={selectedArticle.url}
                  className="w-full h-full min-h-[60vh] border-0"
                  title={selectedArticle.title}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  onError={() => setIframeBlocked(true)}
                />
              </div>
            )}
          </div>
        </div> : null}
    </section>
  );
}
