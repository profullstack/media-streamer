import { describe, expect, it } from 'vitest';

import { parseInfohash } from './magnet';

const HEX = 'dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c';
// The same 160-bit hash, RFC 4648 base32 — the other legal v1 magnet encoding.
const BASE32 = '3WBFL3G4PSSV7MF37AJSHWDQMLNR63I4';

describe('parseInfohash', () => {
  it('reads a hex infohash and normalizes it to lowercase', () => {
    expect(parseInfohash(`magnet:?xt=urn:btih:${HEX}&dn=Big+Buck+Bunny`)).toBe(HEX);
    expect(parseInfohash(`magnet:?xt=urn:btih:${HEX.toUpperCase()}`)).toBe(HEX);
  });

  it('decodes a base32 infohash to the same hex', () => {
    // torlink keys /status by hex, so a base32 magnet must still be matchable
    // or every send using one would look like a silent drop.
    expect(parseInfohash(`magnet:?xt=urn:btih:${BASE32}&dn=Example`)).toBe(HEX);
    expect(parseInfohash(`magnet:?xt=urn:btih:${BASE32.toLowerCase()}`)).toBe(HEX);
  });

  it('finds the hash regardless of parameter order', () => {
    expect(parseInfohash(`magnet:?dn=Example&xt=urn:btih:${HEX}&tr=udp%3A%2F%2Ft`)).toBe(HEX);
  });

  it('returns null when there is no usable v1 infohash', () => {
    expect(parseInfohash('magnet:?dn=NoHashHere')).toBeNull();
    expect(parseInfohash('not a magnet at all')).toBeNull();
    // Wrong length: neither 40-hex nor 32-base32.
    expect(parseInfohash('magnet:?xt=urn:btih:abc123')).toBeNull();
    // v2-only magnets carry btmh, which we cannot match against torlink.
    expect(parseInfohash('magnet:?xt=urn:btmh:1220caf1e1')).toBeNull();
  });
});
