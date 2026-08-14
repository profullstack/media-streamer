import { describe, expect, it } from 'vitest';
import { isValidChannelId, parseChannelIds, parseChannelList } from './channel-list';

describe('parseChannelList', () => {
  it('parses the kagi smallweb line format', () => {
    const text = [
      '',
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC_msctwlIh2cwM8yAtaju1A # Nick Sibicky https://www.youtube.com/channel/UC_msctwlIh2cwM8yAtaju1A',
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC_RILDt90_cEge-fWOsqGLQ # Aaroncake https://www.youtube.com/@aaroncake',
    ].join('\n');

    const result = parseChannelList(text);

    expect(result.entries).toEqual([
      { channelId: 'UC_msctwlIh2cwM8yAtaju1A', title: 'Nick Sibicky' },
      { channelId: 'UC_RILDt90_cEge-fWOsqGLQ', title: 'Aaroncake' },
    ]);
    expect(result.unresolved).toEqual([]);
    expect(result.duplicateCount).toBe(0);
  });

  it('strips the trailing channel url from the title but keeps inner text', () => {
    const result = parseChannelList(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC17mJJnvzAa_e9qQqLIfIeQ # Semicolon &amp; Sons https://www.youtube.com/channel/UC17mJJnvzAa_e9qQqLIfIeQ'
    );

    expect(result.entries[0].title).toBe('Semicolon & Sons');
  });

  it('keeps non-ascii titles intact', () => {
    const result = parseChannelList(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC_HZvxzC_PWvRKoFznYOfYw # ПРАВКА,СВАРКА АЛЮМИНИЯ. Евгений Иванов https://www.youtube.com/channel/UC_HZvxzC_PWvRKoFznYOfYw'
    );

    expect(result.entries[0].title).toBe('ПРАВКА,СВАРКА АЛЮМИНИЯ. Евгений Иванов');
  });

  it('accepts bare channel ids and plain channel urls', () => {
    const result = parseChannelList(
      ['UC_msctwlIh2cwM8yAtaju1A', 'https://www.youtube.com/channel/UC_RILDt90_cEge-fWOsqGLQ'].join('\n')
    );

    expect(parseChannelIds(result.entries.map((e) => e.channelId).join('\n'))).toEqual([
      'UC_msctwlIh2cwM8yAtaju1A',
      'UC_RILDt90_cEge-fWOsqGLQ',
    ]);
    expect(result.entries[0].title).toBeNull();
  });

  it('collapses duplicates while preserving first-seen order', () => {
    const result = parseChannelList(
      [
        'UC_msctwlIh2cwM8yAtaju1A',
        'https://www.youtube.com/channel/UC_msctwlIh2cwM8yAtaju1A',
        'UC_RILDt90_cEge-fWOsqGLQ',
      ].join('\n')
    );

    expect(result.entries.map((e) => e.channelId)).toEqual([
      'UC_msctwlIh2cwM8yAtaju1A',
      'UC_RILDt90_cEge-fWOsqGLQ',
    ]);
    expect(result.duplicateCount).toBe(1);
  });

  it('skips blank and comment-only lines', () => {
    const result = parseChannelList(['', '   ', '# a heading', 'UC_msctwlIh2cwM8yAtaju1A'].join('\n'));

    expect(result.entries).toHaveLength(1);
    expect(result.unresolved).toEqual([]);
  });

  it('reports handle-only urls as unresolved rather than dropping them', () => {
    const result = parseChannelList('https://www.youtube.com/@AlphaPhoenixChannel');

    expect(result.entries).toEqual([]);
    expect(result.unresolved).toEqual(['https://www.youtube.com/@AlphaPhoenixChannel']);
  });

  it('parses OPML exports', () => {
    const text = `<?xml version="1.0"?>
      <opml version="1.0"><body>
        <outline text="Nick Sibicky" title="Nick Sibicky" type="rss"
          xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UC_msctwlIh2cwM8yAtaju1A" />
        <outline text="Aaroncake" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UC_RILDt90_cEge-fWOsqGLQ" />
      </body></opml>`;

    const result = parseChannelList(text);

    expect(result.entries).toEqual([
      { channelId: 'UC_msctwlIh2cwM8yAtaju1A', title: 'Nick Sibicky' },
      { channelId: 'UC_RILDt90_cEge-fWOsqGLQ', title: 'Aaroncake' },
    ]);
  });

  it('returns an empty result for empty input', () => {
    expect(parseChannelList('')).toEqual({ entries: [], unresolved: [], duplicateCount: 0 });
    expect(parseChannelList('   \n  ')).toEqual({ entries: [], unresolved: [], duplicateCount: 0 });
  });
});

describe('isValidChannelId', () => {
  it('accepts a well formed id and rejects near misses', () => {
    expect(isValidChannelId('UC_msctwlIh2cwM8yAtaju1A')).toBe(true);
    expect(isValidChannelId(' UC_msctwlIh2cwM8yAtaju1A ')).toBe(true);
    expect(isValidChannelId('UC_tooshort')).toBe(false);
    expect(isValidChannelId('XX_msctwlIh2cwM8yAtaju1A')).toBe(false);
    expect(isValidChannelId('')).toBe(false);
  });
});
