/**
 * Seedboxes Page (Server Component)
 *
 * Connect and manage your own seedbox on your account. Requires login — once a
 * seedbox is connected, "Send to seedbox" and "Play from seedbox" unlock for
 * every profile under the account. Credentials are encrypted at rest server-side.
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { SeedboxSection } from '@/app/settings/seedbox-section';

// Always check auth status server-side.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Seedboxes | BitTorrented',
  description: 'Connect your own seedbox to push torrents to it and stream completed files back.',
};

export default async function SeedboxesPage(): Promise<React.ReactElement> {
  // Require login to use seedboxes.
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirect=/seedboxes');
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text-primary">Seedboxes</h1>
          <p className="text-sm text-text-secondary">
            Connect your own seedbox to push torrents to it and stream completed files back.
          </p>
        </div>
        <SeedboxSection />
      </div>
    </MainLayout>
  );
}
