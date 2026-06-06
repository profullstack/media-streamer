'use client';

import { MainLayout } from '@/components/layout';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <MainLayout>{children}</MainLayout>;
}
