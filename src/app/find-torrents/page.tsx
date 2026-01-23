'use client';

/**
 * Find Torrents Page
 *
 * Allows users to search for torrents across multiple providers
 * and add them to the catalog via magnet links.
 */

import React, { useState, useCallback, useEffect, FormEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import {
  SearchIcon,
  LoadingSpinner,
  MagnetIcon,
  CheckIcon,
  GlobeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@/components/ui/icons';
import { AddMagnetModal } from '@/components/torrents/add-magnet-modal';

// Types for torrent search results
interface TorrentResult {
  name: string;
  magnet: string;
  size: string;
  seeders: number;
  leechers: number;
  date?: string;
  url?: string;
  category?: string;
  uploader?: string;
}

interface ProviderResults {
  provider: string;
  results: TorrentResult[];
}

interface SearchResponse {
  query: string;
  results: ProviderResults[];
  totalResults: number;
  timestamp: string;
}

// Valid sort options
const SORT_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'seeders', label: 'Seeders' },
  { value: 'leechers', label: 'Leechers' },
  { value: 'size', label: 'Size' },
] as const;

// Valid providers (alphabetically sorted by label, with "All Providers" first)
const PROVIDERS = [
  { value: '', label: 'All Providers' },
  { value: '1337x', label: '1337x' },
  { value: 'libgen', label: 'LibGen' },
  { value: 'limetorrents', label: 'LimeTorrents' },
  { value: 'nyaa', label: 'Nyaa' },
  { value: 'rarbg', label: 'RARBG' },
  { value: 'thepiratebay', label: 'The Pirate Bay' },
] as const;

// Track which magnets have been added
type AddedMagnets = Record<string, boolean>;

// Inline table sorting types
type SortColumn = 'name' | 'size' | 'seeders' | 'leechers' | 'date';
type SortDirection = 'asc' | 'desc';
interface TableSort {
  column: SortColumn;
  direction: SortDirection;
}
type ProviderSortState = Record<string, TableSort>;

// Helper function to parse size strings to bytes for comparison
function parseSizeToBytes(sizeStr: string): number {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)?$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  const multipliers: Record<string, number> = {
    'B': 1,
    'KB': 1024,
    'KIB': 1024,
    'MB': 1024 * 1024,
    'MIB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'GIB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
    'TIB': 1024 * 1024 * 1024 * 1024,
  };

  return value * (multipliers[unit] || 1);
}

// Helper function to parse date strings for comparison
function parseDateValue(dateStr: string | undefined): number {
  if (!dateStr || dateStr === '-') return 0;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

// Sort results by column
function sortResults(results: TorrentResult[], sort: TableSort): TorrentResult[] {
  const sorted = [...results].sort((a, b) => {
    let comparison = 0;

    switch (sort.column) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'size':
        comparison = parseSizeToBytes(a.size) - parseSizeToBytes(b.size);
        break;
      case 'seeders':
        comparison = a.seeders - b.seeders;
        break;
      case 'leechers':
        comparison = a.leechers - b.leechers;
        break;
      case 'date':
        comparison = parseDateValue(a.date) - parseDateValue(b.date);
        break;
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

function FindTorrentsPageInner(): React.ReactElement {
  const searchParams = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(queryParam);
  const [sort, setSort] = useState<string>('date');
  const [provider, setProvider] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [addedMagnets, setAddedMagnets] = useState<AddedMagnets>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [initialSearchDone, setInitialSearchDone] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMagnet, setSelectedMagnet] = useState<string | undefined>(undefined);
  const [selectedTorrentName, setSelectedTorrentName] = useState<string>('');

  // Inline table sorting state (per provider)
  const [tableSorts, setTableSorts] = useState<ProviderSortState>({});

  // Auto-search when query param is present
  useEffect(() => {
    if (queryParam && queryParam.trim().length >= 3 && !initialSearchDone) {
      setInitialSearchDone(true);
      // Trigger search after component mounts
      const doInitialSearch = async () => {
        setIsSearching(true);
        setSearchResults(null);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 130000);

        try {
          const params = new URLSearchParams({
            q: queryParam.trim(),
            sort,
          });

          if (provider) {
            params.set('provider', provider);
          }

          const response = await fetch(`/api/torrent-search?${params.toString()}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const data = await response.json();

          if (!response.ok) {
            setError(data.error || 'Search failed');
            return;
          }

          setSearchResults(data as SearchResponse);
        } catch (err) {
          clearTimeout(timeoutId);
          if (err instanceof Error && err.name === 'AbortError') {
            setError('Search timed out. Please try again with a more specific query.');
          } else {
            setError('Search failed. Please try again.');
          }
        } finally {
          setIsSearching(false);
        }
      };

      doInitialSearch();
    }
  }, [queryParam, initialSearchDone, sort, provider]);

  const handleSearch = useCallback(async (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Clear previous state
    setError(null);
    setValidationError(null);
    setSuccessMessage(null);

    // Validate query
    if (query.trim().length < 3) {
      setValidationError('Query must be at least 3 characters');
      return;
    }

    setIsSearching(true);
    setSearchResults(null);

    // Create AbortController with 130 second timeout
    // This is slightly longer than the server-side 120s timeout
    // to allow the server to return a proper timeout error
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 130000);

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        sort,
      });

      if (provider) {
        params.set('provider', provider);
      }

      const response = await fetch(`/api/torrent-search?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Search failed');
        return;
      }

      setSearchResults(data as SearchResponse);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Search timed out. Please try again with a more specific query.');
      } else {
        setError('Search failed. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  }, [query, sort, provider]);

  const handleOpenAddModal = useCallback((magnet: string, name: string) => {
    setSelectedMagnet(magnet);
    setSelectedTorrentName(name);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedMagnet(undefined);
    setSelectedTorrentName('');
  }, []);

  const handleModalSuccess = useCallback(() => {
    // Mark the magnet as added
    if (selectedMagnet) {
      setAddedMagnets((prev) => ({ ...prev, [selectedMagnet]: true }));
      setSuccessMessage(`"${selectedTorrentName}" added successfully!`);

      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    }
    handleModalClose();
  }, [selectedMagnet, selectedTorrentName, handleModalClose]);

  const formatSeeders = (seeders: number): string => {
    if (seeders >= 1000) {
      return `${(seeders / 1000).toFixed(1)}k`;
    }
    return seeders.toString();
  };

  // Handle column header click for inline sorting
  const handleColumnSort = useCallback((provider: string, column: SortColumn) => {
    setTableSorts((prev) => {
      const currentSort = prev[provider];
      // If clicking same column, toggle direction; otherwise set new column with desc
      if (currentSort?.column === column) {
        return {
          ...prev,
          [provider]: {
            column,
            direction: currentSort.direction === 'desc' ? 'asc' : 'desc',
          },
        };
      }
      return {
        ...prev,
        [provider]: { column, direction: 'desc' },
      };
    });
  }, []);

  // Get sorted results for a provider
  const getSortedResults = useCallback(
    (provider: string, results: TorrentResult[]): TorrentResult[] => {
      const sort = tableSorts[provider];
      if (!sort) return results;
      return sortResults(results, sort);
    },
    [tableSorts]
  );

  // Sortable header component
  const SortableHeader = ({
    provider,
    column,
    label,
    align = 'left',
  }: {
    provider: string;
    column: SortColumn;
    label: string;
    align?: 'left' | 'center' | 'right';
  }) => {
    const currentSort = tableSorts[provider];
    const isActive = currentSort?.column === column;
    const direction = isActive ? currentSort.direction : null;

    const alignClasses = {
      left: 'text-left justify-start',
      center: 'text-center justify-center',
      right: 'text-right justify-end',
    };

    return (
      <th className={`px-4 py-3 text-sm font-medium text-text-secondary ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'}`}>
        <button
          onClick={() => handleColumnSort(provider, column)}
          className={`inline-flex items-center gap-1 hover:text-text-primary transition-colors ${alignClasses[align]} ${isActive ? 'text-accent-primary' : ''}`}
        >
          <span>{label}</span>
          {isActive ? (
            direction === 'desc' ? (
              <ChevronDownIcon size={14} className="text-accent-primary" />
            ) : (
              <ChevronUpIcon size={14} className="text-accent-primary" />
            )
          ) : (
            <span className="w-[14px]" />
          )}
        </button>
      </th>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Find Torrents to Add</h1>
          <p className="mt-2 text-text-secondary">
            Search across multiple torrent providers and add content to the catalog
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row">
            {/* Search Input */}
            <div className="flex-1">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <SearchIcon className="text-text-muted" size={20} />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for torrents..."
                  className="w-full rounded-lg border border-bg-tertiary bg-bg-secondary py-3 pl-11 pr-4 text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                />
              </div>
            </div>

            {/* Sort Select */}
            <div className="w-full md:w-40">
              <label htmlFor="sort" className="sr-only">Sort by</label>
              <select
                id="sort"
                aria-label="Sort by"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full rounded-lg border border-bg-tertiary bg-bg-secondary px-4 py-3 text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Provider Select */}
            <div className="w-full md:w-48">
              <label htmlFor="provider" className="sr-only">Provider</label>
              <select
                id="provider"
                aria-label="Provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-lg border border-bg-tertiary bg-bg-secondary px-4 py-3 text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Button */}
            <button
              type="submit"
              disabled={isSearching}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-6 py-3 font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <LoadingSpinner size={20} />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <SearchIcon size={20} />
                  <span>Search</span>
                </>
              )}
            </button>
          </div>

          {/* Validation Error */}
          {validationError ? (
            <p className="mt-2 text-sm text-red-500">{validationError}</p>
          ) : null}
        </form>

        {/* Success Message */}
        {successMessage ? (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-green-500/10 p-4 text-green-500">
            <CheckIcon size={20} />
            <span>{successMessage}</span>
          </div>
        ) : null}

        {/* Error Message */}
        {error ? (
          <div className="mb-6 rounded-lg bg-red-500/10 p-4 text-red-500">
            {error}
          </div>
        ) : null}

        {/* Results */}
        {searchResults ? (
          <div>
            {/* Results Summary */}
            <div className="mb-6 flex items-center justify-between">
              <p className="text-text-secondary">
                Found <span className="font-semibold text-text-primary">{searchResults.totalResults}</span> results for &quot;{searchResults.query}&quot;
              </p>
            </div>

            {/* No Results */}
            {searchResults.totalResults === 0 ? (
              <div className="rounded-lg border border-bg-tertiary bg-bg-secondary p-8 text-center">
                <p className="text-text-muted">No results found. Try a different search term.</p>
              </div>
            ) : null}

            {/* Results by Provider */}
            {searchResults.results.map((providerResult) => (
              <div key={providerResult.provider} className="mb-8">
                {/* Provider Header */}
                <div className="mb-4 flex items-center gap-2">
                  <GlobeIcon size={20} className="text-accent-primary" />
                  <h2 className="text-lg font-semibold text-text-primary capitalize">
                    {providerResult.provider}
                  </h2>
                  <span className="text-sm text-text-muted">
                    ({providerResult.results.length} results)
                  </span>
                </div>

                {/* Results Table */}
                {providerResult.results.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-bg-tertiary">
                    <table className="w-full">
                      <thead className="bg-bg-tertiary">
                        <tr>
                          <SortableHeader provider={providerResult.provider} column="name" label="Name" align="left" />
                          <SortableHeader provider={providerResult.provider} column="size" label="Size" align="left" />
                          <SortableHeader provider={providerResult.provider} column="seeders" label="Seeders" align="center" />
                          <SortableHeader provider={providerResult.provider} column="leechers" label="Leechers" align="center" />
                          <SortableHeader provider={providerResult.provider} column="date" label="Date" align="left" />
                          <th className="px-4 py-3 text-right text-sm font-medium text-text-secondary">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bg-tertiary bg-bg-secondary">
                        {getSortedResults(providerResult.provider, providerResult.results).map((result, index) => (
                          <tr key={`${result.magnet}-${index}`} className="hover:bg-bg-hover">
                            <td className="px-4 py-3">
                              <div className="max-w-md">
                                <p className="truncate text-sm font-medium text-text-primary" title={result.name}>
                                  {result.name}
                                </p>
                                {result.category ? (
                                  <span className="text-xs text-text-muted">{result.category}</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-text-secondary">
                              {result.size}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              <span className="text-sm font-medium text-green-500">
                                {formatSeeders(result.seeders)}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              <span className="text-sm text-red-400">
                                {result.leechers}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-text-muted">
                              {result.date ?? '-'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              {addedMagnets[result.magnet] ? (
                                <span className="inline-flex items-center gap-1 text-sm text-green-500">
                                  <CheckIcon size={16} />
                                  Added
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleOpenAddModal(result.magnet, result.name)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
                                >
                                  <MagnetIcon size={14} />
                                  <span>Add Magnet</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* Initial State */}
        {!searchResults && !isSearching && !error ? (
          <div className="rounded-lg border border-bg-tertiary bg-bg-secondary p-12 text-center">
            <SearchIcon size={48} className="mx-auto mb-4 text-text-muted" />
            <h2 className="mb-2 text-lg font-medium text-text-primary">Search for Torrents</h2>
            <p className="text-text-muted">
              Enter a search term above to find torrents across multiple providers
            </p>
          </div>
        ) : null}

        {/* Add Magnet Modal */}
        <AddMagnetModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          initialMagnetUrl={selectedMagnet}
        />
      </div>
    </MainLayout>
  );
}

export default function FindTorrentsPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size={32} />
          </div>
        </MainLayout>
      }
    >
      <FindTorrentsPageInner />
    </Suspense>
  );
}
