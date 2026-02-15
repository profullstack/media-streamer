import type { Metadata } from 'next';

/**
 * Clean a torrent filename into a display-friendly title.
 */
function cleanTitle(raw: string): string {
  let t = raw;
  t = t.replace(/\.\w{2,4}$/, '');
  t = t.replace(/[._]/g, ' ');
  t = t.replace(/\b(x264|x265|h264|h265|hevc|avc|aac|ac3|dts|flac|mp3|bluray|bdrip|brrip|webrip|web-dl|webdl|hdrip|dvdrip|dvdscr|cam|ts|hdtv|pdtv|uhd|uhdr|hdr|hdr10|dv|dolby|vision|10bit|8bit|remux|repack|proper|extended|unrated|directors|cut|dubbed|subbed|multi|dual|audio|subs|eng|cz|en|de|fr|es|it|pt|nl|pl|ru|ja|ko|zh|afm72)\b/gi, ' ');
  t = t.replace(/\b(480p|720p|1080p|1080i|2160p|4k)\b/gi, ' ');
  t = t.replace(/[+]/g, ' ');
  t = t.replace(/[-–]\s*\w+\s*$/, '');
  t = t.replace(/\[.*?\]/g, ' ');
  t = t.replace(/\([^)]*\)/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Server-side metadata for torrent detail pages.
 * Fetches torrent info to generate proper <title> and <meta description> for SEO.
 */
export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const res = await fetch(`${baseUrl}/api/torrents/${id}`, {
      next: { revalidate: 3600 }, // Cache 1h
    });

    if (!res.ok) {
      return { title: 'Torrent Not Found | BitTorrented' };
    }

    const data = await res.json();
    const t = data.torrent;
    const title = t.cleanTitle ?? cleanTitle(t.name);
    const yearSuffix = t.year ? ` (${t.year})` : '';
    const typeSuffix = t.contentType ? ` - ${t.contentType.charAt(0).toUpperCase() + t.contentType.slice(1)}` : '';

    const description = t.description
      ? t.description.slice(0, 160)
      : `Stream or download ${title} on BitTorrented. ${t.fileCount} file${t.fileCount !== 1 ? 's' : ''}.`;

    const pageTitle = `${title}${yearSuffix}${typeSuffix}`;

    return {
      title: pageTitle,
      description,
      openGraph: {
        title: pageTitle,
        description,
        ...(t.posterUrl || t.coverUrl ? { images: [{ url: t.posterUrl || t.coverUrl }] } : {}),
      },
      twitter: {
        card: 'summary_large_image',
        title: pageTitle,
        description,
        ...(t.posterUrl || t.coverUrl ? { images: [t.posterUrl || t.coverUrl] } : {}),
      },
    };
  } catch {
    return { title: 'BitTorrented' };
  }
}

export default function TorrentLayout({ children }: LayoutProps) {
  return children;
}
