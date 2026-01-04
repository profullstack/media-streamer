'use client';

/**
 * Main Layout Component
 *
 * Combines sidebar, header, and main content area.
 * Provides consistent layout across all pages.
 * Manages auth state and passes it to child components.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  const { isLoggedIn, isLoading, isPremium, user, refresh } = useAuth();

  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        refresh();
        router.push('/');
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [refresh, router]);

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
          onLogout={handleLogout}
        />

        {/* Page content */}
        <main className={cn('flex-1 p-4 md:p-6', className)}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
