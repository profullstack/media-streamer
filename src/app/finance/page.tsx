/**
 * Finance hub (Server Component) — /finance (PRD §3.1).
 *
 * Requires authentication; paid gate enforced by finance API routes + client
 * paid-gate, consistent with other `requiresPaid` sections.
 */

import { redirect } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { FinanceHub } from './finance-hub';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Finance | BitTorrented',
  description: 'Charts, key stats, and AI research for stocks and ETFs.',
};

export default async function FinancePage(): Promise<React.ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?redirect=/finance');
  }

  return (
    <MainLayout>
      <FinanceHub />
    </MainLayout>
  );
}
