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
import { useSiteFooter } from '@/components/layout/site-footer-context';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps): React.ReactElement {
  const router = useRouter();
  const siteFooter = useSiteFooter();
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
        router.refresh(); // bust Next.js server-component cache
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
          isAdmin={user?.is_admin === true}
          userEmail={user?.email}
          displayName={activeProfile?.name}
          onLogout={handleLogout}
        />

        {/* Page content — never block on auth; children render immediately */}
        <main className={cn('flex-1 p-4 md:p-6', className)}>
          {children}
        </main>

        {/* Footer */}
        <div className="text-text-secondary">
          {siteFooter}

          {/* Launchpadly badge */}
          <div className="pb-4 text-center">
            <a
              href="https://launchpadly.co/startup/bittorrented?ref=badge"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block opacity-70 transition-opacity hover:opacity-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://launchpadly.co/embed/badges/startup/bittorrented.svg?variant=dark"
                alt="Launchpadly Startup Directory"
                width={260}
                height={48}
                loading="lazy"
                className="h-8 w-auto"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
