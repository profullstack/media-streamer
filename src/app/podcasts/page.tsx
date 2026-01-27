/**
 * Podcasts Page (Server Component)
 *
 * Server-side auth check - redirects to login if not authenticated.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { PodcastsContent } from './podcasts-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Podcasts | BitTorrented',
  description: 'Discover and subscribe to podcasts',
};

export default async function PodcastsPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/podcasts');
  }

  return <PodcastsContent />;
}
