/**
 * GET /api/player — the embed page loads @profullstack/player, not its own
 * hls.js / mpegts.js, and sends the connect token the way each source allows.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import playerPackage from '@profullstack/player/package.json';
import { GET } from './route';

const page = async (query: string): Promise<string> => {
  const res = await GET(new NextRequest(`https://bittorrented.com/api/player?${query}`));
  return res.text();
};

const MODULE = `https://cdn.jsdelivr.net/npm/@profullstack/player@${playerPackage.version}/+esm`;

describe('GET /api/player', () => {
  it('imports the pinned player package and no hand-loaded engines', async () => {
    const html = await page('type=video&src=' + encodeURIComponent('/api/stream/hls/abc/index.m3u8'));
    expect(html).toContain(`import { attachSource } from '${MODULE}'`);
    expect(html).not.toContain('hls.js@');
    expect(html).not.toContain('mpegts.js@');
    expect(html).not.toContain('xhrSetup');
  });

  it('sends the token as a bearer header for HLS', async () => {
    const html = await page('type=video&token=t0k&src=' + encodeURIComponent('/live.m3u8'));
    expect(html).toContain('token="t0k"');
    expect(html).toContain("Authorization: 'Bearer '+token");
  });

  it('keeps the token in the URL for a gated progressive audio stream', async () => {
    const html = await page('type=audio&token=t0k&src=' + encodeURIComponent('/api/stream?id=1'));
    expect(html).toContain('/api/stream?id=1&token=t0k');
  });

  it('plays radio through the player module', async () => {
    // No station param: src is used as given.
    const html = await page('type=radio&src=' + encodeURIComponent('/api/radio/hls/x.m3u8'));
    expect(html).toContain(`from '${MODULE}'`);
    expect(html).toContain("kind: 'hls'");
  });

  it('leaves the ebook reader alone', async () => {
    const html = await page('type=ebook&src=' + encodeURIComponent('/b.epub'));
    expect(html).not.toContain(MODULE);
    expect(html).toContain('epub.min.js');
  });
});
