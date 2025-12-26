/**
 * Magnet URI Parser and Validator
 * 
 * Parses and validates BitTorrent magnet URIs according to BEP 9
 * https://www.bittorrent.org/beps/bep_0009.html
 */

/**
 * Custom error class for magnet parsing errors
 */
export class MagnetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MagnetParseError';
  }
}

/**
 * Parsed magnet URI structure
 */
export interface ParsedMagnet {
  /** The infohash (40 character hex string) */
  infohash: string;
  /** Display name of the torrent */
  displayName?: string;
  /** List of tracker URLs */
  trackers: string[];
  /** Exact length in bytes */
  exactLength?: number;
  /** Web seed URLs */
  webSeeds: string[];
  /** Keywords */
  keywords: string[];
  /** Original magnet URI */
  originalUri: string;
}

/**
 * Base32 alphabet for decoding
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a base32 string to a hex string
 */
function base32ToHex(base32: string): string {
  const normalized = base32.toUpperCase().replace(/=+$/, '');
  
  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new MagnetParseError(`Invalid base32 character: ${char}`);
    }
    bits += index.toString(2).padStart(5, '0');
  }
  
  // Convert bits to hex
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  
  return hex;
}

/**
 * Validate a hex infohash (40 characters, hex only)
 */
function isValidHexInfohash(hash: string): boolean {
  return /^[a-f0-9]{40}$/i.test(hash);
}

/**
 * Validate a base32 infohash (32 characters, base32 alphabet)
 */
function isValidBase32Infohash(hash: string): boolean {
  return /^[A-Z2-7]{32}$/i.test(hash);
}

/**
 * Parse a magnet URI into its components
 * 
 * @param magnetUri - The magnet URI to parse
 * @returns Parsed magnet object
 * @throws MagnetParseError if the URI is invalid
 */
export function parseMagnetUri(magnetUri: string): ParsedMagnet {
  if (!magnetUri || typeof magnetUri !== 'string') {
    throw new MagnetParseError('Invalid magnet URI: empty or not a string');
  }

  const trimmed = magnetUri.trim();

  // Remove fragment if present
  const withoutFragment = trimmed.split('#')[0];

  // Check scheme
  if (!withoutFragment.startsWith('magnet:')) {
    throw new MagnetParseError('Invalid magnet URI: must start with "magnet:"');
  }

  // Parse query string
  const queryStart = withoutFragment.indexOf('?');
  if (queryStart === -1) {
    throw new MagnetParseError('Invalid magnet URI: missing query parameters');
  }

  const queryString = withoutFragment.slice(queryStart + 1);
  const params = new URLSearchParams(queryString);

  // Extract xt (exact topic) - required
  const xt = params.get('xt');
  if (!xt) {
    throw new MagnetParseError('Invalid magnet URI: missing xt parameter');
  }

  // Parse xt - must be urn:btih:HASH format
  const btihMatch = xt.match(/^urn:btih:(.+)$/i);
  if (!btihMatch) {
    throw new MagnetParseError('Invalid magnet URI: xt must be urn:btih format');
  }

  let infohash = btihMatch[1];

  // Handle base32 or hex infohash
  if (isValidBase32Infohash(infohash)) {
    // Convert base32 to hex
    infohash = base32ToHex(infohash);
  } else if (isValidHexInfohash(infohash)) {
    // Already hex, just normalize to lowercase
    infohash = infohash.toLowerCase();
  } else {
    throw new MagnetParseError(`Invalid infohash: must be 40 hex characters or 32 base32 characters, got "${infohash}"`);
  }

  // Extract display name (dn)
  const dn = params.get('dn');
  const displayName = dn ? decodeURIComponent(dn.replace(/\+/g, ' ')) : undefined;

  // Extract trackers (tr) - can have multiple
  const trackers: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'tr') {
      trackers.push(decodeURIComponent(value));
    }
  }

  // Extract exact length (xl)
  const xl = params.get('xl');
  const exactLength = xl ? parseInt(xl, 10) : undefined;

  // Extract web seeds (ws) - can have multiple
  const webSeeds: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'ws') {
      webSeeds.push(decodeURIComponent(value));
    }
  }

  // Extract keywords (kt)
  const kt = params.get('kt');
  const keywords = kt ? decodeURIComponent(kt).split(/\s+/) : [];

  return {
    infohash,
    displayName,
    trackers,
    exactLength,
    webSeeds,
    keywords,
    originalUri: trimmed,
  };
}

/**
 * Validate a magnet URI without throwing
 * 
 * @param magnetUri - The magnet URI to validate
 * @returns true if valid, false otherwise
 */
export function validateMagnetUri(magnetUri: unknown): boolean {
  if (!magnetUri || typeof magnetUri !== 'string') {
    return false;
  }

  try {
    parseMagnetUri(magnetUri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract just the infohash from a magnet URI
 * 
 * @param magnetUri - The magnet URI
 * @returns The infohash (40 character lowercase hex string)
 * @throws MagnetParseError if the URI is invalid
 */
export function extractInfohash(magnetUri: string): string {
  const parsed = parseMagnetUri(magnetUri);
  return parsed.infohash;
}

/**
 * Normalize a magnet URI to a canonical form
 * 
 * - Lowercase infohash
 * - Consistent parameter order (xt, dn, xl, tr, ws, kt)
 * - Deduplicated trackers
 * 
 * @param magnetUri - The magnet URI to normalize
 * @returns Normalized magnet URI
 * @throws MagnetParseError if the URI is invalid
 */
export function normalizeMagnetUri(magnetUri: string): string {
  const parsed = parseMagnetUri(magnetUri);

  const parts: string[] = [];

  // xt (exact topic) - always first
  parts.push(`xt=urn:btih:${parsed.infohash}`);

  // dn (display name)
  if (parsed.displayName) {
    parts.push(`dn=${encodeURIComponent(parsed.displayName).replace(/%20/g, '+')}`);
  }

  // xl (exact length)
  if (parsed.exactLength !== undefined) {
    parts.push(`xl=${parsed.exactLength}`);
  }

  // tr (trackers) - deduplicated
  const uniqueTrackers = [...new Set(parsed.trackers)];
  for (const tracker of uniqueTrackers) {
    parts.push(`tr=${encodeURIComponent(tracker)}`);
  }

  // ws (web seeds)
  for (const webSeed of parsed.webSeeds) {
    parts.push(`ws=${encodeURIComponent(webSeed)}`);
  }

  // kt (keywords)
  if (parsed.keywords.length > 0) {
    parts.push(`kt=${encodeURIComponent(parsed.keywords.join(' '))}`);
  }

  return `magnet:?${parts.join('&')}`;
}
