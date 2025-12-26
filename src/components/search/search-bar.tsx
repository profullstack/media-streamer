'use client';

/**
 * Search Bar Component
 * 
 * A search input with debounced search and filter options.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { SearchIcon, CloseIcon, FilterIcon } from '@/components/ui/icons';
import type { MediaCategory } from '@/types';

interface SearchBarProps {
  onSearch: (query: string, filters: SearchFilters) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
  showFilters?: boolean;
  initialQuery?: string;
}

export interface SearchFilters {
  mediaTypes: MediaCategory[];
  torrentId?: string;
}

const MEDIA_TYPE_OPTIONS: { value: MediaCategory; label: string }[] = [
  { value: 'audio', label: 'Music' },
  { value: 'video', label: 'Videos' },
  { value: 'ebook', label: 'Books' },
  { value: 'document', label: 'Documents' },
];

export function SearchBar({
  onSearch,
  placeholder = 'Search files...',
  className,
  debounceMs = 300,
  showFilters = true,
  initialQuery = '',
}: SearchBarProps): React.ReactElement {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>({ mediaTypes: [] });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const debouncedSearch = useCallback(
    (searchQuery: string, searchFilters: SearchFilters) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onSearch(searchQuery, searchFilters);
      }, debounceMs);
    },
    [onSearch, debounceMs]
  );

  // Handle query change
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedSearch(newQuery, filters);
  };

  // Handle clear
  const handleClear = (): void => {
    setQuery('');
    onSearch('', filters);
  };

  // Handle filter toggle
  const handleFilterToggle = (mediaType: MediaCategory): void => {
    const newFilters = {
      ...filters,
      mediaTypes: filters.mediaTypes.includes(mediaType)
        ? filters.mediaTypes.filter((t) => t !== mediaType)
        : [...filters.mediaTypes, mediaType],
    };
    setFilters(newFilters);
    debouncedSearch(query, newFilters);
  };

  // Handle submit
  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onSearch(query, filters);
  };

  // Close filter menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const activeFilterCount = filters.mediaTypes.length;

  return (
    <form onSubmit={handleSubmit} className={cn('relative', className)}>
      <div className="relative flex items-center">
        {/* Search icon */}
        <SearchIcon
          className="absolute left-3 text-text-muted"
          size={18}
        />

        {/* Input */}
        <input
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-lg border border-border-subtle bg-bg-secondary py-2.5 pl-10 pr-20',
            'text-text-primary placeholder:text-text-muted',
            'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
            'transition-colors'
          )}
        />

        {/* Clear button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-12 p-1 text-text-muted hover:text-text-primary"
            aria-label="Clear search"
          >
            <CloseIcon size={16} />
          </button>
        )}

        {/* Filter button */}
        {showFilters && (
          <div className="absolute right-3" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={cn(
                'relative rounded p-1.5 transition-colors',
                showFilterMenu || activeFilterCount > 0
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-text-muted hover:text-text-primary'
              )}
              aria-label="Filter options"
            >
              <FilterIcon size={16} />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-primary text-[10px] font-medium text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter dropdown */}
            {showFilterMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-border-subtle bg-bg-secondary p-2 shadow-lg">
                <p className="mb-2 px-2 text-xs font-medium uppercase text-text-muted">
                  Media Type
                </p>
                {MEDIA_TYPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-hover"
                  >
                    <input
                      type="checkbox"
                      checked={filters.mediaTypes.includes(option.value)}
                      onChange={() => handleFilterToggle(option.value)}
                      className="h-4 w-4 rounded border-border-default bg-bg-tertiary text-accent-primary focus:ring-accent-primary"
                    />
                    <span className="text-sm text-text-primary">{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
