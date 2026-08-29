import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { magnetFor, readTorrent, spanEnd } from './torrent-file';

/* A minimal bencoder, so the fixtures read as structure rather than as hex. */
const bstr = (s: string): string => `${Buffer.byteLength(s)}:${s}`;

const INFO = `d6:lengthi12e4:name${bstr('thing.txt')}12:piece lengthi16384ee`;
const TORRENT = Buffer.from(
  `d8:announce${bstr('udp://one.test:1337/announce')}13:announce-listll${bstr('udp://one.test:1337/announce')}el${bstr('wss://two.test')}ee4:info${INFO}5:extra${bstr('after')}e`,
  'utf8'
);

describe('spanEnd', () => {
  it('finds the end of each bencoded shape', () => {
    expect(spanEnd(Buffer.from('i42e'), 0)).toBe(4);
    expect(spanEnd(Buffer.from('4:spam'), 0)).toBe(6);
    expect(spanEnd(Buffer.from('l4:spami1ee'), 0)).toBe(11);
    expect(spanEnd(Buffer.from('d3:onei1ee'), 0)).toBe(10);
  });
});

describe('readTorrent', () => {
  /*
   * The assertion the infohash depends on.
   *
   * It is a SHA-1 over the ORIGINAL bytes of the info dictionary, so the span
   * has to stop exactly at its end. Take one byte too many or too few and the
   * hash is for a torrent that does not exist -- a magnet that looks perfectly
   * well-formed and finds nobody, which is the worst way for this to fail.
   */
  it('hashes the info dictionary verbatim, and nothing after it', () => {
    const expected = createHash('sha1').update(Buffer.from(INFO, 'utf8')).digest('hex');
    expect(readTorrent(TORRENT)?.infoHash).toBe(expected);
  });

  it('reads the name from inside the info dictionary', () => {
    expect(readTorrent(TORRENT)?.name).toBe('thing.txt');
  });

  /*
   * Trackers have to survive: a torrent that is not on the public DHT sits at
   * zero peers forever without them, and on a private tracker the passkey that
   * makes an announce work at all lives inside that URL.
   */
  it('collects announce and every tier of announce-list, without duplicates', () => {
    const trackers = readTorrent(TORRENT)?.trackers ?? [];
    expect(trackers).toContain('udp://one.test:1337/announce');
    expect(trackers).toContain('wss://two.test');
    // `announce` repeats the first tier of `announce-list` in most torrents.
    expect(trackers.filter((t) => t === 'udp://one.test:1337/announce')).toHaveLength(1);
  });

  /*
   * Null, not a throw: this runs on a file somebody picked in a file dialog,
   * where "that is not a torrent" is an ordinary thing to have happened and
   * deserves a sentence rather than a stack trace.
   */
  it('returns null for anything that is not a torrent', () => {
    expect(readTorrent(Buffer.from('hello world'))).toBeNull();
    expect(readTorrent(Buffer.alloc(0))).toBeNull();
    expect(readTorrent(Buffer.from('d8:announce'))).toBeNull();
  });

  it('refuses a file too large to be metadata', () => {
    expect(readTorrent(Buffer.alloc(17 * 1024 * 1024, 0x64))).toBeNull();
  });
});

describe('magnetFor', () => {
  it('carries the hash, the name and every tracker', () => {
    const magnet = magnetFor({ infoHash: 'a'.repeat(40), name: 'my thing', trackers: ['udp://a'] });
    expect(magnet).toContain(`xt=urn:btih:${'a'.repeat(40)}`);
    expect(magnet).toContain('dn=my%20thing');
    // Encoded, or the tracker's own ? and & would be read as magnet parameters.
    expect(magnet).toContain(encodeURIComponent('udp://a'));
  });
});
