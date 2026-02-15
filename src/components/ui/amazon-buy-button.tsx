'use client';

/**
 * Amazon "Buy" Button
 *
 * Fetches the top Amazon result for a given title + content type
 * and renders a buy link with the affiliate tag.
 * Only renders if a result is found.
 */

import { useState, useEffect } from 'react';

/**
 * Clean a torrent filename into a search-friendly title.
 * Strips codecs, quality tags, release groups, file extensions, etc.
 */
function cleanTorrentTitle(raw: string): string {
  let t = raw;
  // Remove file extension
  t = t.replace(/\.\w{2,4}$/, '');
  // Replace dots/underscores with spaces
  t = t.replace(/[._]/g, ' ');
  // Remove common codec/quality/release tags
  t = t.replace(/\b(x264|x265|h264|h265|hevc|avc|aac|ac3|dts|flac|mp3|bluray|bdrip|brrip|webrip|web-dl|webdl|hdrip|dvdrip|dvdscr|cam|ts|hdtv|pdtv|uhd|uhdr|hdr|hdr10|dv|dolby|vision|10bit|8bit|remux|repack|proper|extended|unrated|directors|cut|dubbed|subbed|multi|dual|audio|subs|eng|cz|en|de|fr|es|it|pt|nl|pl|ru|ja|ko|zh)\b/gi, ' ');
  // Remove resolution tags
  t = t.replace(/\b(480p|720p|1080p|1080i|2160p|4k)\b/gi, ' ');
  // Remove plus signs (e.g. UHDR+DV)
  t = t.replace(/[+]/g, ' ');
  // Remove release group (anything after last dash or in brackets)
  t = t.replace(/[-–]\s*\w+\s*$/, '');
  t = t.replace(/\[.*?\]/g, ' ');
  // Remove all parenthetical content (including year — Amazon handles it better without)
  t = t.replace(/\([^)]*\)/g, ' ');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

interface AmazonResult {
  title: string;
  url: string | null;
  image: string | null;
  price: string | null;
  rating: number | null;
  asin: string | null;
}

interface AmazonBuyButtonProps {
  title: string;
  contentType: string | null;
  year: number | null;
  /** Only show when metadata images exist (poster/cover) */
  hasMetadata: boolean;
}

export function AmazonBuyButton({ title, contentType, year, hasMetadata }: AmazonBuyButtonProps) {
  const [result, setResult] = useState<AmazonResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasMetadata || !title) return;

    let cancelled = false;
    setLoading(true);

    const searchTitle = cleanTorrentTitle(title);
    if (!searchTitle) return;

    const yearParam = year ? `&year=${year}` : '';
    fetch(`/api/amazon/search?title=${encodeURIComponent(searchTitle)}&contentType=${encodeURIComponent(contentType || '')}${yearParam}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && data?.result?.url) {
          setResult(data.result);
        }
      })
      .catch(() => {}) // Silent fail — non-critical feature
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [title, contentType, hasMetadata]);

  if (!hasMetadata || loading || !result?.url) return null;

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#FF9900] px-4 py-2 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-[#FFB84D]"
      title={`Buy "${result.title}" on Amazon`}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.958 10.09c0 1.232.029 2.256-.591 3.351-.502.891-1.301 1.438-2.186 1.438-1.214 0-1.922-.924-1.922-2.292 0-2.692 2.415-3.182 4.7-3.182v.685zm3.186 7.705a.66.66 0 01-.753.077c-1.06-.878-1.25-1.284-1.828-2.119-1.748 1.782-2.986 2.315-5.249 2.315-2.68 0-4.764-1.653-4.764-4.96 0-2.583 1.4-4.339 3.392-5.2 1.725-.762 4.135-.897 5.976-1.107v-.413c0-.762.058-1.663-.39-2.322-.388-.59-1.134-.834-1.79-.834-1.216 0-2.3.624-2.565 1.918a.54.54 0 01-.467.468l-2.603-.28a.46.46 0 01-.388-.543C6.239 1.96 9.167.5 11.8.5c1.34 0 3.093.357 4.148 1.37 1.34 1.25 1.212 2.918 1.212 4.735v4.288c0 1.29.535 1.855 1.038 2.553.177.247.215.544-.009.728-.559.467-1.554 1.334-2.1 1.82l-.946-.2z" />
        <path d="M21.558 19.558c-2.33 1.715-5.71 2.632-8.621 2.632-4.078 0-7.752-1.507-10.527-4.014-.218-.197-.023-.466.239-.313 2.997 1.742 6.706 2.79 10.533 2.79 2.582 0 5.42-.535 8.034-1.643.394-.168.725.26.342.548z" />
        <path d="M22.408 18.544c-.297-.382-1.966-.18-2.716-.091-.228.028-.263-.171-.058-.314 1.33-.935 3.511-.665 3.766-.352.256.315-.067 2.497-1.315 3.539-.192.16-.375.075-.29-.137.281-.703.913-2.263.613-2.645z" />
      </svg>
      Buy on Amazon
      {result.price ? <span className="text-xs opacity-80">{result.price}</span> : null}
    </a>
  );
}
