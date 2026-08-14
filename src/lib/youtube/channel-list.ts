/**
 * Parsing helpers for bulk YouTube channel lists.
 *
 * Supports the formats people actually paste in, notably the Kagi smallweb
 * list (https://github.com/kagisearch/smallweb/blob/main/smallyt.txt) whose
 * lines look like:
 *
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx # Title https://www.youtube.com/channel/UCxxx
 *
 * Also accepts bare channel ids, /channel/ URLs, and OPML exports.
 */

/** A YouTube channel id is always `UC` followed by 22 id characters. */
const CHANNEL_ID_PATTERN = /UC[A-Za-z0-9_-]{22}/;
const CHANNEL_ID_ANCHORED = /^UC[A-Za-z0-9_-]{22}$/;
const OPML_XML_URL_PATTERN = /xmlUrl\s*=\s*"([^"]+)"/gi;
const OPML_TITLE_PATTERN = /(?:title|text)\s*=\s*"([^"]*)"/i;
/** A trailing ` https://...` on a comment is the channel link, not the title. */
const TRAILING_URL_PATTERN = /\s+https?:\/\/\S*$/;

export interface ParsedChannelEntry {
  channelId: string;
  /** Human readable name when the source provided one. */
  title: string | null;
}

export interface ParseChannelListResult {
  entries: ParsedChannelEntry[];
  /** Lines that looked like content but carried no resolvable channel id. */
  unresolved: string[];
  /** Count of duplicate channel ids collapsed while parsing. */
  duplicateCount: number;
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (match) => HTML_ENTITIES[match] ?? match);
}

function cleanTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const withoutUrl = raw.replace(TRAILING_URL_PATTERN, '');
  const decoded = decodeEntities(withoutUrl).trim();
  return decoded.length > 0 ? decoded : null;
}

function extractChannelId(value: string): string | null {
  const match = CHANNEL_ID_PATTERN.exec(value);
  return match ? match[0] : null;
}

/**
 * `@handle` and `/c/vanity` URLs cannot be turned into a channel id without
 * spending 100 quota units on a search call, so they are reported as
 * unresolved rather than silently dropped.
 */
function looksLikeContent(line: string): boolean {
  return line.trim().length > 0;
}

function parseOpml(text: string): ParseChannelListResult {
  const entries: ParsedChannelEntry[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  // Walk <outline .../> elements so a title can stay paired with its feed url.
  const outlines = text.match(/<outline\b[^>]*>/gi) ?? [];
  for (const outline of outlines) {
    OPML_XML_URL_PATTERN.lastIndex = 0;
    const urlMatch = OPML_XML_URL_PATTERN.exec(outline);
    if (!urlMatch) continue;

    const channelId = extractChannelId(urlMatch[1]);
    if (!channelId) {
      unresolved.push(urlMatch[1]);
      continue;
    }
    if (seen.has(channelId)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(channelId);
    entries.push({
      channelId,
      title: cleanTitle(OPML_TITLE_PATTERN.exec(outline)?.[1] ?? null),
    });
  }

  return { entries, unresolved, duplicateCount };
}

/**
 * Parse a channel list into de-duplicated channel ids, preserving input order.
 */
export function parseChannelList(text: string): ParseChannelListResult {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { entries: [], unresolved: [], duplicateCount: 0 };
  }

  if (text.includes('<opml') || text.includes('<outline')) {
    return parseOpml(text);
  }

  const entries: ParsedChannelEntry[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!looksLikeContent(line)) continue;

    // A line that is only a comment carries no subscription target.
    if (line.startsWith('#')) continue;

    const hashIndex = line.indexOf('#');
    const target = hashIndex >= 0 ? line.slice(0, hashIndex).trim() : line;
    const comment = hashIndex >= 0 ? line.slice(hashIndex + 1).trim() : null;

    // Prefer an id from the feed/url portion; fall back to the comment, which
    // in the smallweb format repeats the canonical channel link.
    const channelId =
      extractChannelId(target) ?? (comment ? extractChannelId(comment) : null);

    if (!channelId) {
      unresolved.push(line);
      continue;
    }

    if (seen.has(channelId)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(channelId);

    entries.push({ channelId, title: cleanTitle(comment) });
  }

  return { entries, unresolved, duplicateCount };
}

/** Convenience wrapper returning just the channel ids, in order. */
export function parseChannelIds(text: string): string[] {
  return parseChannelList(text).entries.map((entry) => entry.channelId);
}

export function isValidChannelId(value: string): boolean {
  return CHANNEL_ID_ANCHORED.test(value.trim());
}
