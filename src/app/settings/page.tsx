/**
 * Settings Page (Server Component)
 *
 * Server-side auth check - redirects to login if not authenticated.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { SettingsContent } from './settings-content';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings | BitTorrented',
  description: 'Manage your preferences and settings',
};

export default async function SettingsPage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/settings');
  }

  return <SettingsContent />;
}
