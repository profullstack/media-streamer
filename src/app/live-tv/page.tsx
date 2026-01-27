/**
 * Live TV Page (Server Component)
 *
 * Server-side auth check - redirects to login if not authenticated.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { LiveTvContent } from './live-tv-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Live TV | BitTorrented',
  description: 'Stream live channels from your IPTV playlists',
};

export default async function LiveTvPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/live-tv');
  }

  return <LiveTvContent />;
}
