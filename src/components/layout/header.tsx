'use client';

/**
 * Header Component
 * 
 * Top header with search bar and user actions.
 * Responsive design for mobile and desktop.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SearchIcon, LoadingSpinner, UserIcon, LogInIcon } from '@/components/ui/icons';

interface HeaderProps {
  className?: string;
  isLoggedIn?: boolean;
}

export function Header({ className, isLoggedIn = false }: HeaderProps): React.ReactElement {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      if (!searchQuery.trim()) return;

      setIsSearching(true);
      try {
        router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, router]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
  }, []);

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

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex flex-1 items-center justify-center">
        <div className="relative w-full max-w-xl">
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
            placeholder="Search torrents, music, videos, books..."
            className={cn(
              'w-full rounded-full border border-border-default bg-bg-secondary py-2 pl-10 pr-4',
              'text-sm text-text-primary placeholder:text-text-muted',
              'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary',
              'transition-colors'
            )}
          />
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
