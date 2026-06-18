/**
 * Finance — small market-session badge (pre-market / open / after-hours /
 * closed). Shared by the watchlist cards and the ticker page so the label and
 * colors stay consistent.
 */

import type { MarketSession } from '@/lib/finance/market-data/types';

const LABELS: Record<MarketSession, string> = {
  PRE: 'Pre-market',
  REGULAR: 'Market open',
  POST: 'After hours',
  CLOSED: 'Closed',
};

const STYLES: Record<MarketSession, string> = {
  PRE: 'bg-amber-500/15 text-amber-300',
  REGULAR: 'bg-green-500/15 text-green-300',
  POST: 'bg-indigo-500/15 text-indigo-300',
  CLOSED: 'bg-bg-tertiary text-text-muted',
};

export function marketSessionLabel(state: MarketSession | undefined): string | null {
  return state ? LABELS[state] : null;
}

export function MarketSessionBadge({
  state,
  className = '',
}: {
  state: MarketSession | undefined;
  className?: string;
}): React.ReactElement | null {
  if (!state) return null;
  const live = state !== 'CLOSED';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLES[state]} ${className}`}
    >
      {live ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {LABELS[state]}
    </span>
  );
}
