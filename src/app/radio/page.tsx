/**
 * Radio Page (Server Component)
 *
 * Server-side auth check - redirects to login if not authenticated.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { RadioContent } from './radio-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Live Radio | BitTorrented',
  description: 'Stream radio stations with search and favorites support',
};

export default async function RadioPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/radio');
  }

  return <RadioContent />;
}
