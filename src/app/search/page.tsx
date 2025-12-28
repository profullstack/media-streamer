'use client';

/**
 * Search Page
 * 
 * Unified search across all torrents and files.
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { SearchBar, SearchResults, SearchResultsHeader, type SearchFilters } from '@/components/search';
import type { SearchResult, SearchResponse } from '@/types';

export default function SearchPage(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async (searchQuery: string, filters: SearchFilters) => {
    setQuery(searchQuery);
    
    if (!searchQuery.trim()) {
      setResults([]);
      setTotal(0);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: '50',
      });

      if (filters.mediaTypes.length > 0) {
        params.set('mediaTypes', filters.mediaTypes.join(','));
      }

      if (filters.torrentId) {
        params.set('torrentId', filters.torrentId);
      }

      const response = await fetch(`/api/search?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error ?? 'Search failed');
      }

      const data = await response.json() as SearchResponse;
      setResults(data.results);
      setTotal(data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFilePlay = useCallback((result: SearchResult) => {
    if (result.file) {
      // Navigate to stream URL or open player
      const streamUrl = `/api/stream?infohash=${result.torrent.infohash}&fileIndex=${result.file.fileIndex}`;
      window.open(streamUrl, '_blank');
    }
  }, []);

  const handleFileDownload = useCallback((result: SearchResult) => {
    if (result.file) {
      // For now, open stream URL which will trigger download for non-streamable files
      const streamUrl = `/api/stream?infohash=${result.torrent.infohash}&fileIndex=${result.file.fileIndex}`;
      const link = document.createElement('a');
      link.href = streamUrl;
      link.download = result.file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, []);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Search</h1>
          <p className="mt-1 text-text-secondary">
            Search across all your torrents and files
          </p>
        </div>

        {/* Search Bar */}
        <SearchBar
          onSearch={handleSearch}
          placeholder="Search for music, videos, books..."
          showFilters={true}
        />

        {/* Results */}
        {hasSearched && query ? <div className="space-y-4">
            <SearchResultsHeader total={total} query={query} />
            <SearchResults
              results={results}
              isLoading={isLoading}
              error={error}
              onFilePlay={handleFilePlay}
              onFileDownload={handleFileDownload}
              emptyMessage={`No results found for "${query}"`}
            />
          </div> : null}

        {/* Initial state */}
        {!hasSearched && (
          <div className="py-12 text-center">
            <p className="text-text-muted">
              Enter a search term to find files across all your torrents
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
