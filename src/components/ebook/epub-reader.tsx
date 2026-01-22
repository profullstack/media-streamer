'use client';

/**
 * EPUB Reader Component
 *
 * Uses epub.js to render EPUB documents with navigation, themes, and search
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import ePub, { Book, Rendition, NavItem, Contents } from 'epubjs';
import { calculateReadingProgress, useFileDownload, formatDownloadProgress } from '@/lib/ebook';

/**
 * EPUB Reader Props
 */
export interface EpubReaderProps {
  /** URL or ArrayBuffer of the EPUB file */
  file: string | ArrayBuffer;
  /** Expected file size in bytes (used for download progress when Content-Length is unavailable) */
  expectedSize?: number;
  /** Initial location (CFI or percentage) */
  initialLocation?: string;
  /** Theme: light, dark, or sepia */
  theme?: 'light' | 'dark' | 'sepia';
  /** Font size in pixels */
  fontSize?: number;
  /** Callback when location changes */
  onLocationChange?: (location: string, percentage: number) => void;
  /** Callback when book loads */
  onBookLoad?: (book: Book) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Custom class name */
  className?: string;
}

/**
 * Theme colors (for inline styles)
 */
const THEME_COLORS = {
  light: { background: '#ffffff', text: '#1a1a1a', link: '#2563eb' },
  dark: { background: '#1a1a1a', text: '#e0e0e0', link: '#60a5fa' },
  sepia: { background: '#f4ecd8', text: '#5b4636', link: '#8b5a2b' },
};

/**
 * Theme configurations for epub.js
 * Using !important to override EPUB's inline styles
 */
const THEMES = {
  light: {
    body: {
      background: '#ffffff !important',
      color: '#1a1a1a !important',
    },
    'p, div, span, h1, h2, h3, h4, h5, h6, li, td, th': {
      color: '#1a1a1a !important',
    },
    'a': {
      color: '#2563eb !important',
    },
    'img, svg': {
      'max-width': '100% !important',
      height: 'auto !important',
    },
  },
  dark: {
    body: {
      background: '#1a1a1a !important',
      color: '#e0e0e0 !important',
    },
    'p, div, span, h1, h2, h3, h4, h5, h6, li, td, th': {
      color: '#e0e0e0 !important',
    },
    'a': {
      color: '#60a5fa !important',
    },
    'img, svg': {
      'max-width': '100% !important',
      height: 'auto !important',
    },
  },
  sepia: {
    body: {
      background: '#f4ecd8 !important',
      color: '#5b4636 !important',
    },
    'p, div, span, h1, h2, h3, h4, h5, h6, li, td, th': {
      color: '#5b4636 !important',
    },
    'a': {
      color: '#8b5a2b !important',
    },
    'img, svg': {
      'max-width': '100% !important',
      height: 'auto !important',
    },
  },
};

/**
 * EPUB Reader Component
 */
export function EpubReader({
  file,
  expectedSize,
  initialLocation,
  theme = 'dark',
  fontSize = 16,
  onLocationChange,
  onBookLoad,
  onError,
  className = '',
}: EpubReaderProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  // Use shared download hook for URL files
  const downloadUrl = typeof file === 'string' ? file : null;
  const {
    isDownloading,
    progress: downloadProgress,
    downloadedBytes,
    data: downloadedData,
    error: downloadError,
    retry: retryDownload,
  } = useFileDownload(downloadUrl, {
    expectedSize,
    onError,
  });

  // File data is either passed directly or downloaded
  const fileData = typeof file !== 'string' ? file : downloadedData;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bookError, setBookError] = useState<Error | null>(null);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [, setCurrentLocation] = useState<string>('');
  const [percentage, setPercentage] = useState<number>(0);
  const [currentFontSize, setCurrentFontSize] = useState<number>(fontSize);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'sepia'>(theme);

  // Combined error from download or book loading
  const error = downloadError || bookError;

  // Initialize book after file is available
  useEffect(() => {
    if (!containerRef.current || !fileData || isDownloading) return;

    let aborted = false;

    const initBook = async (): Promise<void> => {
      try {
        // Create book instance with ArrayBuffer
        const book = ePub(fileData);

        if (aborted) {
          book.destroy();
          return;
        }

        bookRef.current = book;

        // Wait for book to be ready
        await book.ready;

        if (aborted) return;

        // Get table of contents
        const navigation = await book.loaded.navigation;

        if (aborted) return;

        setToc(navigation.toc);

        // Create rendition
        const rendition = book.renderTo(containerRef.current!, {
          width: '100%',
          height: '100%',
          spread: 'none',
        });
        renditionRef.current = rendition;

        // Register themes
        rendition.themes.register('light', THEMES.light);
        rendition.themes.register('dark', THEMES.dark);
        rendition.themes.register('sepia', THEMES.sepia);

        // Add default styles that apply to all content (ensures images scale properly)
        rendition.themes.default({
          'img': {
            'max-width': '100% !important',
            'height': 'auto !important',
          },
          'svg': {
            'max-width': '100% !important',
            'height': 'auto !important',
          },
          '*': {
            'box-sizing': 'border-box',
          },
        });

        // Hook into content loading to inject CSS directly into each chapter
        rendition.hooks.content.register((contents: Contents) => {
          const colors = THEME_COLORS[theme];
          const cssRules = `
            html, body {
              background: ${colors.background} !important;
              color: ${colors.text} !important;
            }
            body * {
              color: inherit !important;
              background-color: transparent !important;
            }
            a, a * {
              color: ${colors.link} !important;
            }
            img, svg, image {
              max-width: 100% !important;
              height: auto !important;
              display: block;
              margin: 0 auto;
            }
            pre, code {
              background: rgba(128, 128, 128, 0.2) !important;
            }
          `;
          contents.addStylesheetCss(cssRules, 'theme-override');
        });

        // Apply initial theme and font size (use props, not state, to avoid re-init on changes)
        rendition.themes.select(theme);
        rendition.themes.fontSize(`${fontSize}px`);

        // Display initial location or start
        if (initialLocation) {
          await rendition.display(initialLocation);
        } else {
          await rendition.display();
        }

        if (aborted) return;

        // Listen for location changes
        rendition.on('relocated', (location: { start: { cfi: string; percentage: number } }) => {
          const cfi = location.start.cfi;
          const pct = Math.round(location.start.percentage * 100);
          setCurrentLocation(cfi);
          setPercentage(pct);
          onLocationChange?.(cfi, pct);
        });

        setIsLoading(false);
        onBookLoad?.(book);
      } catch (err) {
        if (aborted) return;
        const error = err instanceof Error ? err : new Error('Failed to load EPUB');
        setBookError(error);
        setIsLoading(false);
        onError?.(error);
      }
    };

    initBook();

    // Cleanup
    return () => {
      aborted = true;
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
        renditionRef.current = null;
      }
    };
  // Note: theme and fontSize are intentionally not in deps - we use props for initial setup only
  // Changes to theme/font after init are handled by changeTheme/changeFontSize callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileData, isDownloading, initialLocation, onBookLoad, onError, onLocationChange]);

  // Navigate to previous page
  const goToPreviousPage = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  // Navigate to next page
  const goToNextPage = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  // Navigate to specific location
  const goToLocation = useCallback((href: string) => {
    renditionRef.current?.display(href);
    setShowToc(false);
  }, []);

  // Change font size
  const changeFontSize = useCallback((delta: number) => {
    setCurrentFontSize((prev) => {
      const newSize = Math.max(12, Math.min(32, prev + delta));
      renditionRef.current?.themes.fontSize(`${newSize}px`);
      return newSize;
    });
  }, []);

  // Change theme
  const changeTheme = useCallback((newTheme: 'light' | 'dark' | 'sepia') => {
    setCurrentTheme(newTheme);
    const rendition = renditionRef.current;
    if (!rendition) return;

    // Apply the theme via epub.js
    rendition.themes.select(newTheme);

    // Also update injected styles in the iframe using epub.js Contents API
    const colors = THEME_COLORS[newTheme];
    const cssRules = `
      html, body {
        background: ${colors.background} !important;
        color: ${colors.text} !important;
      }
      body * {
        color: inherit !important;
        background-color: transparent !important;
      }
      a, a * {
        color: ${colors.link} !important;
      }
      img, svg, image {
        max-width: 100% !important;
        height: auto !important;
        display: block;
        margin: 0 auto;
      }
      pre, code {
        background: rgba(128, 128, 128, 0.2) !important;
      }
    `;

    // Use the Contents API to add stylesheet - this updates the current view
    const contents = rendition.getContents();
    if (contents) {
      contents.addStylesheetCss(cssRules, 'theme-override');
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPreviousPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      } else if (e.key === '+' || e.key === '=') {
        changeFontSize(2);
      } else if (e.key === '-') {
        changeFontSize(-2);
      } else if (e.key === 't') {
        setShowToc((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, goToNextPage, changeFontSize]);

  const progress = calculateReadingProgress(percentage, 100);

  // Retry handler - resets book error and triggers download retry
  const handleRetry = useCallback(() => {
    setBookError(null);
    retryDownload();
  }, [retryDownload]);

  if (error) {
    const is503 = error.message.includes('503');
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 text-lg mb-4">Failed to load EPUB</div>
        <div className="text-gray-400 text-sm mb-4">{error.message}</div>
        {is503 ? <div className="text-gray-500 text-xs mb-4 text-center max-w-md">
            The torrent may still be connecting to peers. This can take a few seconds for less popular files.
          </div> : null}
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show download progress (return early like PDF reader)
  if (isDownloading) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
        <p className="mt-4 text-gray-400 text-sm">
          {downloadProgress !== null
            ? `Downloading EPUB (${downloadProgress}%)`
            : downloadedBytes > 0
              ? `Downloading EPUB (${formatDownloadProgress(downloadedBytes)})`
              : 'Downloading EPUB...'}
        </p>
        {downloadProgress !== null || downloadedBytes > 0 ? (
          <div className="mt-2 w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                downloadProgress !== null ? 'bg-blue-500' : 'bg-blue-500 animate-pulse'
              }`}
              style={{ width: downloadProgress !== null ? `${downloadProgress}%` : '100%' }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full relative ${className}`}>
      {/* Loading overlay - shown while book is initializing */}
      {isLoading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
          <p className="mt-4 text-gray-400 text-sm">Loading book...</p>
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowToc((prev) => !prev)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Toggle table of contents"
          >
            ☰
          </button>

          <button
            onClick={goToPreviousPage}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Previous page"
          >
            ←
          </button>

          <button
            onClick={goToNextPage}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Next page"
          >
            →
          </button>
        </div>

        {/* Font size controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeFontSize(-2)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Decrease font size"
          >
            A-
          </button>

          <span className="text-gray-300 min-w-[50px] text-center">{currentFontSize}px</span>

          <button
            onClick={() => changeFontSize(2)}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            aria-label="Increase font size"
          >
            A+
          </button>
        </div>

        {/* Theme selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeTheme('light')}
            className={`px-3 py-1 rounded ${
              currentTheme === 'light' ? 'bg-white text-black' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            aria-label="Light theme"
          >
            ☀
          </button>

          <button
            onClick={() => changeTheme('dark')}
            className={`px-3 py-1 rounded ${
              currentTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            aria-label="Dark theme"
          >
            🌙
          </button>

          <button
            onClick={() => changeTheme('sepia')}
            className={`px-3 py-1 rounded ${
              currentTheme === 'sepia' ? 'bg-amber-200 text-amber-900' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            aria-label="Sepia theme"
          >
            📜
          </button>
        </div>

        {/* Progress */}
        <div className="text-gray-400 text-sm">{progress.percentage}% complete</div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Table of Contents sidebar */}
        {showToc ? (
          <div className="w-64 bg-gray-900 border-r border-gray-700 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">Contents</h3>
              <nav>
                <ul className="space-y-2">
                  {toc.map((item, index) => (
                    <li key={index}>
                      <button
                        onClick={() => goToLocation(item.href)}
                        className="text-left w-full px-2 py-1 hover:bg-gray-800 rounded text-sm text-gray-300 hover:text-white"
                      >
                        {item.label}
                      </button>
                      {item.subitems && item.subitems.length > 0 ? (
                        <ul className="ml-4 mt-1 space-y-1">
                          {item.subitems.map((subitem, subindex) => (
                            <li key={subindex}>
                              <button
                                onClick={() => goToLocation(subitem.href)}
                                className="text-left w-full px-2 py-1 hover:bg-gray-800 rounded text-xs text-gray-400 hover:text-white"
                              >
                                {subitem.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
        ) : null}

        {/* EPUB content */}
        <div className="flex-1 relative">
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{
              background: THEME_COLORS[currentTheme].background,
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 bg-gray-900 border-t border-gray-700 text-center text-gray-400 text-sm">
        {percentage}% • Press ← → to navigate, T for contents
      </div>
    </div>
  );
}
