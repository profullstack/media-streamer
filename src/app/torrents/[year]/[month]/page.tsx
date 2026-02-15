/**
 * Month Archive — cursor-paginated torrents for a specific year/month.
 * URL: /torrents/2026/02?before_ts=UNIX&before_id=HEX
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { fetchTorrentsMonthPage, type TorrentRow } from '@/lib/torrent-index/cursors';
import { formatBytes } from '@/lib/utils';

const PAGE_SIZE = 50;

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function TorrentListItem({ t }: { t: TorrentRow }) {
  return (
    <Link
      href={`/torrents/${t.info_hash}`}
      className="flex items-center gap-3 rounded border border-transparent px-3 py-2 hover:border-accent-primary/30 hover:bg-bg-hover transition-colors"
    >
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm text-text-primary block" title={t.name}>
          {t.name}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-text-muted shrink-0">
        <span className="w-16 text-right">{formatBytes(t.size)}</span>
        {t.files_count != null && (
          <span className="w-12 text-right hidden md:block">{t.files_count} files</span>
        )}
        <span className="w-20 text-right hidden lg:block">{formatDate(t.created_at)}</span>
      </div>
    </Link>
  );
}

interface PageProps {
  params: Promise<{ year: string; month: string }>;
  searchParams: Promise<{ before_ts?: string; before_id?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { year, month } = await params;
  const d = new Date(Number(year), Number(month) - 1, 1);
  const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  return {
    title: `Torrents — ${label}`,
    description: `Browse torrents added in ${label}.`,
  };
}

export default async function MonthArchivePage({ params, searchParams }: PageProps) {
  const { year: yearStr, month: monthStr } = await params;
  const sp = await searchParams;

  const year = Number(yearStr);
  const month = Number(monthStr);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12 || year < 2000 || year > 2100) {
    notFound();
  }

  const beforeTs = sp.before_ts ? Number(sp.before_ts) : undefined;
  const beforeId = sp.before_id ?? undefined;

  const { torrents, nextCursor } = await fetchTorrentsMonthPage(
    PAGE_SIZE,
    year,
    month,
    beforeTs,
    beforeId,
  );

  const d = new Date(Date.UTC(year, month - 1, 1));
  const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  const basePath = `/torrents/${yearStr}/${monthStr}`;

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{label}</h1>
            <p className="text-sm text-text-secondary">Monthly torrent archive</p>
          </div>
          <Link href="/archive" className="text-sm text-accent-primary hover:underline">
            Archive
          </Link>
        </div>

        {torrents.length > 0 ? (
          <div className="space-y-1">
            {torrents.map((t) => (
              <TorrentListItem key={t.info_hash} t={t} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-text-muted">No torrents for this month.</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4">
          {beforeTs != null ? (
            <Link href={basePath} className="text-sm text-accent-primary hover:underline">
              ← Newest in {label}
            </Link>
          ) : (
            <span />
          )}

          {nextCursor ? (
            <Link
              href={`${basePath}?before_ts=${nextCursor.before_ts}&before_id=${nextCursor.before_id}`}
              className="text-sm text-accent-primary hover:underline"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
    </MainLayout>
  );
}
