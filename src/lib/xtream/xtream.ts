/**
 * Xtream Codes Module
 * 
 * Integration with Xtream Codes API for IPTV providers
 */

import { randomBytes } from 'crypto';
import type { M3UChannel } from '../iptv';

// ============================================================================
// Types
// ============================================================================

/**
 * Xtream stream type
 */
export type XtreamStreamType = 'live' | 'vod' | 'series';

/**
 * Xtream credentials
 */
export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

/**
 * Xtream provider
 */
export interface XtreamProvider extends XtreamCredentials {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Xtream category
 */
export interface XtreamCategory {
  id: string;
  name: string;
  parentId?: string;
  type: XtreamStreamType;
}

/**
 * Xtream live stream
 */
export interface XtreamLiveStream {
  id: string;
  name: string;
  logo?: string;
  categoryId: string;
  epgChannelId?: string;
}

/**
 * Xtream VOD stream
 */
export interface XtreamVodStream {
  id: string;
  name: string;
  poster?: string;
  categoryId: string;
  extension: string;
  rating?: string;
  plot?: string;
}

/**
 * Xtream series
 */
export interface XtreamSeries {
  id: string;
  name: string;
  cover?: string;
  categoryId: string;
  rating?: string;
  plot?: string;
}

/**
 * Xtream EPG entry
 */
export interface XtreamEPGEntry {
  id: string;
  channelId: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
}

/**
 * Create provider options
 */
export interface CreateProviderOptions {
  name: string;
  serverUrl: string;
  username: string;
  password: string;
}

/**
 * Parse response result
 */
export interface ParseResponseResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Raw category from API
 */
interface RawCategory {
  category_id: string;
  category_name: string;
  parent_id?: number | string;
}

/**
 * Raw live stream from API
 */
interface RawLiveStream {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  category_id: string;
  epg_channel_id?: string;
}

/**
 * Raw VOD stream from API
 */
interface RawVodStream {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  category_id: string;
  container_extension?: string;
  rating?: string;
  plot?: string;
}

/**
 * Raw series from API
 */
interface RawSeries {
  series_id: number | string;
  name: string;
  cover?: string;
  category_id: string;
  rating?: string;
  plot?: string;
}

/**
 * Raw EPG entry from API
 */
interface RawEPGEntry {
  id: string;
  epg_id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
}

// ============================================================================
// Provider Management
// ============================================================================

/**
 * Create a new Xtream provider
 */
export function createXtreamProvider(options: CreateProviderOptions): XtreamProvider {
  const now = new Date();

  // Normalize server URL (remove trailing slash)
  let serverUrl = options.serverUrl.trim();
  if (serverUrl.endsWith('/')) {
    serverUrl = serverUrl.slice(0, -1);
  }

  return {
    id: randomBytes(16).toString('hex'),
    name: options.name,
    serverUrl,
    username: options.username,
    password: options.password,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Validate Xtream credentials
 */
export function validateXtreamCredentials(credentials: XtreamCredentials): boolean {
  if (!credentials.serverUrl || !credentials.username || !credentials.password) {
    return false;
  }

  // Validate URL format
  try {
    const url = new URL(credentials.serverUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build Xtream API URL
 */
export function buildXtreamUrl(
  credentials: XtreamCredentials,
  endpoint: string,
  params?: Record<string, string>
): string {
  const url = new URL(`${credentials.serverUrl}/${endpoint}`);
  url.searchParams.set('username', credentials.username);
  url.searchParams.set('password', credentials.password);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Build live stream URL
 */
export function buildLiveStreamUrl(
  credentials: XtreamCredentials,
  streamId: string,
  extension = 'ts'
): string {
  return `${credentials.serverUrl}/live/${credentials.username}/${credentials.password}/${streamId}.${extension}`;
}

/**
 * Build VOD stream URL
 */
export function buildVodStreamUrl(
  credentials: XtreamCredentials,
  streamId: string,
  extension = 'mp4'
): string {
  return `${credentials.serverUrl}/movie/${credentials.username}/${credentials.password}/${streamId}.${extension}`;
}

/**
 * Build series stream URL
 */
export function buildSeriesStreamUrl(
  credentials: XtreamCredentials,
  episodeId: string,
  extension = 'mp4'
): string {
  return `${credentials.serverUrl}/series/${credentials.username}/${credentials.password}/${episodeId}.${extension}`;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse Xtream API response
 */
export function parseXtreamResponse(responseText: string): ParseResponseResult {
  if (!responseText || responseText.trim() === '') {
    return { success: false, error: 'Empty response' };
  }

  try {
    const data = JSON.parse(responseText) as Record<string, unknown>;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse response',
    };
  }
}

// ============================================================================
// Category Parsing
// ============================================================================

/**
 * Parse categories from API response
 */
export function getXtreamCategories(
  rawCategories: unknown[] | null | undefined,
  type: XtreamStreamType
): XtreamCategory[] {
  if (!rawCategories || !Array.isArray(rawCategories)) {
    return [];
  }

  return rawCategories.map((raw) => {
    const category = raw as RawCategory;
    return {
      id: String(category.category_id),
      name: category.category_name,
      parentId: category.parent_id ? String(category.parent_id) : undefined,
      type,
    };
  });
}

// ============================================================================
// Stream Parsing
// ============================================================================

/**
 * Parse live streams from API response
 */
export function getXtreamLiveStreams(rawStreams: unknown[]): XtreamLiveStream[] {
  if (!rawStreams || !Array.isArray(rawStreams)) {
    return [];
  }

  return rawStreams.map((raw) => {
    const stream = raw as RawLiveStream;
    return {
      id: String(stream.stream_id),
      name: stream.name,
      logo: stream.stream_icon,
      categoryId: stream.category_id,
      epgChannelId: stream.epg_channel_id,
    };
  });
}

/**
 * Parse VOD streams from API response
 */
export function getXtreamVodStreams(rawStreams: unknown[]): XtreamVodStream[] {
  if (!rawStreams || !Array.isArray(rawStreams)) {
    return [];
  }

  return rawStreams.map((raw) => {
    const stream = raw as RawVodStream;
    return {
      id: String(stream.stream_id),
      name: stream.name,
      poster: stream.stream_icon,
      categoryId: stream.category_id,
      extension: stream.container_extension ?? 'mp4',
      rating: stream.rating,
      plot: stream.plot,
    };
  });
}

/**
 * Parse series from API response
 */
export function getXtreamSeries(rawSeries: unknown[]): XtreamSeries[] {
  if (!rawSeries || !Array.isArray(rawSeries)) {
    return [];
  }

  return rawSeries.map((raw) => {
    const series = raw as RawSeries;
    return {
      id: String(series.series_id),
      name: series.name,
      cover: series.cover,
      categoryId: series.category_id,
      rating: series.rating,
      plot: series.plot,
    };
  });
}

// ============================================================================
// EPG Parsing
// ============================================================================

/**
 * Parse EPG entries from API response
 */
export function getXtreamEPG(rawEPG: unknown[]): XtreamEPGEntry[] {
  if (!rawEPG || !Array.isArray(rawEPG)) {
    return [];
  }

  return rawEPG.map((raw) => {
    const entry = raw as RawEPGEntry;
    return {
      id: entry.id,
      channelId: entry.epg_id,
      title: entry.title,
      start: new Date(entry.start),
      end: new Date(entry.end),
      description: entry.description,
    };
  });
}

// ============================================================================
// Channel Formatting
// ============================================================================

/**
 * Format Xtream stream as M3U channel
 */
export function formatXtreamChannel(
  credentials: XtreamCredentials,
  stream: XtreamLiveStream
): M3UChannel {
  return {
    id: stream.id,
    name: stream.name,
    url: buildLiveStreamUrl(credentials, stream.id),
    duration: -1,
    tvgId: stream.epgChannelId,
    tvgLogo: stream.logo,
    groupTitle: stream.categoryId,
  };
}
