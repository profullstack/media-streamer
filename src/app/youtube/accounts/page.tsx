import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AccountsContent } from './accounts-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'YouTube Accounts | BitTorrented',
  description: 'Manage connected YouTube accounts',
};

export default async function YouTubeAccountsPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirect=/youtube/accounts');
  }
  return <AccountsContent />;
}
