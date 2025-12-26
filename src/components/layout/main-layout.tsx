'use client';

/**
 * Main Layout Component
 * 
 * Combines sidebar, header, and main content area.
 * Provides consistent layout across all pages.
 */

import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Header } from './header';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps): React.ReactElement {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-1 flex-col md:ml-64">
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className={cn('flex-1 p-4 md:p-6', className)}>
          {children}
        </main>
      </div>
    </div>
  );
}
