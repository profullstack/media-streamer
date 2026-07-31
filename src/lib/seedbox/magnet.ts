/**
 * Magnet URI parsing.
 *
 * torlink keys every torrent in `/status` by its infohash (lowercase hex), so
 * to confirm an add actually landed we need the infohash of the magnet we sent.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a 32-char RFC 4648 base32 btih into 40-char hex.
 * BitTorrent v1 magnets may carry either encoding of the same 160-bit hash.
 */
function base32ToHex(input: string): string | null {
  let bits = '';
  for (const char of input.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) return null;
    bits += index.toString(2).padStart(5, '0');
  }
  // 32 base32 chars = 160 bits exactly; anything shorter isn't a v1 infohash.
  if (bits.length < 160) return null;
  let hex = '';
  for (let i = 0; i < 160; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Extract the v1 infohash from a magnet URI as lowercase hex, or null when the
 * magnet carries no usable `xt=urn:btih:` (e.g. a v2-only `btmh` magnet).
 *
 * Callers treat null as "can't verify" and must fail open rather than reporting
 * a send as broken just because we couldn't read its hash.
 */
export function parseInfohash(magnet: string): string | null {
  const match = /xt=urn:btih:([a-z0-9]+)/i.exec(magnet);
  if (!match) return null;
  const raw = match[1];
  if (/^[0-9a-f]{40}$/i.test(raw)) return raw.toLowerCase();
  if (/^[a-z2-7]{32}$/i.test(raw)) return base32ToHex(raw);
  return null;
}
