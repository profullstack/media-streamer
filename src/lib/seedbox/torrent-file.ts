/**
 * Reading an uploaded .torrent, without a bencode dependency.
 *
 * The Seedboxes page lets you hand torlink a torrent you already have, which
 * means the server has to answer two questions about a file a browser uploaded:
 * what is its infohash, and what should it be called. Both live in the
 * bencoded `info` dictionary.
 *
 * A parser is not needed for that. Bencode is four shapes and every one of them
 * says where it ends, so finding the span of one key's value is a scan rather
 * than a decode -- and a scan is what the infohash requires anyway. It is a
 * SHA-1 over the ORIGINAL bytes of that dictionary, so decoding and re-encoding
 * would change the hash the moment a client wrote a key in an order or a form
 * we did not reproduce, and produce a magnet for a torrent that does not exist.
 */

import { createHash } from 'node:crypto';

/** A .torrent is metadata, not payload: even a huge one stays in low megabytes. */
export const MAX_TORRENT_BYTES = 16 * 1024 * 1024;

const DICT = 0x64; // 'd'
const LIST = 0x6c; // 'l'
const INT = 0x69; // 'i'
const END = 0x65; // 'e'
const COLON = 0x3a; // ':'

/** The end offset of the bencoded value starting at `at`. */
export function spanEnd(buf: Buffer, at: number): number {
  const byte = buf[at];
  if (byte === undefined) throw new Error('truncated torrent');

  if (byte === INT) {
    const end = buf.indexOf(END, at + 1);
    if (end === -1) throw new Error('truncated torrent');
    return end + 1;
  }

  if (byte === LIST || byte === DICT) {
    let cursor = at + 1;
    while (buf[cursor] !== END) {
      if (cursor >= buf.length) throw new Error('truncated torrent');
      cursor = spanEnd(buf, cursor);
    }
    return cursor + 1;
  }

  const colon = buf.indexOf(COLON, at);
  if (colon === -1) throw new Error('truncated torrent');
  const length = Number(buf.toString('ascii', at, colon));
  if (!Number.isInteger(length) || length < 0) throw new Error('not a torrent');
  return colon + 1 + length;
}

/** Walk a bencoded dictionary, yielding each key with its value's span. */
function* entries(buf: Buffer, from = 0): Generator<{ key: string; start: number; end: number }> {
  if (buf[from] !== DICT) throw new Error('not a torrent');
  let cursor = from + 1;
  while (cursor < buf.length && buf[cursor] !== END) {
    const keyEnd = spanEnd(buf, cursor);
    const colon = buf.indexOf(COLON, cursor);
    const key = buf.toString('utf8', colon + 1, keyEnd);
    const end = spanEnd(buf, keyEnd);
    yield { key, start: keyEnd, end };
    cursor = end;
  }
}

/** A bencoded string's contents, given the span of the whole value. */
function stringAt(buf: Buffer, start: number, end: number): string {
  const colon = buf.indexOf(COLON, start);
  if (colon === -1 || colon >= end) return '';
  return buf.toString('utf8', colon + 1, end);
}

export interface TorrentSummary {
  infoHash: string;
  name: string;
  trackers: string[];
}

/**
 * The infohash, name and announce list of an uploaded .torrent, or null.
 *
 * Null rather than a throw: this runs on a file a person picked in a file
 * dialog, where "that is not a torrent" is an ordinary thing to have happened
 * and deserves a 400 with a sentence, not a stack trace.
 */
export function readTorrent(bytes: Buffer): TorrentSummary | null {
  if (bytes.length === 0 || bytes.length > MAX_TORRENT_BYTES) return null;
  try {
    let infoHash: string | null = null;
    let name = '';
    const trackers: string[] = [];

    for (const { key, start, end } of entries(bytes)) {
      if (key === 'info') {
        infoHash = createHash('sha1').update(bytes.subarray(start, end)).digest('hex');
        for (const inner of entries(bytes, start)) {
          if (inner.key === 'name') name = stringAt(bytes, inner.start, inner.end);
        }
      } else if (key === 'announce') {
        const url = stringAt(bytes, start, end);
        if (url) trackers.push(url);
      } else if (key === 'announce-list') {
        // A list of lists (tiers). Only the strings inside matter here.
        for (let cursor = start + 1; bytes[cursor] !== END && cursor < end; ) {
          const tierEnd = spanEnd(bytes, cursor);
          for (let inner = cursor + 1; bytes[inner] !== END && inner < tierEnd; ) {
            const urlEnd = spanEnd(bytes, inner);
            const url = stringAt(bytes, inner, urlEnd);
            if (url) trackers.push(url);
            inner = urlEnd;
          }
          cursor = tierEnd;
        }
      }
    }

    if (!infoHash) return null;
    return { infoHash, name: name || infoHash, trackers: [...new Set(trackers)] };
  } catch {
    return null;
  }
}

/** A magnet URI for a torrent we just read, carrying its own announce list. */
export function magnetFor({ infoHash, name, trackers }: TorrentSummary): string {
  const parts = [`magnet:?xt=urn:btih:${infoHash}`];
  if (name) parts.push(`dn=${encodeURIComponent(name)}`);
  // The torrent's own trackers have to survive into the magnet: a torrent that
  // is not on the public DHT sits at zero peers forever without them, and on a
  // private tracker the passkey that makes an announce work lives in that URL.
  for (const tracker of trackers) parts.push(`tr=${encodeURIComponent(tracker)}`);
  return parts.join('&');
}
