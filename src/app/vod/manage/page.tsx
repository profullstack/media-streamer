/**
 * VOD Provider management (Server Component). Connect a VOD source (Xtream / M3U
 * / HTTP media library / JSON manifest), price it, sync the catalog, and share a
 * public link where viewers pay $1/week or $1/title. Requires login.
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { VodManageClient } from './manage-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'VOD Providers | BitTorrented',
  description: 'Connect your VOD library and monetize public access with crypto micro-payments.',
};

export default async function VodManagePage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirect=/vod/manage');
  }
  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text-primary">VOD Providers</h1>
          <p className="text-sm text-text-secondary">
            Connect your media library and charge viewers $1/week or $1 per title — no torrenting.
          </p>
        </div>
        <VodManageClient />
      </div>
    </MainLayout>
  );
}
