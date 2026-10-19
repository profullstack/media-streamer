'use client';

import { MainLayout } from '@/components/layout';

/**
 * No ad here: the blog pages place their own in-content units (top of the
 * index, top of each post), never one at the bottom against the footer.
 */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <MainLayout>
      {children}
    </MainLayout>
  );
}
