import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MainLayout } from '@/components/layout';
import { getDhtTorrentDetail } from '@/lib/dht/queries';
import { formatBytes } from '@/lib/utils';

/**
 * Clean torrent name for display and SEO.
 */
function cleanName(raw: string): string {
  let t = raw;
  t = t.replace(/\.\w{2,4}$/, '');
  t = t.replace(/[._]/g, ' ');
  t = t.replace(/\b(x264|x265|h264|h265|hevc|avc|aac|ac3|dts|flac|mp3|bluray|bdrip|brrip|webrip|web-dl|webdl|hdrip|dvdrip|dvdscr|cam|ts|hdtv|pdtv|uhd|uhdr|hdr|hdr10|dv|dolby|vision|10bit|8bit|remux|repack|proper|extended|unrated|directors|cut|dubbed|subbed|multi|dual|audio|subs|eng|cz|en|de|fr|es|it|pt|nl|pl|ru|ja|ko|zh)\b/gi, ' ');
  t = t.replace(/\b(480p|720p|1080p|1080i|2160p|4k)\b/gi, ' ');
  t = t.replace(/[+]/g, ' ');
  t = t.replace(/[-–]\s*\w+\s*$/, '');
  t = t.replace(/\[.*?\]/g, ' ');
  t = t.replace(/\([^)]*\)/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function getMediaIcon(ext: string | null): string {
  if (!ext) return '📄';
  const video = ['mkv', 'mp4', 'avi', 'wmv', 'mov', 'flv', 'webm'];
  const audio = ['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'];
  const book = ['pdf', 'epub', 'mobi', 'azw3', 'cbr', 'cbz'];
  if (video.includes(ext)) return '🎬';
  if (audio.includes(ext)) return '🎵';
  if (book.includes(ext)) return '📚';
  return '📄';
}

interface PageProps {
  params: Promise<{ infohash: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { infohash } = await params;
  const torrent = await getDhtTorrentDetail(infohash);
  if (!torrent) return { title: 'Torrent Not Found | BitTorrented' };

  const title = cleanName(torrent.name);
  const desc = `Download ${title} torrent — ${formatBytes(torrent.size)}, ${torrent.files_count ?? 0} files. ${torrent.seeders ?? 0} seeders.`;

  return {
    title,
    description: desc,
    openGraph: { title: `${title} | BitTorrented`, description: desc },
    twitter: { card: 'summary', title: `${title} | BitTorrented`, description: desc },
  };
}

export default async function DhtTorrentPage({ params }: PageProps) {
  const { infohash } = await params;

  if (!/^[0-9a-f]{40}$/i.test(infohash)) notFound();

  const torrent = await getDhtTorrentDetail(infohash);
  if (!torrent) notFound();

  const displayName = cleanName(torrent.name);
  const magnetUri = `magnet:?xt=urn:btih:${infohash}&dn=${encodeURIComponent(torrent.name)}`;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-text-muted">
          <Link href="/" className="hover:text-text-primary">Home</Link>
          <span>/</span>
          <Link href="/find-torrents" className="hover:text-text-primary">Torrents</Link>
          <span>/</span>
          <span className="text-text-primary truncate" title={torrent.name}>{displayName}</span>
        </nav>

        {/* Header card */}
        <div className="card p-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded bg-bg-tertiary text-3xl">
              {getMediaIcon(torrent.extension)}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-text-primary">{displayName}</h1>
              <p className="mt-1 font-mono text-xs text-text-muted">{infohash}</p>

              {torrent.content_type && (
                <span className="mt-2 inline-block rounded-full bg-bg-tertiary px-2 py-0.5 text-xs capitalize text-text-secondary">
                  {torrent.content_type}
                </span>
              )}
            </div>
          </div>

          {/* Stats grid */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-text-muted">Size</p>
              <p className="text-lg font-medium text-text-primary">{formatBytes(torrent.size)}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Files</p>
              <p className="text-lg font-medium text-text-primary">{torrent.files_count ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Seeders</p>
              <p className="text-lg font-medium text-green-500">{torrent.seeders ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">Leechers</p>
              <p className="text-lg font-medium text-orange-500">{torrent.leechers ?? '—'}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={magnetUri}
              className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
            >
              🧲 Open Magnet Link
            </a>
            <Link
              href={`/torrents/${infohash}`}
              className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm"
            >
              ⚡ Index &amp; Stream This Torrent
            </Link>
          </div>
        </div>

        {/* File list */}
        {torrent.files.length > 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Files ({torrent.files.length}{torrent.files_count && torrent.files_count > torrent.files.length ? ` of ${torrent.files_count}` : ''})
            </h2>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {torrent.files.map((f) => {
                const fileName = f.path.split('/').pop() || f.path;
                return (
                  <div
                    key={f.index}
                    className="flex items-center gap-3 rounded px-3 py-1.5 text-sm hover:bg-bg-hover"
                  >
                    <span className="shrink-0">{getMediaIcon(f.extension)}</span>
                    <span className="min-w-0 flex-1 truncate text-text-primary" title={f.path}>
                      {fileName}
                    </span>
                    <span className="shrink-0 text-text-muted">{formatBytes(f.size)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SEO content */}
        <div className="card p-6 text-sm text-text-secondary">
          <h2 className="text-base font-semibold text-text-primary mb-2">About This Torrent</h2>
          <p>
            <strong>{displayName}</strong> is a {torrent.content_type || 'torrent'} available via the BitTorrent DHT network.
            Total size: {formatBytes(torrent.size)} across {torrent.files_count ?? 'unknown'} files.
            {torrent.seeders != null && torrent.seeders > 0 && ` Currently ${torrent.seeders} seeders are sharing this torrent.`}
          </p>
          <p className="mt-2">
            Want to stream this directly in your browser?{' '}
            <Link href={`/torrents/${infohash}`} className="text-accent-primary hover:underline">
              Index this torrent
            </Link>{' '}
            to unlock streaming, metadata enrichment, and more.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
