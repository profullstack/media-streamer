/**
 * Carry a cast token through an HLS playlist.
 *
 * Our playlist rewriters point every segment, key and variant at one of our
 * own routes (`/api/stream/hls/segment?…`, `/api/iptv-proxy?url=…`,
 * `https://bittorrented.com/api/radio/proxy?u=…`). A receiver that fetched
 * the playlist with `?ct=` would fetch those without it, and be refused, so
 * this appends the token to each one that is ours. Anything pointing off-site
 * is left alone: the token is never handed to a third party.
 */

import { CAST_TOKEN_PARAM, isCastablePath } from './token';

function withToken(uri: string, token: string, origin: string | null): string {
  let pathname: string;
  if (uri.startsWith('/') && !uri.startsWith('//')) {
    pathname = uri.split('?')[0] ?? uri;
  } else if (origin && uri.startsWith(`${origin}/`)) {
    pathname = (uri.slice(origin.length).split('?')[0]) ?? '';
  } else {
    return uri;
  }
  if (!isCastablePath(pathname)) return uri;
  if (new RegExp(`[?&]${CAST_TOKEN_PARAM}=`).test(uri)) return uri;
  return `${uri}${uri.includes('?') ? '&' : '?'}${CAST_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * @param text    a rewritten m3u8
 * @param token   the cast token the playlist itself was fetched with, or null
 * @param origin  our public origin, for rewriters that emit absolute URLs
 */
export function threadCastToken(text: string, token: string | null, origin: string | null = null): string {
  if (!token) return text;
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${withToken(uri, token, origin)}"`);
      }
      return withToken(trimmed, token, origin);
    })
    .join('\n');
}

/** The raw `ct` value on a request URL (unverified; the gate already checked it). */
export function castTokenParam(requestUrl: string): string | null {
  try {
    return new URL(requestUrl).searchParams.get(CAST_TOKEN_PARAM);
  } catch {
    return null;
  }
}
