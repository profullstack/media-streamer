/**
 * IPTV Module
 * 
 * M3U playlist parsing and EPG management
 */

import { randomBytes } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * M3U Channel
 */
export interface M3UChannel {
  id: string;
  name: string;
  url: string;
  duration: number;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  groupTitle?: string;
  catchup?: string;
  catchupDays?: number;
  catchupSource?: string;
}

/**
 * M3U Playlist
 */
export interface M3UPlaylist {
  id: string;
  name: string;
  userId: string;
  channels: M3UChannel[];
  epgUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * EPG Source
 */
export interface EPGSource {
  url: string;
  format: 'xmltv' | 'json' | 'unknown';
}

/**
 * Channel Group
 */
export interface ChannelGroup {
  name: string;
  count: number;
}

/**
 * Parsed EXTINF result
 */
export interface ParsedExtInf {
  duration: number;
  name: string;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  groupTitle?: string;
  catchup?: string;
  catchupDays?: number;
  catchupSource?: string;
}

/**
 * M3U Parse Result
 */
export interface M3UParseResult {
  channels: M3UChannel[];
  epgUrl?: string;
}

/**
 * Create Playlist Options
 */
export interface CreatePlaylistOptions {
  name: string;
  userId: string;
  epgUrl?: string;
}

/**
 * Generate M3U Options
 */
export interface GenerateM3UOptions {
  epgUrl?: string;
}

/**
 * Filter Options
 */
export interface FilterOptions {
  hasLogo?: boolean;
  group?: string;
}

// ============================================================================
// M3U Parsing
// ============================================================================

/**
 * Parse M3U playlist content
 */
export function parseM3U(content: string): M3UParseResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const channels: M3UChannel[] = [];
  let epgUrl: string | undefined;
  let currentExtInf: ParsedExtInf | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Parse header for EPG URL
    if (line.startsWith('#EXTM3U')) {
      const match = line.match(/x-tvg-url="([^"]+)"/);
      if (match) {
        epgUrl = match[1];
      }
      continue;
    }

    // Parse EXTINF line
    if (line.startsWith('#EXTINF:')) {
      currentExtInf = parseExtInf(line);
      continue;
    }

    // Skip other directives
    if (line.startsWith('#')) {
      continue;
    }

    // This should be a URL line
    if (currentExtInf && (line.startsWith('http://') || line.startsWith('https://'))) {
      channels.push({
        id: randomBytes(8).toString('hex'),
        name: currentExtInf.name,
        url: line,
        duration: currentExtInf.duration,
        tvgId: currentExtInf.tvgId,
        tvgName: currentExtInf.tvgName,
        tvgLogo: currentExtInf.tvgLogo,
        groupTitle: currentExtInf.groupTitle,
        catchup: currentExtInf.catchup,
        catchupDays: currentExtInf.catchupDays,
        catchupSource: currentExtInf.catchupSource,
      });
      currentExtInf = null;
    }
  }

  return { channels, epgUrl };
}

/**
 * Parse a single M3U line (for streaming parsing)
 */
export function parseM3ULine(line: string): { type: 'header' | 'extinf' | 'url' | 'other'; data?: unknown } {
  const trimmed = line.trim();

  if (trimmed.startsWith('#EXTM3U')) {
    return { type: 'header' };
  }

  if (trimmed.startsWith('#EXTINF:')) {
    return { type: 'extinf', data: parseExtInf(trimmed) };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { type: 'url', data: trimmed };
  }

  return { type: 'other' };
}

/**
 * Parse EXTINF line
 */
export function parseExtInf(line: string): ParsedExtInf {
  // Remove #EXTINF: prefix
  const content = line.substring(8);

  // Find the comma that separates attributes from name
  // The name is after the last comma
  const lastCommaIndex = content.lastIndexOf(',');
  const name = lastCommaIndex >= 0 ? content.substring(lastCommaIndex + 1).trim() : '';

  // Parse duration and attributes before the comma
  const beforeComma = lastCommaIndex >= 0 ? content.substring(0, lastCommaIndex) : content;

  // Duration is the first number
  const durationMatch = beforeComma.match(/^(-?\d+)/);
  const duration = durationMatch ? parseInt(durationMatch[1], 10) : -1;

  // Parse attributes
  const attrs = parseAttributes(beforeComma);

  return {
    duration,
    name,
    tvgId: attrs['tvg-id'],
    tvgName: attrs['tvg-name'],
    tvgLogo: attrs['tvg-logo'],
    groupTitle: attrs['group-title'],
    catchup: attrs['catchup'],
    catchupDays: attrs['catchup-days'] ? parseInt(attrs['catchup-days'], 10) : undefined,
    catchupSource: attrs['catchup-source'],
  };
}

/**
 * Parse key-value attributes from string
 */
export function parseAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z-]+)="([^"]*)"/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

/**
 * Validate M3U content
 */
export function validateM3UContent(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  return trimmed.startsWith('#EXTM3U');
}

// ============================================================================
// M3U Generation
// ============================================================================

/**
 * Generate M3U content from channels
 */
export function generateM3U(channels: M3UChannel[], options?: GenerateM3UOptions): string {
  const lines: string[] = [];

  // Header
  let header = '#EXTM3U';
  if (options?.epgUrl) {
    header += ` x-tvg-url="${options.epgUrl}"`;
  }
  lines.push(header);

  // Channels
  for (const channel of channels) {
    let extinf = `#EXTINF:${channel.duration}`;

    if (channel.tvgId) {
      extinf += ` tvg-id="${channel.tvgId}"`;
    }
    if (channel.tvgName) {
      extinf += ` tvg-name="${channel.tvgName}"`;
    }
    if (channel.tvgLogo) {
      extinf += ` tvg-logo="${channel.tvgLogo}"`;
    }
    if (channel.groupTitle) {
      extinf += ` group-title="${channel.groupTitle}"`;
    }

    extinf += `,${channel.name}`;
    lines.push(extinf);
    lines.push(channel.url);
  }

  return lines.join('\n');
}

// ============================================================================
// EPG URL Handling
// ============================================================================

/**
 * Parse EPG URL and detect format
 */
export function parseEPGUrl(url: string): EPGSource {
  let format: 'xmltv' | 'json' | 'unknown' = 'unknown';

  if (url.endsWith('.xml') || url.endsWith('.xmltv') || url.includes('xmltv')) {
    format = 'xmltv';
  } else if (url.endsWith('.json')) {
    format = 'json';
  }

  return { url, format };
}

/**
 * Validate EPG URL
 */
export function validateEPGUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// Playlist Management
// ============================================================================

/**
 * Create a new playlist
 */
export function createPlaylist(options: CreatePlaylistOptions): M3UPlaylist {
  const now = new Date();

  return {
    id: randomBytes(16).toString('hex'),
    name: options.name,
    userId: options.userId,
    channels: [],
    epgUrl: options.epgUrl,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Add channel to playlist
 */
export function addChannel(playlist: M3UPlaylist, channel: M3UChannel): M3UPlaylist {
  // Check for duplicate
  const exists = playlist.channels.some(c => c.id === channel.id || c.url === channel.url);
  if (exists) {
    return playlist;
  }

  return {
    ...playlist,
    channels: [...playlist.channels, channel],
    updatedAt: new Date(),
  };
}

/**
 * Remove channel from playlist
 */
export function removeChannel(playlist: M3UPlaylist, channelId: string): M3UPlaylist {
  return {
    ...playlist,
    channels: playlist.channels.filter(c => c.id !== channelId),
    updatedAt: new Date(),
  };
}

/**
 * Update channel in playlist
 */
export function updateChannel(
  playlist: M3UPlaylist,
  channelId: string,
  updates: Partial<M3UChannel>
): M3UPlaylist {
  return {
    ...playlist,
    channels: playlist.channels.map(c =>
      c.id === channelId ? { ...c, ...updates } : c
    ),
    updatedAt: new Date(),
  };
}

// ============================================================================
// Channel Operations
// ============================================================================

/**
 * Get channels by group
 */
export function getChannelsByGroup(playlist: M3UPlaylist, group: string): M3UChannel[] {
  return playlist.channels.filter(c => c.groupTitle === group);
}

/**
 * Search channels
 */
export function searchChannels(playlist: M3UPlaylist, query: string): M3UChannel[] {
  const lowerQuery = query.toLowerCase();

  return playlist.channels.filter(c => {
    const nameMatch = c.name.toLowerCase().includes(lowerQuery);
    const groupMatch = c.groupTitle?.toLowerCase().includes(lowerQuery);
    const tvgNameMatch = c.tvgName?.toLowerCase().includes(lowerQuery);

    return nameMatch || groupMatch || tvgNameMatch;
  });
}

/**
 * Sort channels
 */
export function sortChannels(
  channels: M3UChannel[],
  by: 'name' | 'group',
  order: 'asc' | 'desc' = 'asc'
): M3UChannel[] {
  const sorted = [...channels].sort((a, b) => {
    let valueA: string;
    let valueB: string;

    if (by === 'name') {
      valueA = a.name.toLowerCase();
      valueB = b.name.toLowerCase();
    } else {
      valueA = (a.groupTitle ?? '').toLowerCase();
      valueB = (b.groupTitle ?? '').toLowerCase();
    }

    if (valueA < valueB) return order === 'asc' ? -1 : 1;
    if (valueA > valueB) return order === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
}

/**
 * Filter channels
 */
export function filterChannels(channels: M3UChannel[], options: FilterOptions): M3UChannel[] {
  return channels.filter(c => {
    if (options.hasLogo !== undefined) {
      const hasLogo = Boolean(c.tvgLogo);
      if (hasLogo !== options.hasLogo) return false;
    }

    if (options.group !== undefined) {
      if (c.groupTitle !== options.group) return false;
    }

    return true;
  });
}

// ============================================================================
// Playlist Operations
// ============================================================================

/**
 * Merge two playlists
 */
export function mergePlaylist(playlist1: M3UPlaylist, playlist2: M3UPlaylist): M3UPlaylist {
  const existingUrls = new Set(playlist1.channels.map(c => c.url));
  const newChannels = playlist2.channels.filter(c => !existingUrls.has(c.url));

  return {
    ...playlist1,
    channels: [...playlist1.channels, ...newChannels],
    updatedAt: new Date(),
  };
}

/**
 * Export playlist
 */
export function exportPlaylist(playlist: M3UPlaylist, format: 'M3U' | 'JSON'): string {
  if (format === 'JSON') {
    return JSON.stringify({
      name: playlist.name,
      channels: playlist.channels,
      epgUrl: playlist.epgUrl,
    }, null, 2);
  }

  return generateM3U(playlist.channels, { epgUrl: playlist.epgUrl });
}
