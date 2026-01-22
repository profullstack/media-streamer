'use client';

/**
 * News Section Component
 *
 * Displays news articles from TheNewsAPI with a modal iframe for viewing full articles.
 * Shows title, snippet, source, description, and categories for each article.
 *
 * When iframe fails to load, automatically extracts and displays article content
 * using Readability (with Puppeteer fallback for blocked sites).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ExternalLink, RefreshCw, Newspaper, Sparkles, FileText, Loader2, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

// Supported categories from TheNewsAPI
const NEWS_CATEGORIES = [
  'general',
  'science',
  'sports',
  'business',
  'health',
  'entertainment',
  'tech',
  'politics',
  'food',
  'travel',
] as const;

type NewsCategory = typeof NEWS_CATEGORIES[number];

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

interface ArticleContent {
  title: string;
  byline: string | null;
  content: string;
  textContent: string;
  excerpt: string | null;
  siteName: string | null;
  length: number;
  extractedAt: number;
  fetchMethod: 'fetch' | 'puppeteer';
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
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory | null>(null);

  // AI Summary state
  const [summary, setSummary] = useState<ArticleSummary | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Iframe and content extraction state
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [extractedContent, setExtractedContent] = useState<ArticleContent | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [_showExtractedContent, setShowExtractedContent] = useState(false);

  // Scroll refs for TV navigation
  const contentRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  // Scroll content - works for both summary div and iframe container
  const scrollContent = (direction: 'up' | 'down'): void => {
    const scrollAmount = 200;
    const scrollDelta = direction === 'down' ? scrollAmount : -scrollAmount;

    // Scroll the summary content div
    if (contentRef.current) {
      contentRef.current.scrollBy({
        top: scrollDelta,
        behavior: 'smooth',
      });
    }

    // Scroll the iframe container (workaround for cross-origin restriction)
    if (iframeContainerRef.current) {
      iframeContainerRef.current.scrollBy({
        top: scrollDelta,
        behavior: 'smooth',
      });
    }
  };

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (searchTerm) {
        params.set('search', searchTerm);
      }
      if (selectedCategory) {
        params.set('category', selectedCategory);
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
  }, [searchTerm, limit, selectedCategory]);

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

  // Extract article content when iframe fails
  const handleExtractContent = useCallback(async (): Promise<void> => {
    if (!selectedArticle) return;

    setIsExtracting(true);
    setExtractionError(null);

    try {
      const response = await fetch('/api/news/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: selectedArticle.url }),
      });

      const data = await response.json() as { success: boolean; data?: ArticleContent; error?: string };

      if (!response.ok || !data.success) {
        setExtractionError(data.error || 'Failed to extract article content');
        return;
      }

      setExtractedContent(data.data || null);
      setShowExtractedContent(true);
    } catch (err) {
      setExtractionError(err instanceof Error ? err.message : 'Failed to extract article content');
    } finally {
      setIsExtracting(false);
    }
  }, [selectedArticle]);

  // Auto-extract content when iframe is blocked
  useEffect(() => {
    if (iframeBlocked && selectedArticle && !extractedContent && !isExtracting && !extractionError) {
      void handleExtractContent();
    }
  }, [iframeBlocked, selectedArticle, extractedContent, isExtracting, extractionError, handleExtractContent]);

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
    setExtractedContent(null);
    setExtractionError(null);
    setShowExtractedContent(false);
    setIsExtracting(false);
  };

  // Handle iframe load error - also detect X-Frame-Options blocking
  const handleIframeError = (): void => {
    setIframeBlocked(true);
  };

  // Detect iframe blocking via load event (some sites load but show blank)
  const handleIframeLoad = (): void => {
    // Check if iframe content is accessible (same-origin only)
    // Cross-origin iframes will throw an error when accessing contentDocument
    try {
      const iframe = iframeRef.current;
      if (iframe) {
        // Try to access the iframe content - this will fail for cross-origin
        // but that's expected. We only care about detecting X-Frame-Options blocking.
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body && doc.body.innerHTML === '') {
          // Empty body might indicate blocking
          setIframeBlocked(true);
        }
      }
    } catch {
      // Cross-origin error is expected - iframe loaded successfully
    }
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
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
            selectedCategory === null
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          All
        </button>
        {NEWS_CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-3 py-1.5 rounded-full text-sm capitalize transition-colors ${
              selectedCategory === category
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

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

              {(article.snippet || article.description) ? <p className="text-gray-400 text-xs line-clamp-1 mt-0.5">
                  {article.snippet || article.description}
                </p> : null}

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
          className="fixed inset-0 z-50 overflow-y-auto"
        >
          <div className="min-h-screen flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            data-testid="modal-backdrop"
            className="fixed inset-0 bg-black/80"
            onClick={handleCloseModal}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-4xl h-[75vh] bg-gray-900 rounded-lg overflow-hidden flex flex-col z-10">
            {/* Header */}
            <div
              data-testid="modal-header"
              className="flex items-center justify-between p-4 border-b border-gray-700"
            >
              <h3 className="font-semibold text-lg truncate pr-4">{selectedArticle.title}</h3>
              <div className="flex items-center gap-2">
                {/* View Toggle (when summary exists) */}
                {summary ? <button
                    onClick={() => setShowSummary(!showSummary)}
                    className={`p-2 rounded transition-colors ${showSummary ? 'bg-purple-600 hover:bg-purple-700' : 'hover:bg-gray-700'}`}
                    title={showSummary ? 'Show original article' : 'Show AI summary'}
                  >
                    <FileText className="w-5 h-5" />
                  </button> : null}
                {/* Summarize Button (premium only) */}
                {isPremium && !summary ? <button
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
                  </button> : null}
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
            {summaryError ? <div className="px-4 py-2 bg-red-900/50 text-red-300 text-sm">
                {summaryError}
              </div> : null}

            {/* Content Area */}
            {showSummary && summary ? (
              /* AI Summary View */
              <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto p-6 bg-gray-800">
                {/* Article Image - Use original article image */}
                {selectedArticle.imageUrl ? <div className="mb-4 rounded-lg overflow-hidden bg-gray-900 float-right ml-4 w-32">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedArticle.imageUrl}
                      alt={summary.title}
                      className="w-full h-24 object-cover"
                      loading="lazy"
                    />
                  </div> : null}

                {/* Summary Header */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">{summary.title}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    <span>{selectedArticle.source}</span>
                    {summary.author ? <span>By {summary.author}</span> : null}
                    <span>{formatDate(selectedArticle.publishedAt)}</span>
                  </div>
                </div>

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
                <div className="mt-8 pt-4 border-t border-gray-700 text-xs text-gray-500 pb-16">
                  This summary was generated by AI and may not perfectly reflect the original article.
                </div>
              </div>
            ) : iframeBlocked ? (
              /* Iframe Blocked - Show extracted content or loading/error state */
              isExtracting ? (
                /* Loading state while extracting content */
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 bg-gray-800">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
                  <p className="text-gray-300">Fetching article content...</p>
                  <p className="text-gray-500 text-sm mt-2">This may take a moment for some sites</p>
                </div>
              ) : extractionError ? (
                /* Extraction failed - show error */
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 bg-gray-800 overflow-y-auto">
                  <div className="text-center max-w-md">
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
                    <h3 className="text-xl font-semibold mb-2">Unable to Load Article</h3>
                    <p className="text-gray-400 mb-2">
                      This website doesn&apos;t allow embedding and we couldn&apos;t fetch the content.
                    </p>
                    <p className="text-red-400 text-sm mb-6">{extractionError}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <button
                        onClick={() => {
                          setExtractionError(null);
                          void handleExtractContent();
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-5 h-5" />
                        <span>Retry</span>
                      </button>
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
              ) : extractedContent ? (
                /* Show extracted article content */
                <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto p-6 bg-gray-800">
                  {/* Article Image */}
                  {selectedArticle.imageUrl ? <div className="mb-4 rounded-lg overflow-hidden bg-gray-900 float-right ml-4 w-32">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedArticle.imageUrl}
                        alt={extractedContent.title}
                        className="w-full h-24 object-cover"
                        loading="lazy"
                      />
                    </div> : null}

                  {/* Article Header */}
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2">{extractedContent.title}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                      <span>{extractedContent.siteName || selectedArticle.source}</span>
                      {extractedContent.byline ? <span>By {extractedContent.byline}</span> : null}
                      <span>{formatDate(selectedArticle.publishedAt)}</span>
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                        via {extractedContent.fetchMethod === 'puppeteer' ? 'Browser' : 'Direct'}
                      </span>
                    </div>
                  </div>

                  {/* Article Content */}
                  <div
                    className="prose prose-invert prose-sm max-w-none text-gray-200 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: extractedContent.content }}
                  />

                  {/* Actions Footer */}
                  <div className="mt-8 pt-4 border-t border-gray-700 pb-16">
                    <div className="flex flex-wrap items-center gap-4">
                      {isPremium && !summary ? <button
                          onClick={() => void handleSummarize()}
                          disabled={isSummarizing}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                        >
                          {isSummarizing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Sparkles className="w-5 h-5" />
                          )}
                          <span>{isSummarizing ? 'Summarizing...' : 'Get AI Summary'}</span>
                        </button> : null}
                      <a
                        href={selectedArticle.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-5 h-5" />
                        <span>View Original</span>
                      </a>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                      Content extracted via Readability. Some formatting may differ from the original.
                    </p>
                  </div>
                </div>
              ) : (
                /* Fallback - waiting for extraction to start */
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 bg-gray-800">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
                  <p className="text-gray-300">Preparing content...</p>
                </div>
              )
            ) : (
              /* Iframe View - container is scrollable, iframe is tall to allow panning for TV */
              <div
                ref={iframeContainerRef}
                className="flex-1 min-h-0 bg-white relative overflow-y-auto"
              >
                <iframe
                  ref={iframeRef}
                  data-testid="news-iframe"
                  src={selectedArticle.url}
                  className="w-full border-0"
                  style={{ height: '300vh' }}
                  title={selectedArticle.title}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  onError={handleIframeError}
                  onLoad={handleIframeLoad}
                />
              </div>
            )}

          </div>
          </div>

          {/* Scroll Buttons for TV - shown for both summary and iframe views */}
          {((showSummary && summary) || (iframeBlocked && extractedContent) || (!showSummary && !iframeBlocked)) ? <div className="fixed bottom-8 right-8 flex flex-col gap-2 z-[60]">
              <button
                onClick={() => scrollContent('up')}
                className="p-3 bg-gray-700 hover:bg-gray-600 focus:bg-gray-600 rounded-full shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label="Scroll up"
              >
                <ChevronUp className="w-6 h-6" />
              </button>
              <button
                onClick={() => scrollContent('down')}
                className="p-3 bg-gray-700 hover:bg-gray-600 focus:bg-gray-600 rounded-full shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label="Scroll down"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
            </div> : null}
        </div> : null}
    </section>
  );
}
