import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { YouTubeContent } from './youtube-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'YouTube | BitTorrented',
  description: 'Search and watch YouTube through your connected accounts',
};

export default async function YouTubePage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirect=/youtube');
  }
  return <YouTubeContent />;
}
