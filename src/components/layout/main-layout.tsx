'use client';

/**
 * Main Layout Component
 * 
 * Combines sidebar, header, and main content area.
 * Provides consistent layout across all pages.
 * Manages auth state and passes it to child components.
 */

import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useAuth } from '@/hooks/use-auth';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps): React.ReactElement {
  const { isLoggedIn, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar isLoggedIn={isLoggedIn} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col md:ml-64">
        {/* Header */}
        <Header isLoggedIn={isLoggedIn} />

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
