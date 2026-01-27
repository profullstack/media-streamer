/**
 * News Page (Server Component)
 *
 * Server-side auth check - redirects to login if not authenticated.
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { NewsContent } from './news-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'News | BitTorrented',
  description: 'Stay up to date with the latest entertainment news',
};

export default async function NewsPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/news');
  }

  return (
    <MainLayout>
      <NewsContent />
    </MainLayout>
  );
}
