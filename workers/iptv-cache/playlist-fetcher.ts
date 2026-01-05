/**
 * Playlist Fetcher for IPTV Cache Worker
 *
 * Fetches M3U playlists from URLs and parses them into channels.
 * Reuses the existing M3U parser from src/lib/iptv.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';
import type { Database } from '../../src/lib/supabase/types';
import { parseM3U, extractGroups } from '../../src/lib/iptv/m3u-parser';
import { FETCH_CONFIG, LOG_PREFIX } from './config';
import type { IptvPlaylist, PlaylistFetchResult, Channel } from './types';

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
 * Fetch and parse an M3U playlist from a URL
 */
export async function fetchAndParsePlaylist(
  m3uUrl: string
): Promise<PlaylistFetchResult> {
  const startTime = Date.now();

  try {
    console.log(`${LOG_PREFIX} Fetching playlist from: ${m3uUrl}`);

    const response = await fetchWithRetry(m3uUrl);
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

    const channels = parseM3U(content);
    const groups = extractGroups(channels);

    console.log(
      `${LOG_PREFIX} Parsed ${channels.length} channels in ${groups.length} groups`
    );

    return {
      success: true,
      channels,
      groups,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Failed to fetch playlist:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
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
