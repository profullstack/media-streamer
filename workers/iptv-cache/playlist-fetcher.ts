/**
 * Playlist Fetcher for IPTV Cache Worker
 *
 * Fetches M3U playlists from URLs and parses them into channels.
 * Supports streaming large playlists to disk to avoid memory issues.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';
import { createWriteStream, createReadStream, unlinkSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from '../../src/lib/supabase/types';
import { FETCH_CONFIG, LOG_PREFIX } from './config';
import type { IptvPlaylist, PlaylistFetchResult } from './types';
import type { Channel } from '../../src/lib/iptv/m3u-parser';

/**
 * Size threshold for streaming to disk (50MB)
 */
const STREAM_THRESHOLD_BYTES = 50 * 1024 * 1024;

/**
 * Create a Supabase client for the worker
 */
function createWorkerSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * HTTP agent that skips SSL validation (many IPTV providers have bad certs)
 */
const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
    // Allow legacy TLS versions that some IPTV providers use
    minVersion: 'TLSv1' as const,
    // Don't fail on self-signed or expired certs
    checkServerIdentity: () => undefined,
  },
});

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: Record<string, unknown> = {}
): Promise<UndiciResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < FETCH_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        FETCH_CONFIG.timeout
      );

      const response = await undiciFetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': FETCH_CONFIG.userAgent,
          Accept: '*/*',
          ...(options.headers as Record<string, string> || {}),
        },
        dispatcher: insecureAgent,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort (timeout) for the last attempt
      if (attempt < FETCH_CONFIG.maxRetries - 1) {
        const delay =
          FETCH_CONFIG.retryBaseDelay * Math.pow(2, attempt);
        console.log(
          `${LOG_PREFIX} Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
          lastError.message
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Fetch failed after retries');
}

/**
 * Fetch all active playlists from the database
 */
export async function fetchActivePlaylists(
  supabase?: SupabaseClient<Database>
): Promise<IptvPlaylist[]> {
  const client = supabase ?? createWorkerSupabaseClient();

  const { data, error } = await client
    .from('iptv_playlists')
    .select('*')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to fetch playlists: ${error.message}`);
  }

  return (data ?? []) as IptvPlaylist[];
}

/**
 * Generates a unique ID for a channel based on its URL
 */
function generateChannelId(url: string, index: number): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `ch_${Math.abs(hash).toString(36)}_${index}`;
}

/**
 * Extracts an attribute value from an EXTINF line
 */
function extractAttribute(line: string, attribute: string): string | undefined {
  const regex = new RegExp(`${attribute}=["']([^"']+)["']`, 'i');
  const match = line.match(regex);
  return match?.[1];
}

/**
 * Extracts the channel name from an EXTINF line
 */
function extractChannelName(line: string): string {
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex === -1) {
    return 'Unknown Channel';
  }
  return line.substring(commaIndex + 1).trim();
}

/**
 * Stream download a file to disk
 */
async function streamToFile(response: UndiciResponse, filePath: string): Promise<number> {
  const body = response.body;
  if (!body) {
    throw new Error('Response has no body');
  }

  const writeStream = createWriteStream(filePath);
  // Use type assertion to handle ReadableStream compatibility between DOM and Node.js types
  await pipeline(Readable.fromWeb(body as unknown as import('stream/web').ReadableStream), writeStream);

  const stats = statSync(filePath);
  return stats.size;
}

/**
 * Yield to event loop periodically to prevent blocking
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Parse M3U file using streaming (line by line)
 * Yields to event loop periodically to prevent blocking on large playlists
 */
async function parseM3UStreaming(filePath: string): Promise<{ channels: Channel[]; groups: string[] }> {
  const channels: Channel[] = [];
  const groups = new Set<string>();

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let currentExtinf: string | null = null;
  let channelIndex = 0;
  let hasValidHeader = false;
  let lastLogTime = Date.now();
  const LOG_INTERVAL_MS = 5000; // Log progress every 5 seconds

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.includes('#EXTM3U') || line.includes('#EXTINF')) {
      hasValidHeader = true;
    }

    if (line.startsWith('#EXTINF:')) {
      currentExtinf = line;
    } else if (line.startsWith('#')) {
      continue;
    } else if (currentExtinf && (line.startsWith('http://') || line.startsWith('https://'))) {
      const group = extractAttribute(currentExtinf, 'group-title');
      const channel: Channel = {
        id: generateChannelId(line, channelIndex),
        name: extractChannelName(currentExtinf),
        url: line,
        logo: extractAttribute(currentExtinf, 'tvg-logo'),
        group,
        tvgId: extractAttribute(currentExtinf, 'tvg-id'),
        tvgName: extractAttribute(currentExtinf, 'tvg-name'),
      };

      channels.push(channel);
      if (group) {
        groups.add(group);
      }
      channelIndex++;
      currentExtinf = null;

      // Yield to event loop every 10k channels to prevent blocking
      if (channelIndex % 10000 === 0) {
        await yieldToEventLoop();

        // Log progress periodically
        const now = Date.now();
        if (now - lastLogTime > LOG_INTERVAL_MS) {
          console.log(`${LOG_PREFIX} Parsing progress: ${channelIndex.toLocaleString()} channels...`);
          lastLogTime = now;
        }
      }
    }
  }

  if (!hasValidHeader) {
    throw new Error('Invalid M3U format: missing #EXTM3U or #EXTINF');
  }

  console.log(`${LOG_PREFIX} Parsing complete: ${channels.length.toLocaleString()} channels`);

  return {
    channels,
    groups: Array.from(groups).sort(),
  };
}

/**
 * Fetch and parse an M3U playlist from a URL
 * Uses streaming for large playlists to avoid memory issues
 */
export async function fetchAndParsePlaylist(
  m3uUrl: string
): Promise<PlaylistFetchResult> {
  const startTime = Date.now();
  let tempFilePath: string | null = null;

  try {
    console.log(`${LOG_PREFIX} Fetching playlist from: ${m3uUrl}`);

    const response = await fetchWithRetry(m3uUrl);

    // Check content-length to decide if we should stream to disk
    const contentLength = response.headers.get('content-length');
    const estimatedSize = contentLength ? parseInt(contentLength, 10) : 0;

    if (estimatedSize > STREAM_THRESHOLD_BYTES) {
      // Large file - stream to disk
      console.log(`${LOG_PREFIX} Large playlist detected (${Math.round(estimatedSize / 1024 / 1024)}MB), streaming to disk...`);

      tempFilePath = join(tmpdir(), `iptv-playlist-${Date.now()}.m3u`);
      const actualSize = await streamToFile(response, tempFilePath);
      console.log(`${LOG_PREFIX} Downloaded ${Math.round(actualSize / 1024 / 1024)}MB to ${tempFilePath}`);

      // Parse from file using streaming
      const { channels, groups } = await parseM3UStreaming(tempFilePath);

      console.log(
        `${LOG_PREFIX} Parsed ${channels.length} channels in ${groups.length} groups`
      );

      return {
        success: true,
        channels,
        groups,
        durationMs: Date.now() - startTime,
      };
    } else {
      // Small file - parse in memory (original behavior)
      const content = await response.text();

      if (!content || content.trim().length === 0) {
        return {
          success: false,
          error: 'Empty playlist content',
          durationMs: Date.now() - startTime,
        };
      }

      // Check for M3U header
      if (!content.includes('#EXTM3U') && !content.includes('#EXTINF')) {
        return {
          success: false,
          error: 'Invalid M3U format: missing #EXTM3U or #EXTINF',
          durationMs: Date.now() - startTime,
        };
      }

      // Parse inline - reuse the streaming parser logic
      const channels: Channel[] = [];
      const groups = new Set<string>();
      const lines = content.split(/\r?\n/);
      let currentExtinf: string | null = null;
      let channelIndex = 0;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
          currentExtinf = line;
        } else if (line.startsWith('#')) {
          continue;
        } else if (currentExtinf && (line.startsWith('http://') || line.startsWith('https://'))) {
          const group = extractAttribute(currentExtinf, 'group-title');
          const channel: Channel = {
            id: generateChannelId(line, channelIndex),
            name: extractChannelName(currentExtinf),
            url: line,
            logo: extractAttribute(currentExtinf, 'tvg-logo'),
            group,
            tvgId: extractAttribute(currentExtinf, 'tvg-id'),
            tvgName: extractAttribute(currentExtinf, 'tvg-name'),
          };

          channels.push(channel);
          if (group) {
            groups.add(group);
          }
          channelIndex++;
          currentExtinf = null;
        }
      }

      console.log(
        `${LOG_PREFIX} Parsed ${channels.length} channels in ${groups.size} groups`
      );

      return {
        success: true,
        channels,
        groups: Array.from(groups).sort(),
        durationMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Failed to fetch playlist:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Batch fetch multiple playlists with concurrency control
 */
export async function fetchPlaylistsBatch(
  playlists: IptvPlaylist[],
  concurrency = 3
): Promise<Map<string, PlaylistFetchResult>> {
  const results = new Map<string, PlaylistFetchResult>();

  // Process in batches to limit concurrency
  for (let i = 0; i < playlists.length; i += concurrency) {
    const batch = playlists.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (playlist) => {
        const result = await fetchAndParsePlaylist(playlist.m3u_url);
        return { id: playlist.id, result };
      })
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
    }
  }

  return results;
}

/**
 * Create a worker Supabase client (exported for use in main worker)
 */
export { createWorkerSupabaseClient };
