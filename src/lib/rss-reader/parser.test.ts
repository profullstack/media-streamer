import { describe, expect, it } from 'vitest';
import { parseFeedXml, parseOpmlXml } from './parser';

describe('RSS reader parser', () => {
  it('parses RSS feeds with items', () => {
    const feed = parseFeedXml(
      `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Example Feed</title>
          <description>Updates</description>
          <link>https://example.com</link>
          <item>
            <title>First Post</title>
            <guid>post-1</guid>
            <link>/first</link>
            <pubDate>Sat, 06 Jun 2026 12:00:00 GMT</pubDate>
            <description>Hello</description>
          </item>
        </channel>
      </rss>`,
      'https://example.com/feed.xml'
    );

    expect(feed?.title).toBe('Example Feed');
    expect(feed?.siteUrl).toBe('https://example.com/');
    expect(feed?.items).toHaveLength(1);
    expect(feed?.items[0]).toMatchObject({
      guid: 'post-1',
      title: 'First Post',
      link: 'https://example.com/first',
      summary: 'Hello',
    });
  });

  it('parses Atom feeds with entries', () => {
    const feed = parseFeedXml(
      `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom Feed</title>
        <link href="https://example.com/" />
        <entry>
          <title>Atom Post</title>
          <id>tag:example.com,2026:1</id>
          <link href="https://example.com/atom-post" />
          <updated>2026-06-06T12:00:00Z</updated>
          <summary>Atom summary</summary>
        </entry>
      </feed>`,
      'https://example.com/atom.xml'
    );

    expect(feed?.title).toBe('Atom Feed');
    expect(feed?.items[0]).toMatchObject({
      guid: 'tag:example.com,2026:1',
      title: 'Atom Post',
      link: 'https://example.com/atom-post',
      summary: 'Atom summary',
    });
  });

  it('parses OPML outlines and preserves folder names', () => {
    const outlines = parseOpmlXml(
      `<?xml version="1.0"?>
      <opml version="2.0">
        <body>
          <outline text="Tech">
            <outline text="Example" title="Example Feed" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" />
            <outline text="Duplicate" xmlUrl="https://example.com/feed.xml" />
          </outline>
          <outline text="News" xmlUrl="https://news.example.com/rss" />
        </body>
      </opml>`
    );

    expect(outlines).toEqual([
      {
        title: 'Example Feed',
        feedUrl: 'https://example.com/feed.xml',
        siteUrl: 'https://example.com',
        folder: 'Tech',
      },
      {
        title: 'News',
        feedUrl: 'https://news.example.com/rss',
        siteUrl: null,
        folder: null,
      },
    ]);
  });
});
