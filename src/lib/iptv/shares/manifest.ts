/**
 * HLS manifest rewriting for resale streams.
 *
 * A manifest is a list of upstream URLs. Proxying one verbatim would hand the buyer
 * exactly the provider credentials the opaque session id exists to hide, so every
 * URL in it is replaced with a pointer back at our own stream route carrying the
 * original **encrypted** — not encoded. The distinction is the whole point: the
 * platform's general proxy uses encodeURIComponent, which the buyer can simply
 * reverse.
 *
 * Extracted from the route so it can be tested directly; a regression here leaks
 * credentials silently and would never show up as a failed request.
 */

/** Content types that mean "this body is a playlist, not media". */
const HLS_CONTENT_TYPES = [
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
];

export function isHlsPlaylist(contentType: string | null): boolean {
  if (!contentType) return false;
  return HLS_CONTENT_TYPES.includes(contentType.toLowerCase().split(';')[0].trim());
}

export function resolveUrl(ref: string, base: URL): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

/**
 * @param content       the upstream manifest
 * @param upstreamBase  the URL it was fetched from, for resolving relative refs
 * @param selfBase      our stream URL, already carrying `?session=...`
 * @param seal          encrypts an absolute upstream URL
 */
export function rewriteManifest(
  content: string,
  upstreamBase: string,
  selfBase: string,
  seal: (absoluteUrl: string) => string
): string {
  let base: URL;
  try {
    base = new URL(upstreamBase);
  } catch {
    return content;
  }

  const proxied = (ref: string): string => {
    const absolute = resolveUrl(ref, base);
    // Leave non-http refs (data:, relative fragments that failed to resolve) alone
    // rather than sealing something that is not a URL.
    if (!/^https?:/i.test(absolute)) return absolute;
    return `${selfBase}&seg=${encodeURIComponent(seal(absolute))}`;
  };

  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // URI="..." appears on EXT-X-KEY, EXT-X-MEDIA and EXT-X-MAP. Missing the
        // key URI would publish the decryption-key endpoint on the owner's line.
        return trimmed.includes('URI="')
          ? trimmed.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${proxied(uri)}"`)
          : line;
      }
      return proxied(trimmed);
    })
    .join('\n');
}
