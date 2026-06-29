// DHT trackers to include in magnet URIs
const DHT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.tracker.cl:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
];

// Base32 alphabet (RFC 4648) used by BitTorrent base32 infohashes (BEP 9).
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Build a magnet URI from infohash and name
export function buildMagnetUri(infohash: string, name: string): string {
  const encodedName = encodeURIComponent(name);
  const trackerParams = DHT_TRACKERS.map(
    (tracker) => `&tr=${encodeURIComponent(tracker)}`
  ).join('');

  return `magnet:?xt=urn:btih:${infohash.toLowerCase()}&dn=${encodedName}${trackerParams}`;
}

// Decode a 32-character base32 infohash to a 40-character lowercase hex string.
function base32InfohashToHex(base32: string): string {
  const normalized = base32.toUpperCase().replace(/=+$/, '');

  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character in infohash: ${char}`);
    }
    bits += index.toString(2).padStart(5, '0');
  }

  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return hex;
}

/**
 * Extract the v1 infohash from a magnet URI as a 40-character lowercase hex string.
 *
 * Accepts both encodings allowed by BEP 9 for `xt=urn:btih:`:
 *   - 40-character hex (SHA-1, v1)
 *   - 32-character base32 (decoded to hex)
 *
 * Returns null when no valid btih infohash is present. The previous
 * implementation matched only `[a-fA-F0-9]{40}` with no boundary, which
 * (a) silently dropped valid base32 magnets and (b) truncated a 64-char
 * BTIH v2 (SHA-256) topic to a wrong 40-char prefix instead of rejecting it.
 */
export function extractInfohash(magnet: string): string | null {
  if (typeof magnet !== 'string' || magnet.length === 0) {
    return null;
  }

  // Capture the raw topic up to the next param/separator, then validate exactly.
  const match = magnet.match(/xt=urn:btih:([^&/?#\s]+)/i);
  if (!match) {
    return null;
  }

  const raw = match[1];

  if (/^[a-f0-9]{40}$/i.test(raw)) {
    return raw.toLowerCase();
  }

  if (/^[a-z2-7]{32}$/i.test(raw)) {
    try {
      return base32InfohashToHex(raw);
    } catch {
      return null;
    }
  }

  // Anything else (e.g. 64-char v2 SHA-256, malformed lengths) is not a
  // valid v1 btih infohash for this code path.
  return null;
}
