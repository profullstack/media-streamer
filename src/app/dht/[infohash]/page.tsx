import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MainLayout } from '@/components/layout';
import { getDhtTorrentDetail } from '@/lib/dht/queries';
import { formatBytes } from '@/lib/utils';
import { DhtActions } from '@/components/dht/dht-actions';
import { DhtIndexCta } from '@/components/dht/dht-index-cta';

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
  const desc = torrent.overview
    ? torrent.overview.slice(0, 160)
    : `Download ${title} torrent — ${formatBytes(torrent.size)}, ${torrent.files_count ?? 0} files. ${torrent.seeders ?? 0} seeders.`;

  return {
    title,
    description: desc,
    openGraph: {
      title: `${title} | BitTorrented`,
      description: desc,
      ...(torrent.backdrop_url ? { images: [{ url: torrent.backdrop_url }] } : {}),
    },
    twitter: {
      card: torrent.backdrop_url ? 'summary_large_image' : 'summary',
      title: `${title} | BitTorrented`,
      description: desc,
      ...(torrent.backdrop_url ? { images: [torrent.backdrop_url] } : {}),
    },
  };
}

export default async function DhtTorrentPage({ params }: PageProps) {
  const { infohash } = await params;

  if (!/^[0-9a-f]{40}$/i.test(infohash)) notFound();

  const torrent = await getDhtTorrentDetail(infohash);
  if (!torrent) notFound();

  const displayName = cleanName(torrent.name);
  const magnetUri = `magnet:?xt=urn:btih:${infohash}&dn=${encodeURIComponent(torrent.name)}`;
  const hasImdb = !!(torrent.imdb_id && torrent.imdb_rating);
  const hasTmdb = !!(torrent.poster_url || torrent.overview);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-text-muted">
          <Link href="/" className="hover:text-text-primary">Home</Link>
          <span>/</span>
          <Link href="/search" className="hover:text-text-primary">DHT</Link>
          <span>/</span>
          <span className="text-text-primary truncate" title={torrent.name}>{displayName}</span>
        </nav>

        {/* Hero with backdrop */}
        {torrent.backdrop_url && (
          <div className="relative -mx-4 -mt-2 h-48 sm:h-64 overflow-hidden rounded-lg sm:mx-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={torrent.backdrop_url}
              alt=""
              className="h-full w-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/60 to-transparent" />
          </div>
        )}

        {/* Header card */}
        <div className={`card p-6 ${torrent.backdrop_url ? '-mt-24 relative z-10' : ''}`}>
          <div className="flex items-start gap-5">
            {/* Poster or Icon */}
            {torrent.poster_url ? (
              <div className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={torrent.poster_url}
                  alt={displayName}
                  className="h-48 w-32 rounded-lg object-cover shadow-lg sm:h-56 sm:w-38"
                  loading="eager"
                />
              </div>
            ) : (
              <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded bg-bg-tertiary text-3xl">
                {getMediaIcon(torrent.extension)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{displayName}</h1>

              {/* Tagline */}
              {torrent.tagline && (
                <p className="mt-1 text-sm italic text-text-muted">&ldquo;{torrent.tagline}&rdquo;</p>
              )}

              {/* Meta badges row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {torrent.year && (
                  <span className="rounded bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {torrent.year}
                  </span>
                )}
                {torrent.content_rating && (
                  <span className="rounded border border-text-muted/30 px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {torrent.content_rating}
                  </span>
                )}
                {torrent.runtime_minutes && (
                  <span className="text-xs text-text-muted">
                    {Math.floor(torrent.runtime_minutes / 60)}h {torrent.runtime_minutes % 60}m
                  </span>
                )}
                {torrent.content_type && (
                  <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs capitalize text-text-secondary">
                    {torrent.content_type}
                  </span>
                )}
              </div>

              {/* IMDB rating */}
              {hasImdb && (
                <div className="mt-3 flex items-center gap-3">
                  <a
                    href={`https://www.imdb.com/title/${torrent.imdb_id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-500/20 px-3 py-1.5 text-sm font-semibold text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                    title={`${(torrent.imdb_votes ?? 0).toLocaleString()} votes on IMDB`}
                  >
                    ⭐ {torrent.imdb_rating}/10
                  </a>
                  <span className="text-xs text-text-muted">
                    {(torrent.imdb_votes ?? 0).toLocaleString()} votes
                  </span>
                </div>
              )}

              {/* Genres */}
              {torrent.genres && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {torrent.genres.split(', ').map((genre) => (
                    <span
                      key={genre}
                      className="rounded-full bg-accent-primary/10 px-2.5 py-0.5 text-xs text-accent-primary"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Infohash */}
              <p className="mt-3 font-mono text-[10px] text-text-muted/60 hidden sm:block">{infohash}</p>
            </div>
          </div>

          {/* Synopsis */}
          {torrent.overview && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Synopsis</h2>
              <p className="text-sm leading-relaxed text-text-primary">{torrent.overview}</p>
            </div>
          )}

          {/* Credits row */}
          {(torrent.director || torrent.cast || torrent.writers) && (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {torrent.director && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Director</h3>
                  <p className="mt-1 text-sm text-text-primary">{torrent.director}</p>
                </div>
              )}
              {torrent.writers && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Writers</h3>
                  <p className="mt-1 text-sm text-text-primary">{torrent.writers}</p>
                </div>
              )}
              {torrent.cast && (
                <div className="sm:col-span-2">
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Cast</h3>
                  <p className="mt-1 text-sm text-text-primary">{torrent.cast}</p>
                </div>
              )}
            </div>
          )}

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
          <div className="mt-6">
            <DhtActions magnetUri={magnetUri} infohash={infohash} />
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
            {hasTmdb && torrent.overview && ` ${torrent.overview}`}
          </p>
          <DhtIndexCta infohash={infohash} magnetUri={magnetUri} />
        </div>
      </div>
    </MainLayout>
  );
}
