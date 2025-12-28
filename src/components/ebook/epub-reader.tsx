'use client';

/**
 * EPUB Reader Component
 * 
 * Uses epub.js to render EPUB documents with navigation, themes, and search
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import ePub, { Book, Rendition, NavItem } from 'epubjs';
import { calculateReadingProgress } from '@/lib/ebook';

/**
 * EPUB Reader Props
 */
export interface EpubReaderProps {
  /** URL or ArrayBuffer of the EPUB file */
  file: string | ArrayBuffer;
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
 * Theme configurations
 */
const THEMES = {
  light: {
    body: {
      background: '#ffffff',
      color: '#1a1a1a',
    },
  },
  dark: {
    body: {
      background: '#1a1a1a',
      color: '#e0e0e0',
    },
  },
  sepia: {
    body: {
      background: '#f4ecd8',
      color: '#5b4636',
    },
  },
};

/**
 * EPUB Reader Component
 */
export function EpubReader({
  file,
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

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [showToc, setShowToc] = useState<boolean>(false);
  const [, setCurrentLocation] = useState<string>('');
  const [percentage, setPercentage] = useState<number>(0);
  const [currentFontSize, setCurrentFontSize] = useState<number>(fontSize);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'sepia'>(theme);

  // Initialize book
  useEffect(() => {
    if (!containerRef.current) return;

    const initBook = async (): Promise<void> => {
      try {
        // Create book instance
        const book = ePub(file);
        bookRef.current = book;

        // Wait for book to be ready
        await book.ready;

        // Get table of contents
        const navigation = await book.loaded.navigation;
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

        // Apply initial theme and font size
        rendition.themes.select(currentTheme);
        rendition.themes.fontSize(`${currentFontSize}px`);

        // Display initial location or start
        if (initialLocation) {
          await rendition.display(initialLocation);
        } else {
          await rendition.display();
        }

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
        const error = err instanceof Error ? err : new Error('Failed to load EPUB');
        setError(error);
        setIsLoading(false);
        onError?.(error);
      }
    };

    initBook();

    // Cleanup
    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
        renditionRef.current = null;
      }
    };
  }, [file, initialLocation, onBookLoad, onError, onLocationChange, currentTheme, currentFontSize]);

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
    renditionRef.current?.themes.select(newTheme);
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

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 text-lg mb-4">Failed to load EPUB</div>
        <div className="text-gray-400 text-sm">{error.message}</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
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
          
          <span className="text-gray-300 min-w-[50px] text-center">
            {currentFontSize}px
          </span>
          
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
        <div className="text-gray-400 text-sm">
          {progress.percentage}% complete
        </div>
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
        {showToc ? <div className="w-64 bg-gray-900 border-r border-gray-700 overflow-y-auto">
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
                      {item.subitems && item.subitems.length > 0 ? <ul className="ml-4 mt-1 space-y-1">
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
                        </ul> : null}
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div> : null}

        {/* EPUB content */}
        <div className="flex-1 relative">
          {isLoading ? <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
            </div> : null}
          
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{
              background: THEMES[currentTheme].body.background,
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
