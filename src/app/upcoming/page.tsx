/**
 * Upcoming Page (Server Component)
 *
 * Shows upcoming movies and TV series from TMDB.
 * Requires authentication (redirects to login).
 * Premium gate is handled client-side via AuthContext.
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { UpcomingContent } from './upcoming-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Upcoming | BitTorrented',
  description: 'Upcoming movies and TV series',
};

export default async function UpcomingPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/upcoming');
  }

  return (
    <MainLayout>
      <UpcomingContent />
    </MainLayout>
  );
}
