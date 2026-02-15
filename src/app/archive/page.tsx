/**
 * Archive Hub — lists last 60 months as links to monthly torrent archives.
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { MainLayout } from '@/components/layout';

export const metadata: Metadata = {
  title: 'Torrent Archive',
  description: 'Browse torrents by month.',
};

function getLast60Months(): { year: number; month: number; label: string }[] {
  const now = new Date();
  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    });
  }
  return months;
}

export default function ArchivePage() {
  const months = getLast60Months();

  return (
    <MainLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Torrent Archive</h1>
          <p className="text-sm text-text-secondary">Browse torrents by month</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {months.map((m) => (
            <Link
              key={`${m.year}-${m.month}`}
              href={`/torrents/archive/${m.year}/${String(m.month).padStart(2, '0')}`}
              className="rounded border border-border-subtle px-4 py-3 text-sm text-text-primary hover:border-accent-primary/30 hover:bg-bg-hover transition-colors"
            >
              {m.label}
            </Link>
          ))}
        </div>

        <div className="pt-4">
          <Link href="/torrents" className="text-sm text-accent-primary hover:underline">
            ← Back to latest torrents
          </Link>
        </div>
      </div>
    </MainLayout>
  );
}
