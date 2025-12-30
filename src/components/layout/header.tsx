'use client';

/**
 * Header Component
 * 
 * Top header with search bar, category filter, and user actions.
 * Responsive design for mobile and desktop.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SearchIcon, LoadingSpinner, UserIcon, LogInIcon, ChevronDownIcon } from '@/components/ui/icons';

/**
 * Search categories for filtering
 */
const SEARCH_CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'audio', label: 'Music' },
  { value: 'video', label: 'Movies & TV' },
  { value: 'ebook', label: 'Books' },
  { value: 'xxx', label: 'XXX' },
  { value: 'other', label: 'Other' },
] as const;

type SearchCategory = typeof SEARCH_CATEGORIES[number]['value'];

interface HeaderProps {
  className?: string;
  isLoggedIn?: boolean;
}

export function Header({ className, isLoggedIn = false }: HeaderProps): React.ReactElement {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('');
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSearch = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      if (!searchQuery.trim()) return;

      setIsSearching(true);
      try {
        const params = new URLSearchParams();
        params.set('q', searchQuery.trim());
        if (category) {
          params.set('type', category);
        }
        router.push(`/search?${params.toString()}`);
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, category, router]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
  }, []);

  const handleCategoryChange = useCallback((newCategory: SearchCategory): void => {
    setCategory(newCategory);
    setIsDropdownOpen(false);
  }, []);

  const selectedCategoryLabel = SEARCH_CATEGORIES.find(c => c.value === category)?.label ?? 'All';

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center border-b border-border-subtle bg-bg-primary/80 backdrop-blur-sm',
        'px-4 md:px-6',
        className
      )}
    >
      {/* Spacer for mobile menu button */}
      <div className="w-12 md:hidden" />

      {/* Search Bar with Category Filter */}
      <form onSubmit={handleSearch} className="flex flex-1 items-center justify-center">
        <div className="relative flex w-full max-w-xl">
          {/* Category Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                'flex items-center gap-1 rounded-l-full border border-r-0 border-border-default bg-bg-secondary px-3 py-2',
                'text-sm text-text-secondary',
                'hover:bg-bg-hover hover:text-text-primary',
                'focus:outline-none focus:ring-1 focus:ring-accent-primary',
                'transition-colors'
              )}
            >
              <span className="hidden sm:inline">{selectedCategoryLabel}</span>
              <span className="sm:hidden">{selectedCategoryLabel.slice(0, 3)}</span>
              <ChevronDownIcon size={14} className={cn('transition-transform', isDropdownOpen && 'rotate-180')} />
            </button>
            
            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                {/* Backdrop to close dropdown */}
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg">
                  {SEARCH_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => handleCategoryChange(cat.value)}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm',
                        'hover:bg-bg-hover',
                        'transition-colors',
                        category === cat.value ? 'text-accent-primary font-medium' : 'text-text-secondary'
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Search Input */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              {isSearching ? (
                <LoadingSpinner className="text-text-muted" size={18} />
              ) : (
                <SearchIcon className="text-text-muted" size={18} />
              )}
            </div>
            <input
              type="search"
              value={searchQuery}
              onChange={handleInputChange}
              placeholder="Search torrents..."
              className={cn(
                'w-full border border-r-0 border-border-default bg-bg-secondary py-2 pl-10 pr-4',
                'text-sm text-text-primary placeholder:text-text-muted',
                'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
                'transition-colors'
              )}
            />
          </div>

          {/* Submit Button - for TV/remote navigation */}
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className={cn(
              'flex items-center justify-center rounded-r-full border border-border-default bg-accent-primary px-4 py-2',
              'text-sm font-medium text-white',
              'hover:bg-accent-primary/90',
              'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-colors'
            )}
            aria-label="Search"
          >
            {isSearching ? (
              <LoadingSpinner className="text-white" size={18} />
            ) : (
              <SearchIcon className="text-white" size={18} />
            )}
          </button>
        </div>
      </form>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {isLoggedIn ? (
          <Link
            href="/account"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2',
              'text-sm font-medium text-text-secondary',
              'hover:bg-bg-hover hover:text-text-primary',
              'transition-colors'
            )}
          >
            <UserIcon size={20} />
            <span className="hidden sm:inline">Account</span>
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2',
                'text-sm font-medium text-text-secondary',
                'hover:bg-bg-hover hover:text-text-primary',
                'transition-colors'
              )}
            >
              <LogInIcon size={20} />
              <span className="hidden sm:inline">Log In</span>
            </Link>
            <Link
              href="/signup"
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2',
                'text-sm font-medium text-white',
                'bg-accent-primary hover:bg-accent-primary/90',
                'transition-colors'
              )}
            >
              <span>Sign Up</span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
