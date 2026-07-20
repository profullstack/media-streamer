/**
 * Magnet parsing for seedbox rentals.
 *
 * We need the torrent's infohash (to match torlink `/status`, which keys
 * torrents by lowercase-hex infohash) and its display name (for the download's
 * initial label / streaming-scope fallback). BitTorrent v1 magnets carry the
 * infohash as `xt=urn:btih:<hash>` where `<hash>` is either 40-char hex or
 * 32-char base32 — we normalize both to lowercase hex.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode an RFC 4648 base32 string to bytes (no padding required). */
function base32ToBytes(input: string): Uint8Array | null {
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ParsedMagnet {
  /** Lowercase-hex v1 infohash (40 chars). */
  infohash: string;
  /** Display name from the `dn` param, if present. */
  name: string | null;
}

/**
 * Parse a magnet URI into its infohash (lowercase hex) and display name.
 * Returns null when the input isn't a v1 magnet we can key on.
 */
export function parseMagnet(magnet: string): ParsedMagnet | null {
  if (typeof magnet !== 'string') return null;
  const trimmed = magnet.trim();
  if (!/^magnet:\?/i.test(trimmed)) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(trimmed.slice(trimmed.indexOf('?') + 1));
  } catch {
    return null;
  }

  // A magnet can list several `xt` values; find the BitTorrent v1 one.
  const xts = params.getAll('xt');
  let infohash: string | null = null;
  for (const xt of xts) {
    const match = /^urn:btih:([0-9a-z]+)$/i.exec(xt.trim());
    if (!match) continue;
    const raw = match[1];
    if (raw.length === 40 && /^[0-9a-f]+$/i.test(raw)) {
      infohash = raw.toLowerCase();
      break;
    }
    if (raw.length === 32) {
      const bytes = base32ToBytes(raw);
      if (bytes && bytes.length === 20) {
        infohash = bytesToHex(bytes);
        break;
      }
    }
  }
  if (!infohash) return null;

  const name = params.get('dn');
  return { infohash, name: name && name.trim().length > 0 ? name.trim() : null };
}
