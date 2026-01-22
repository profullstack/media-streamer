/**
 * Podcast Feed Fetcher
 *
 * Fetches and parses RSS feeds for podcasts to detect new episodes.
 */

import { FETCH_CONFIG, LOG_PREFIX } from './config';
import type { ParsedEpisode, ParsedPodcastFeed } from './types';

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < FETCH_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        FETCH_CONFIG.timeout
      );

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': FETCH_CONFIG.userAgent,
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
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
          `${LOG_PREFIX} Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${delay}ms:`,
          lastError.message
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Fetch failed after retries');
}

/**
 * Parse duration string to seconds
 * Supports formats: "3600", "45:30", "1:30:45"
 */
function parseDuration(duration: string | null): number | null {
  if (!duration) return null;

  // If it's just a number, return it as seconds
  const numericDuration = parseInt(duration, 10);
  if (!isNaN(numericDuration) && duration.match(/^\d+$/)) {
    return numericDuration;
  }

  // Parse HH:MM:SS or MM:SS format
  const parts = duration.split(':').map(p => parseInt(p, 10));

  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }

  return null;
}

/**
 * Strip CDATA wrappers from content
 * Handles multiple CDATA sections and whitespace around them
 */
function stripCdata(content: string | null): string | null {
  if (!content) return null;

  let result = content.trim();

  // Handle multiple CDATA sections by replacing all of them
  result = result.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');

  // Also handle HTML-encoded CDATA markers
  result = result.replace(/&lt;!\[CDATA\[([\s\S]*?)\]\]&gt;/gi, '$1');

  // Unescape any escaped end markers
  result = result.replace(/\]\]&gt;/g, ']]>');

  // Convert common HTML entities that might be in CDATA
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&#39;/g, "'");
  result = result.replace(/&apos;/g, "'");

  // Trim again after CDATA stripping to remove any internal whitespace
  return result.trim();
}

/**
 * Normalize a GUID to prevent duplicates from URL variations
 * Handles: trailing slashes, http/https, www prefix, whitespace
 */
function normalizeGuid(guid: string): string {
  let normalized = guid.trim();

  // If it looks like a URL, normalize it
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    // Normalize protocol to https
    normalized = normalized.replace(/^http:\/\//, 'https://');
    // Remove www. prefix
    normalized = normalized.replace(/^(https:\/\/)www\./, '$1');
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    // Decode URL-encoded characters for consistency
    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // If decoding fails, keep original
    }
  }

  return normalized;
}

/**
 * Parse RSS feed XML into structured data
 */
function parseRssFeed(xml: string): ParsedPodcastFeed | null {
  try {
    const getTagContent = (xmlStr: string, tag: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
      const match = xmlStr.match(regex);
      if (!match) return null;
      return stripCdata(match[1].trim());
    };

    const getAttributeValue = (xmlStr: string, tag: string, attr: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["'][^>]*>`, 'i');
      const match = xmlStr.match(regex);
      return match ? match[1] : null;
    };

    // Extract channel info
    const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i);
    if (!channelMatch) return null;
    const channelXml = channelMatch[1];

    // Get podcast metadata
    const title = getTagContent(channelXml, 'title');
    if (!title) return null;

    const description = getTagContent(channelXml, 'description') ||
                       getTagContent(channelXml, 'itunes:summary');
    const author = getTagContent(channelXml, 'itunes:author') ||
                  getTagContent(channelXml, 'author');
    const imageUrl = getAttributeValue(channelXml, 'itunes:image', 'href') ||
                    getTagContent(channelXml, 'image>url');
    const websiteUrl = getTagContent(channelXml, 'link');
    const language = getTagContent(channelXml, 'language');

    // Extract categories
    const categories: string[] = [];
    const categoryMatches = channelXml.matchAll(/<itunes:category[^>]*text=["']([^"']*)["'][^>]*>/gi);
    for (const match of categoryMatches) {
      categories.push(match[1]);
    }

    // Extract episodes
    const episodes: ParsedEpisode[] = [];
    const itemMatches = channelXml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

    for (const itemMatch of itemMatches) {
      const itemXml = itemMatch[1];

      const episodeTitle = getTagContent(itemXml, 'title');
      const rawGuid = getTagContent(itemXml, 'guid') || getTagContent(itemXml, 'link');
      const guid = rawGuid ? normalizeGuid(rawGuid) : null;
      const audioUrl = getAttributeValue(itemXml, 'enclosure', 'url');
      const pubDateStr = getTagContent(itemXml, 'pubDate');

      if (!episodeTitle || !guid || !audioUrl) continue;

      const episodeDescription = getTagContent(itemXml, 'description') ||
                                getTagContent(itemXml, 'itunes:summary');
      const durationStr = getTagContent(itemXml, 'itunes:duration');
      const episodeImageUrl = getAttributeValue(itemXml, 'itunes:image', 'href');
      const seasonStr = getTagContent(itemXml, 'itunes:season');
      const episodeStr = getTagContent(itemXml, 'itunes:episode');

      const publishedAt = pubDateStr ? new Date(pubDateStr) : new Date();

      episodes.push({
        guid,
        title: episodeTitle,
        description: episodeDescription,
        audioUrl,
        durationSeconds: parseDuration(durationStr),
        imageUrl: episodeImageUrl,
        publishedAt,
        seasonNumber: seasonStr ? parseInt(seasonStr, 10) : null,
        episodeNumber: episodeStr ? parseInt(episodeStr, 10) : null,
      });
    }

    // Sort episodes by published date (newest first)
    episodes.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    return {
      podcast: {
        title,
        description,
        author,
        imageUrl,
        websiteUrl,
        language,
        categories,
      },
      episodes,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to parse RSS feed:`, error);
    return null;
  }
}

/**
 * Fetch and parse a podcast RSS feed
 */
export async function fetchPodcastFeed(feedUrl: string): Promise<ParsedPodcastFeed | null> {
  try {
    const response = await fetchWithRetry(feedUrl);
    const xml = await response.text();
    return parseRssFeed(xml);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Failed to fetch feed ${feedUrl}:`, errorMessage);
    return null;
  }
}
