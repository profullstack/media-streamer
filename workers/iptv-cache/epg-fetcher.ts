/**
 * EPG Fetcher for IPTV Cache Worker
 *
 * Fetches and parses XMLTV EPG (Electronic Program Guide) data.
 * Uses SAX streaming parser for memory efficiency with large EPG files.
 */

import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';
import sax from 'sax';
import { FETCH_CONFIG, EPG_CONFIG, LOG_PREFIX } from './config';
import type { EpgFetchResult, EpgProgram, EpgChannel } from './types';

/**
 * Maximum time to parse EPG XML (5 minutes)
 */
const EPG_PARSE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * HTTP agent that skips SSL validation
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
 * Parse XMLTV datetime format to Unix timestamp
 * Format: YYYYMMDDHHmmss +ZZZZ (e.g., 20260104120000 +0000)
 */
function parseXmltvDate(dateStr: string): number {
  if (!dateStr) return 0;

  // Extract date and timezone parts
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!match) return 0;

  const [, year, month, day, hour, minute, second, tz] = match;

  // Create date string in ISO format
  let isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

  if (tz) {
    // Convert +0000 to +00:00 format
    isoString += `${tz.slice(0, 3)}:${tz.slice(3)}`;
  } else {
    isoString += 'Z';
  }

  const date = new Date(isoString);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Fetch with retry logic
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
        FETCH_CONFIG.timeout * 2 // Double timeout for EPG (can be larger)
      );

      const response = await undiciFetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': FETCH_CONFIG.userAgent,
          'Accept': 'application/xml, text/xml, application/gzip, */*',
          'Accept-Encoding': 'gzip, deflate',
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

      if (attempt < FETCH_CONFIG.maxRetries - 1) {
        const delay = FETCH_CONFIG.retryBaseDelay * Math.pow(2, attempt);
        console.log(
          `${LOG_PREFIX} EPG fetch attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
          lastError.message
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('EPG fetch failed after retries');
}

/**
 * Parse XMLTV EPG data using SAX streaming parser
 * Includes timeout to prevent hanging on malformed XML
 */
function parseXmltvStream(
  stream: Readable,
  maxPrograms: number
): Promise<{ channels: Record<string, EpgChannel>; programs: EpgProgram[] }> {
  return new Promise((resolve, reject) => {
    const channels: Record<string, EpgChannel> = {};
    const programs: EpgProgram[] = [];
    let isResolved = false;
    let lastActivityTime = Date.now();

    // Timeout to prevent hanging on malformed/incomplete XML
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        console.warn(`${LOG_PREFIX} EPG parsing timed out after ${EPG_PARSE_TIMEOUT_MS / 1000}s, returning partial results (${programs.length} programs)`);
        stream.destroy();
        resolve({ channels, programs });
      }
    }, EPG_PARSE_TIMEOUT_MS);

    // Time boundaries for filtering
    const now = Math.floor(Date.now() / 1000);
    const minTime = now - EPG_CONFIG.maxPastHours * 3600;
    const maxTime = now + EPG_CONFIG.maxFutureHours * 3600;

    const parser = sax.createStream(false, {
      lowercase: true,
      trim: true,
    });

    // Current parsing state
    let currentElement = '';
    let currentChannel: Partial<EpgChannel> | null = null;
    let currentProgram: Partial<EpgProgram> | null = null;
    let textBuffer = '';
    let programCount = 0;

    parser.on('opentag', (node) => {
      lastActivityTime = Date.now();
      currentElement = node.name;
      textBuffer = '';

      if (node.name === 'channel') {
        currentChannel = {
          id: node.attributes.id as string,
        };
      } else if (node.name === 'programme') {
        const start = parseXmltvDate(node.attributes.start as string);
        const stop = parseXmltvDate(node.attributes.stop as string);

        // Only include programs within our time window
        if (start <= maxTime && stop >= minTime) {
          currentProgram = {
            channelId: node.attributes.channel as string,
            start,
            stop,
          };
        }
      } else if (node.name === 'icon' && node.attributes.src) {
        if (currentChannel) {
          currentChannel.icon = node.attributes.src as string;
        } else if (currentProgram) {
          currentProgram.icon = node.attributes.src as string;
        }
      }
    });

    parser.on('text', (text) => {
      textBuffer += text;
    });

    parser.on('closetag', (name) => {
      const text = textBuffer.trim();

      if (name === 'channel' && currentChannel?.id) {
        channels[currentChannel.id] = currentChannel as EpgChannel;
        currentChannel = null;
      } else if (name === 'programme' && currentProgram?.channelId) {
        if (currentProgram.title && programs.length < maxPrograms) {
          programs.push(currentProgram as EpgProgram);
          programCount++;
          // Log progress for large EPG files
          if (programCount % 50000 === 0) {
            console.log(`${LOG_PREFIX} EPG parsing progress: ${programCount.toLocaleString()} programs...`);
          }
        }
        currentProgram = null;
      } else if (currentChannel) {
        if (name === 'display-name' && text) {
          currentChannel.displayName = text;
        }
      } else if (currentProgram) {
        if (name === 'title' && text) {
          currentProgram.title = text;
        } else if (name === 'desc' && text) {
          currentProgram.description = text;
        } else if (name === 'category' && text) {
          currentProgram.category = text;
        } else if (name === 'episode-num' && text) {
          currentProgram.episode = text;
        }
      }

      currentElement = '';
      textBuffer = '';
    });

    parser.on('error', (err) => {
      console.error(`${LOG_PREFIX} XML parsing error:`, err.message);
      // Continue parsing, don't reject on minor XML errors
      parser.resume();
    });

    parser.on('end', () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        resolve({ channels, programs });
      }
    });

    stream.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    });

    stream.pipe(parser);
  });
}

/**
 * Fetch and parse EPG data from a URL
 */
export async function fetchAndParseEpg(epgUrl: string): Promise<EpgFetchResult> {
  const startTime = Date.now();

  try {
    console.log(`${LOG_PREFIX} Fetching EPG from: ${epgUrl}`);

    const response = await fetchWithRetry(epgUrl);

    if (!response.body) {
      return {
        success: false,
        error: 'No response body',
        durationMs: Date.now() - startTime,
      };
    }

    // Check if response is gzipped
    const contentType = response.headers.get('content-type') ?? '';
    const contentEncoding = response.headers.get('content-encoding') ?? '';
    const isGzipped =
      contentEncoding.includes('gzip') ||
      epgUrl.endsWith('.gz') ||
      contentType.includes('gzip');

    // Convert Web ReadableStream to Node.js Readable
    const webStream = response.body;
    const reader = webStream.getReader();

    const nodeStream = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            this.push(Buffer.from(value));
          }
        } catch (error) {
          this.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      },
    });

    // Decompress if gzipped
    let parseStream: Readable = nodeStream;
    if (isGzipped) {
      console.log(`${LOG_PREFIX} Decompressing gzipped EPG`);
      const gunzip = createGunzip();
      nodeStream.pipe(gunzip);
      parseStream = gunzip;
    }

    // Parse the XML stream
    const { channels, programs } = await parseXmltvStream(
      parseStream,
      EPG_CONFIG.maxProgramsPerPlaylist
    );

    console.log(
      `${LOG_PREFIX} Parsed ${Object.keys(channels).length} EPG channels, ${programs.length} programs`
    );

    return {
      success: true,
      channels,
      programs,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Failed to fetch EPG:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Validate an EPG URL
 */
export function isValidEpgUrl(url: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
