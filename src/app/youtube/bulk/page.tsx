import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { BulkContent } from './bulk-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Bulk YouTube Subscriptions | BitTorrented',
  description: 'Subscribe or unsubscribe from a list of YouTube channels in bulk',
};

export default async function YouTubeBulkPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirect=/youtube/bulk');
  }
  return <BulkContent />;
}
