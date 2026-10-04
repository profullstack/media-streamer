import { describe, expect, it } from 'vitest';
import { encodeInfohash, hasSeeders, parseScrape } from './scrape';

// The shape academictorrents.com/scrape.php returns (the 20-byte key shortened here).
const body = (complete: number, incomplete: number) =>
  `d5:filesd20:xxxxxxxxxxxxxxxxxxxxd8:completei${complete}e10:downloadedi31e10:incompletei${incomplete}eeee`;

describe('parseScrape', () => {
  it('reads seeders and leechers', () => {
    expect(parseScrape(body(10, 2))).toEqual({ complete: 10, incomplete: 2 });
  });

  it('is null for anything that is not a scrape', () => {
    expect(parseScrape('<html>Attention Required</html>')).toBeNull();
  });
});

describe('hasSeeders', () => {
  it('needs at least one complete peer', () => {
    expect(hasSeeders(parseScrape(body(1, 0)))).toBe(true);
    expect(hasSeeders(parseScrape(body(0, 5)))).toBe(false);
    expect(hasSeeders(null)).toBe(false);
  });
});

describe('encodeInfohash', () => {
  it('percent-encodes the raw bytes and refuses anything else', () => {
    expect(encodeInfohash('00ff'.repeat(10))).toBe('%00%ff'.repeat(10));
    expect(() => encodeInfohash('../etc')).toThrow();
  });
});
