import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { RssContent } from './rss-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'RSS Reader | BitTorrented',
  description: 'Manage RSS feeds and read articles',
};

export default async function RssPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/rss');
  }

  return <RssContent />;
}
