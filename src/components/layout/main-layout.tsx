'use client';

/**
 * Main Layout Component
 *
 * Combines sidebar, header, and main content area.
 * Provides consistent layout across all pages.
 * Manages auth state and passes it to child components.
 */

import { useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuth } from '@/hooks/use-auth';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, isPremium, user, clearAuth, needsProfileSelection, isLoading, activeProfile } = useAuth();

  // Redirect to profile selector when user has multiple profiles and none selected
  useEffect(() => {
    if (!isLoading && needsProfileSelection && pathname !== '/select-profile') {
      router.push('/select-profile');
    }
  }, [isLoading, needsProfileSelection, pathname, router]);

  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        clearAuth();
        router.push('/');
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [clearAuth, router]);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar isLoggedIn={isLoggedIn} isPremium={isPremium} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col md:ml-64">
        {/* Header */}
        <Header
          isLoggedIn={isLoggedIn}
          userEmail={user?.email}
          displayName={activeProfile?.name}
          onLogout={handleLogout}
        />

        {/* Page content — never block on auth; children render immediately */}
        <main className={cn('flex-1 p-4 md:p-6', className)}>
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-border-primary px-4 py-4 text-center text-sm text-text-secondary md:px-6">
          <a
            href="mailto:support@bittorrented.com?subject=BitTorrented"
            className="text-accent-primary hover:text-accent-primary/80 transition-colors"
          >
            Contact Us
          </a>
          <span className="mx-2">·</span>
          <a href="/terms" className="hover:text-text-primary transition-colors">Terms</a>
          <span className="mx-2">·</span>
          <a href="/privacy" className="hover:text-text-primary transition-colors">Privacy</a>
        </footer>
      </div>
    </div>
  );
}
