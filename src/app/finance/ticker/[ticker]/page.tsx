/**
 * Ticker page (Server Component) — /finance/ticker/:ticker (PRD §3.2).
 *
 * Requires authentication (redirect to login). The paid gate is enforced by the
 * finance API routes server-side; unpaid users get blocked there and by the
 * client paid-gate, consistent with other `requiresPaid` sections.
 */

import { redirect, notFound } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { getCurrentUser } from '@/lib/auth';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import { TickerView } from './ticker-view';

export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = normalizeSymbol(decodeURIComponent(ticker));
  return {
    title: `${symbol} | Finance | BitTorrented`,
    description: `Price chart and key stats for ${symbol}.`,
  };
}

export default async function TickerPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<React.ReactElement> {
  const { ticker } = await params;
  const symbol = normalizeSymbol(decodeURIComponent(ticker));

  if (!SYMBOL_RE.test(symbol)) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=/finance/ticker/${symbol}`);
  }

  return (
    <MainLayout>
      <TickerView symbol={symbol} />
    </MainLayout>
  );
}
