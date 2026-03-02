import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import TorrentDetailClient from './torrent-detail-client';
import { formatBytes } from '@/lib/utils';
import { transformTorrent, transformTorrentFiles } from '@/lib/transforms/transforms';
import { enrichWithImdb } from '@/lib/imdb/enrich';
import { fetchTmdbData } from '@/lib/imdb/tmdb';
import {
  getTorrentById,
  getTorrentByInfohash,
  getTorrentFiles,
  getDhtTorrentByInfohash,
  getDhtTorrentFiles,
} from '@/lib/supabase/queries';

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function isInfohash(id: string): boolean {
  return /^[0-9a-f]{40}$/i.test(id);
}

function cleanDisplayName(raw: string): string {
  let t = raw;
  t = t.replace(/\.\w{2,4}$/, '');
  t = t.replace(/\[.*?\]/g, ' ');
  t = t.replace(/^(www\.)?[a-z0-9_-]+\.(org|com|net|io|tv|cc|to|bargains|club|xyz|me)\s*[-\u2013\u2014]\s*/i, '');
  t = t.replace(/[._]/g, ' ');
  t = t.replace(/\b(x264|x265|h264|h265|hevc|avc|aac[0-9. ]*|ac3|dts|flac|mp3|bluray|blu-ray|bdrip|brrip|webrip|web-?dl|webdl|hdrip|dvdrip|dvdscr|cam|hdtv|pdtv|uhd|uhdr|hdr|hdr10|dv|dolby|vision|10bit|8bit|remux|repack|proper|extended|unrated|directors|cut|dubbed|subbed|multi|dual|audio|subs)\b/gi, ' ');
  t = t.replace(/\b(480p|720p|1080p|1080i|2160p|4k)\b/gi, ' ');
  t = t.replace(/\b(eng|cz|de|fr|es|it|pt|nl|pl|ru|ja|ko|zh|ukr|ita|ger|spa|por|ara|tur|hun)\b/gi, ' ');
  t = t.replace(/\b\d+(\.\d+)?\s*(mb|gb|tb)\b/gi, ' ');
  t = t.replace(/\s*[-\u2013]\s*[A-Za-z0-9]{2,15}\s*$/, '');
  t = t.replace(/\bH\s*\d{3}\b/gi, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

async function getTorrentData(id: string) {
  // Try as UUID first
  if (isUUID(id)) {
    const torrent = await getTorrentById(id);
    if (torrent) {
      const files = await getTorrentFiles(torrent.id);
      const transformed = transformTorrent(torrent);
      const enriched = await enrichWithImdb(transformed);
      
      const imdbId = enriched.externalId?.startsWith('tt') ? enriched.externalId : null;
      const tmdb = await fetchTmdbData(imdbId || '', enriched.cleanTitle || enriched.name);

      return {
        torrent: {
          ...enriched,
          source: 'user' as const,
          posterUrl: enriched.posterUrl || tmdb?.posterUrl || null,
          backdropUrl: tmdb?.backdropUrl || null,
          overview: enriched.description || tmdb?.overview || null,
          tagline: tmdb?.tagline || null,
          actors: enriched.actors || tmdb?.cast || null,
          cast: enriched.actors || tmdb?.cast || null,
          writers: tmdb?.writers || null,
          contentRating: tmdb?.contentRating || null,
        },
        files: transformTorrentFiles(files),
      };
    }
  }

  // Try as infohash
  if (isInfohash(id)) {
    // Check bt_torrents first
    const torrent = await getTorrentByInfohash(id);
    if (torrent) {
      const files = await getTorrentFiles(torrent.id);
      const transformed = transformTorrent(torrent);
      const enriched = await enrichWithImdb(transformed);
      
      const imdbId = enriched.externalId?.startsWith('tt') ? enriched.externalId : null;
      const tmdb = await fetchTmdbData(imdbId || '', enriched.cleanTitle || enriched.name);

      return {
        torrent: {
          ...enriched,
          source: 'user' as const,
          posterUrl: enriched.posterUrl || tmdb?.posterUrl || null,
          backdropUrl: tmdb?.backdropUrl || null,
          overview: enriched.description || tmdb?.overview || null,
          tagline: tmdb?.tagline || null,
          actors: enriched.actors || tmdb?.cast || null,
          cast: enriched.actors || tmdb?.cast || null,
          writers: tmdb?.writers || null,
          contentRating: tmdb?.contentRating || null,
        },
        files: transformTorrentFiles(files),
      };
    }

    // Check DHT
    const dht = await getDhtTorrentByInfohash(id);
    if (dht) {
      const dhtFiles = await getDhtTorrentFiles(id);
      const tmdb = await fetchTmdbData('', dht.name);
      
      return {
        torrent: {
          id: dht.infohash,
          infohash: dht.infohash,
          magnetUri: `magnet:?xt=urn:btih:${dht.infohash}&dn=${encodeURIComponent(dht.name)}`,
          name: dht.name,
          cleanTitle: null,
          totalSize: dht.size,
          fileCount: dht.files_count ?? 0,
          pieceLength: 0,
          seeders: dht.seeders,
          leechers: dht.leechers,
          swarmUpdatedAt: null,
          posterUrl: tmdb?.posterUrl || dht.poster_url || null,
          coverUrl: dht.cover_url || null,
          contentType: dht.content_type,
          year: null,
          description: tmdb?.overview || null,
          director: null,
          actors: tmdb?.cast || null,
          genre: null,
          videoCodec: null,
          audioCodec: null,
          container: null,
          needsTranscoding: null,
          codecDetectedAt: null,
          createdAt: dht.created_at,
          updatedAt: dht.created_at,
          externalId: null,
          externalSource: null,
          imdbRating: null,
          imdbVotes: null,
          runtimeMinutes: null,
          source: 'dht' as const,
          backdropUrl: tmdb?.backdropUrl || null,
          overview: tmdb?.overview || null,
          tagline: tmdb?.tagline || null,
          cast: tmdb?.cast || null,
          writers: tmdb?.writers || null,
          contentRating: tmdb?.contentRating || null,
        },
        files: dhtFiles.map((f: any) => ({
          id: `${id}-${f.index}`,
          torrentId: id,
          fileIndex: f.index,
          path: f.path,
          name: f.path.split('/').pop() || f.path,
          extension: f.extension ?? f.path.split('.').pop() ?? '',
          size: f.size,
          pieceStart: 0,
          pieceEnd: 0,
          mediaCategory: 'other',
          mimeType: '',
          createdAt: new Date().toISOString(),
        })),
      };
    }
  }

  return null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getTorrentData(id);

  if (!data) return { title: 'Torrent Not Found | BitTorrented' };

  const t = data.torrent;
  const title = (t as any).cleanTitle || cleanDisplayName(t.name);
  const desc = (t as any).overview || (t as any).description
    ? ((t as any).overview || (t as any).description).slice(0, 160)
    : `Download ${title} torrent — ${formatBytes(t.totalSize)}, ${t.fileCount} files.`;

  return {
    title: `${title} | BitTorrented`,
    description: desc,
    openGraph: {
      title: `${title} | BitTorrented`,
      description: desc,
      ...((t as any).backdropUrl ? { images: [{ url: (t as any).backdropUrl }] } : {}),
    },
    twitter: {
      card: (t as any).backdropUrl ? 'summary_large_image' : 'summary',
      title: `${title} | BitTorrented`,
      description: desc,
      ...((t as any).backdropUrl ? { images: [(t as any).backdropUrl] } : {}),
    },
  };
}

export default async function TorrentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getTorrentData(id);

  if (!data) notFound();

  return (
    <TorrentDetailClient
      initialTorrent={data.torrent as any}
      initialFiles={data.files as any}
      torrentId={id}
    />
  );
}
