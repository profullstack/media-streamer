/**
 * Tracker Scrape Service
 *
 * Fetches seeders/leechers counts from BitTorrent trackers using the scrape protocol.
 * Only HTTP/HTTPS trackers are supported (UDP requires native sockets not available in Node.js fetch).
 *
 * This is a SERVER-SIDE ONLY service.
 */

import { createLogger } from '../logger';

const logger = createLogger('TrackerScrape');

/**
 * Result from scraping a single tracker
 */
export interface ScrapeResult {
  /** Number of seeders (complete peers) */
  seeders: number;
  /** Number of leechers (incomplete peers) */
  leechers: number;
  /** Number of times the torrent has been downloaded */
  downloaded?: number;
  /** The tracker URL that provided this data */
  trackerUrl: string;
}

/**
 * Aggregated swarm statistics from multiple trackers
 */
export interface SwarmStats {
  /** Number of seeders (highest value from all trackers, or null if unknown) */
  seeders: number | null;
  /** Number of leechers (highest value from all trackers, or null if unknown) */
  leechers: number | null;
  /** Timestamp when stats were fetched */
  fetchedAt: Date;
  /** Number of trackers that responded successfully */
  trackersResponded: number;
  /** Total number of trackers queried */
  trackersQueried: number;
}

/**
 * Options for scraping trackers
 */
export interface ScrapeOptions {
  /** Timeout in milliseconds for each tracker request (default: 15000) */
  timeout?: number;
  /** Maximum number of trackers to query concurrently (default: 5) */
  maxConcurrent?: number;
}

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_MAX_CONCURRENT = 5;

/**
 * Convert a hex infohash to URL-encoded binary format for scrape requests
 */
function encodeInfohash(infohash: string): string {
  // Convert hex string to bytes, then URL-encode each byte
  const bytes = Buffer.from(infohash, 'hex');
  let encoded = '';
  for (const byte of bytes) {
    // URL-encode each byte
    encoded += '%' + byte.toString(16).padStart(2, '0').toUpperCase();
  }
  return encoded;
}

/**
 * Build a scrape URL from an announce URL
 *
 * @param announceUrl - The tracker announce URL
 * @param infohash - The torrent infohash (40 character hex string)
 * @returns The scrape URL, or null if the tracker doesn't support scraping
 */
export function buildScrapeUrl(announceUrl: string, infohash: string): string | null {
  // Only HTTP/HTTPS trackers support scraping via fetch
  if (!announceUrl.startsWith('http://') && !announceUrl.startsWith('https://')) {
    return null;
  }

  // Convert announce URL to scrape URL
  // Standard: replace 'announce' with 'scrape' in the path
  let scrapeUrl: string;
  
  if (announceUrl.includes('/announce')) {
    scrapeUrl = announceUrl.replace('/announce', '/scrape');
  } else {
    // If no /announce in URL, append /scrape
    const url = new URL(announceUrl);
    url.pathname = url.pathname.replace(/\/?$/, '/scrape');
    scrapeUrl = url.toString();
  }

  // Add the info_hash parameter
  const encodedInfohash = encodeInfohash(infohash);
  const separator = scrapeUrl.includes('?') ? '&' : '?';
  return `${scrapeUrl}${separator}info_hash=${encodedInfohash}`;
}

/**
 * Parse a bencoded HTTP scrape response
 *
 * Scrape response format (bencoded):
 * d5:filesd20:<binary_infohash>d8:completei<n>e10:downloadedi<n>e10:incompletei<n>eeee
 *
 * @param data - The raw response data
 * @param infohash - The infohash we're looking for
 * @returns Parsed scrape result, or null if parsing failed
 */
export function parseHttpScrapeResponse(data: Buffer, _infohash: string): ScrapeResult | null {
  try {
    const str = data.toString('binary');
    
    // Simple bencode parsing for scrape response
    // Look for the pattern: d5:filesd20:<binary>d8:completei<n>e...
    
    // Find "files" dictionary
    const filesIndex = str.indexOf('5:files');
    if (filesIndex === -1) {
      logger.debug('No files dictionary in scrape response');
      return null;
    }

    // Look for complete/incomplete values
    // Format: 8:completei<number>e
    const completeMatch = str.match(/8:completei(\d+)e/);
    const incompleteMatch = str.match(/10:incompletei(\d+)e/);
    const downloadedMatch = str.match(/10:downloadedi(\d+)e/);

    if (!completeMatch || !incompleteMatch) {
      logger.debug('Could not find complete/incomplete values in scrape response');
      return null;
    }

    const seeders = parseInt(completeMatch[1], 10);
    const leechers = parseInt(incompleteMatch[1], 10);
    const downloaded = downloadedMatch ? parseInt(downloadedMatch[1], 10) : undefined;

    return {
      seeders,
      leechers,
      downloaded,
      trackerUrl: '', // Will be filled in by caller
    };
  } catch (error) {
    logger.debug('Failed to parse scrape response', { error: String(error) });
    return null;
  }
}

/**
 * Scrape a single tracker for swarm statistics
 *
 * @param trackerUrl - The tracker announce URL
 * @param infohash - The torrent infohash (40 character hex string)
 * @param options - Scrape options
 * @returns Scrape result, or null if scraping failed
 */
export async function scrapeTracker(
  trackerUrl: string,
  infohash: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult | null> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const scrapeUrl = buildScrapeUrl(trackerUrl, infohash);
  if (!scrapeUrl) {
    logger.debug('Tracker does not support HTTP scraping', { trackerUrl });
    return null;
  }

  logger.debug('Scraping tracker', { trackerUrl, scrapeUrl, infohash });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(scrapeUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BitTorrented/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.debug('Tracker scrape failed', { trackerUrl, status: response.status });
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const result = parseHttpScrapeResponse(buffer, infohash);

    if (result) {
      result.trackerUrl = trackerUrl;
      logger.debug('Tracker scrape successful', {
        trackerUrl,
        seeders: result.seeders,
        leechers: result.leechers,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.debug('Tracker scrape timed out', { trackerUrl, timeout });
    } else {
      logger.debug('Tracker scrape error', { trackerUrl, error: String(error) });
    }
    return null;
  }
}

/**
 * Scrape multiple trackers and aggregate the results
 *
 * Returns the highest seeders/leechers counts found across all trackers.
 *
 * @param trackerUrls - List of tracker announce URLs
 * @param infohash - The torrent infohash (40 character hex string)
 * @param options - Scrape options
 * @returns Aggregated swarm statistics
 */
export async function scrapeMultipleTrackers(
  trackerUrls: string[],
  infohash: string,
  options: ScrapeOptions = {}
): Promise<SwarmStats> {
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const startTime = Date.now();

  // Filter to only HTTP/HTTPS trackers
  const httpTrackers = trackerUrls.filter(
    url => url.startsWith('http://') || url.startsWith('https://')
  );

  logger.info('Scraping multiple trackers', {
    totalTrackers: trackerUrls.length,
    httpTrackers: httpTrackers.length,
    infohash,
  });

  if (httpTrackers.length === 0) {
    logger.warn('No HTTP trackers available for scraping', { infohash });
    return {
      seeders: null,
      leechers: null,
      fetchedAt: new Date(),
      trackersResponded: 0,
      trackersQueried: 0,
    };
  }

  // Scrape trackers with concurrency limit
  const results: ScrapeResult[] = [];
  
  for (let i = 0; i < httpTrackers.length; i += maxConcurrent) {
    const batch = httpTrackers.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(url => scrapeTracker(url, infohash, options))
    );
    
    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }
  }

  // Aggregate results - take the highest values
  let maxSeeders: number | null = null;
  let maxLeechers: number | null = null;

  for (const result of results) {
    if (maxSeeders === null || result.seeders > maxSeeders) {
      maxSeeders = result.seeders;
    }
    if (maxLeechers === null || result.leechers > maxLeechers) {
      maxLeechers = result.leechers;
    }
  }

  const elapsed = Date.now() - startTime;
  logger.info('Tracker scraping complete', {
    infohash,
    seeders: maxSeeders,
    leechers: maxLeechers,
    trackersResponded: results.length,
    trackersQueried: httpTrackers.length,
    elapsed: `${elapsed}ms`,
  });

  return {
    seeders: maxSeeders,
    leechers: maxLeechers,
    fetchedAt: new Date(),
    trackersResponded: results.length,
    trackersQueried: httpTrackers.length,
  };
}

/**
 * List of reliable HTTP trackers for scraping
 * These are the same trackers used in TorrentService
 */
export const SCRAPE_TRACKERS = [
  'http://tracker.opentrackr.org:1337/announce',
  'http://tracker.openbittorrent.com:80/announce',
  'http://tracker.bt4g.com:2095/announce',
  'http://tracker.files.fm:6969/announce',
  'http://tracker.gbitt.info:80/announce',
  'http://open.acgnxtracker.com:80/announce',
  'http://tracker.dler.org:6969/announce',
];
