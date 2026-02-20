/**
 * Profile Selection Page
 *
 * Shows profile selector after login, before accessing main app
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ProfileSelectorPage } from '@/components/profiles';

export default async function SelectProfilePage(): Promise<React.ReactElement> {
  // Check if user is authenticated
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return <ProfileSelectorPage />;
}

export const metadata = {
  title: 'Select Profile - Media Streamer',
  description: 'Choose your profile to continue',
};