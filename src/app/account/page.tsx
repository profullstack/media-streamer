/**
 * Account Page (Server Component)
 *
 * Server-side auth check - redirects to login if not authenticated.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AccountContent } from './account-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Account | BitTorrented',
  description: 'Manage your account settings and subscription',
};

export default async function AccountPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/account');
  }

  return <AccountContent />;
}
