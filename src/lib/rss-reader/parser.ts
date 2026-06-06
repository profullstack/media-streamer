import { DOMParser } from 'linkedom';
import type { OpmlFeedOutline, ParsedRssFeed, ParsedRssItem } from './types';

function textContent(element: Element | null): string | null {
  const text = element?.textContent?.trim();
  return text ? text : null;
}

function firstText(parent: ParentNode, selectors: string[]): string | null {
  for (const selector of selectors) {
    const text = textContent(parent.querySelector(selector));
    if (text) return text;
  }
  return null;
}

function firstAttr(parent: ParentNode, selectors: string[], attr: string): string | null {
  for (const selector of selectors) {
    const value = parent.querySelector(selector)?.getAttribute(attr)?.trim();
    if (value) return value;
  }
  return null;
}

function normalizeUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function atomLink(parent: ParentNode, baseUrl: string, rel = 'alternate'): string | null {
  const links = Array.from(parent.querySelectorAll('link'));
  const match = links.find((link) => (link.getAttribute('rel') ?? 'alternate') === rel) ?? links[0];
  return normalizeUrl(match?.getAttribute('href')?.trim() ?? null, baseUrl);
}

function rssImage(parent: ParentNode, baseUrl: string): string | null {
  return normalizeUrl(
    firstText(parent, ['image url']) ??
      firstAttr(parent, ['itunes\\:image', 'media\\:thumbnail', 'media\\:content'], 'url'),
    baseUrl
  );
}

function rssEnclosure(item: ParentNode, baseUrl: string): { url: string | null; type: string | null } {
  const enclosure = item.querySelector('enclosure') ?? item.querySelector('media\\:content');
  return {
    url: normalizeUrl(enclosure?.getAttribute('url')?.trim() ?? null, baseUrl),
    type: enclosure?.getAttribute('type')?.trim() ?? null,
  };
}

function stableGuid(parts: {
  guid: string | null;
  link: string | null;
  title: string;
  publishedAt: string | null;
}): string {
  return parts.guid ?? parts.link ?? `${parts.title}:${parts.publishedAt ?? ''}`;
}

function parseRss(channel: Element, feedUrl: string): ParsedRssFeed | null {
  const title = firstText(channel, ['title']);
  if (!title) return null;

  const items: ParsedRssItem[] = Array.from(channel.querySelectorAll('item')).map((item) => {
    const itemTitle = firstText(item, ['title']) ?? 'Untitled';
    const link = normalizeUrl(firstText(item, ['link']), feedUrl);
    const publishedAt = toIsoDate(firstText(item, ['pubDate', 'published', 'dc\\:date']));
    const enclosure = rssEnclosure(item, feedUrl);

    return {
      guid: stableGuid({
        guid: firstText(item, ['guid', 'id']),
        link,
        title: itemTitle,
        publishedAt,
      }),
      title: itemTitle,
      link,
      author: firstText(item, ['author', 'dc\\:creator']),
      summary: firstText(item, ['description', 'summary']),
      content: firstText(item, ['content\\:encoded', 'content']),
      imageUrl: rssImage(item, feedUrl),
      enclosureUrl: enclosure.url,
      enclosureType: enclosure.type,
      publishedAt,
      sourceUpdatedAt: toIsoDate(firstText(item, ['updated', 'atom\\:updated'])),
    };
  });

  return {
    feedUrl,
    title,
    description: firstText(channel, ['description', 'subtitle']),
    siteUrl: normalizeUrl(firstText(channel, ['link']), feedUrl),
    imageUrl: rssImage(channel, feedUrl),
    language: firstText(channel, ['language']),
    items,
  };
}

function parseAtom(feed: Element, feedUrl: string): ParsedRssFeed | null {
  const title = firstText(feed, ['title']);
  if (!title) return null;

  const items: ParsedRssItem[] = Array.from(feed.querySelectorAll('entry')).map((entry) => {
    const itemTitle = firstText(entry, ['title']) ?? 'Untitled';
    const link = atomLink(entry, feedUrl);
    const publishedAt = toIsoDate(firstText(entry, ['published', 'updated']));

    return {
      guid: stableGuid({
        guid: firstText(entry, ['id']),
        link,
        title: itemTitle,
        publishedAt,
      }),
      title: itemTitle,
      link,
      author: firstText(entry, ['author name', 'author', 'dc\\:creator']),
      summary: firstText(entry, ['summary']),
      content: firstText(entry, ['content']),
      imageUrl: normalizeUrl(firstAttr(entry, ['media\\:thumbnail', 'media\\:content'], 'url'), feedUrl),
      enclosureUrl: atomLink(entry, feedUrl, 'enclosure'),
      enclosureType: firstAttr(entry, ['link[rel="enclosure"]'], 'type'),
      publishedAt,
      sourceUpdatedAt: toIsoDate(firstText(entry, ['updated'])),
    };
  });

  return {
    feedUrl,
    title,
    description: firstText(feed, ['subtitle', 'summary']),
    siteUrl: atomLink(feed, feedUrl),
    imageUrl: normalizeUrl(firstText(feed, ['logo', 'icon']), feedUrl),
    language: feed.getAttribute('xml:lang') ?? feed.getAttribute('lang'),
    items,
  };
}

export function parseFeedXml(xml: string, feedUrl: string): ParsedRssFeed | null {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  const rssChannel = document.querySelector('rss channel') ?? document.querySelector('channel');
  if (rssChannel) return parseRss(rssChannel, feedUrl);

  const atomFeed = document.querySelector('feed');
  if (atomFeed) return parseAtom(atomFeed, feedUrl);

  return null;
}

function outlineTitle(outline: Element): string | null {
  return outline.getAttribute('title')?.trim() || outline.getAttribute('text')?.trim() || null;
}

export function parseOpmlXml(xml: string): OpmlFeedOutline[] {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  const results: OpmlFeedOutline[] = [];

  function walk(outline: Element, folder: string | null): void {
    const xmlUrl = outline.getAttribute('xmlUrl')?.trim();
    const htmlUrl = outline.getAttribute('htmlUrl')?.trim() ?? null;
    const title = outlineTitle(outline);

    if (xmlUrl) {
      try {
        const feedUrl = new URL(xmlUrl).toString();
        results.push({
          title,
          feedUrl,
          siteUrl: htmlUrl,
          folder,
        });
      } catch {
        // Ignore malformed OPML entries; caller reports valid imports and fetch failures.
      }
      return;
    }

    const nextFolder = title ?? folder;
    for (const child of Array.from(outline.children)) {
      if (child.tagName.toLowerCase() === 'outline') {
        walk(child, nextFolder);
      }
    }
  }

  for (const outline of Array.from(document.querySelectorAll('body > outline')) as Element[]) {
    walk(outline, null);
  }

  const seen = new Set<string>();
  return results.filter((outline) => {
    if (seen.has(outline.feedUrl)) return false;
    seen.add(outline.feedUrl);
    return true;
  });
}
