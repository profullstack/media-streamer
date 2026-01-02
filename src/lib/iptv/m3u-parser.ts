/**
 * M3U Parser
 * 
 * Parses M3U/M3U8 playlist files for IPTV channels.
 * Supports standard M3U format with EXTINF tags and common attributes.
 */

/**
 * Represents an IPTV channel parsed from an M3U playlist
 */
export interface Channel {
  /** Unique identifier for the channel */
  id: string;
  /** Display name of the channel */
  name: string;
  /** Stream URL (HLS/MPEG-TS) */
  url: string;
  /** Channel logo URL */
  logo?: string;
  /** Group/category the channel belongs to */
  group?: string;
  /** EPG ID for program guide matching */
  tvgId?: string;
  /** EPG name for program guide matching */
  tvgName?: string;
}

/**
 * Generates a unique ID for a channel based on its URL
 */
function generateChannelId(url: string, index: number): string {
  // Create a simple hash from the URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `ch_${Math.abs(hash).toString(36)}_${index}`;
}

/**
 * Extracts an attribute value from an EXTINF line
 */
function extractAttribute(line: string, attribute: string): string | undefined {
  // Match attribute="value" or attribute='value'
  const regex = new RegExp(`${attribute}=["']([^"']+)["']`, 'i');
  const match = line.match(regex);
  return match?.[1];
}

/**
 * Extracts the channel name from an EXTINF line
 * The name is everything after the last comma
 */
function extractChannelName(line: string): string {
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex === -1) {
    return 'Unknown Channel';
  }
  return line.substring(commaIndex + 1).trim();
}

/**
 * Parses M3U playlist content into an array of channels
 * 
 * @param content - Raw M3U playlist content
 * @returns Array of parsed channels
 */
export function parseM3U(content: string): Channel[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const channels: Channel[] = [];
  
  // Normalize line endings and split into lines
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let currentExtinf: string | null = null;
  let channelIndex = 0;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      currentExtinf = line;
    } else if (line.startsWith('#')) {
      // Skip other comments/directives
      continue;
    } else if (currentExtinf && (line.startsWith('http://') || line.startsWith('https://'))) {
      // This is a stream URL following an EXTINF line
      const channel: Channel = {
        id: generateChannelId(line, channelIndex),
        name: extractChannelName(currentExtinf),
        url: line,
        logo: extractAttribute(currentExtinf, 'tvg-logo'),
        group: extractAttribute(currentExtinf, 'group-title'),
        tvgId: extractAttribute(currentExtinf, 'tvg-id'),
        tvgName: extractAttribute(currentExtinf, 'tvg-name'),
      };
      
      channels.push(channel);
      channelIndex++;
      currentExtinf = null;
    }
  }

  return channels;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Searches channels by name with word-order-independent matching
 * 
 * @param channels - Array of channels to search
 * @param query - Search query (words can be in any order)
 * @param group - Optional group filter
 * @returns Filtered array of channels matching the search criteria
 */
export function searchChannels(
  channels: Channel[],
  query: string,
  group?: string
): Channel[] {
  let filtered = channels;

  // Filter by group if provided
  if (group) {
    filtered = filtered.filter(channel => channel.group === group);
  }

  // If no query, return all (filtered by group if applicable)
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return filtered;
  }

  // Split query into words and require all words to match (in any order)
  const words = trimmedQuery.toLowerCase().split(/\s+/);
  
  return filtered.filter(channel => {
    const channelNameLower = channel.name.toLowerCase();
    
    // All words must be present in the channel name
    return words.every(word => {
      const escapedWord = escapeRegex(word);
      return channelNameLower.includes(word) || 
             new RegExp(escapedWord, 'i').test(channel.name);
    });
  });
}

/**
 * Extracts unique groups from a list of channels
 * 
 * @param channels - Array of channels
 * @returns Array of unique group names
 */
export function extractGroups(channels: Channel[]): string[] {
  const groups = new Set<string>();
  
  for (const channel of channels) {
    if (channel.group) {
      groups.add(channel.group);
    }
  }
  
  return Array.from(groups).sort();
}

/**
 * Converts an HTTP URL to use the proxy endpoint for HTTPS compatibility
 * 
 * @param url - Original stream URL
 * @returns Proxied URL if HTTP, original URL if HTTPS
 */
export function getProxiedUrl(url: string): string {
  if (url.startsWith('http://')) {
    // Proxy HTTP URLs through our server to avoid mixed content issues
    return `/api/iptv-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}
