/**
 * Spotify Page (Server Component)
 *
 * Server-side auth check - redirects to login if not authenticated.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { SpotifyContent } from './spotify-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Spotify | BitTorrented',
  description: 'Cast your Spotify to BitTorrented and listen in the browser',
};

export default async function SpotifyPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/spotify');
  }

  return <SpotifyContent />;
}
