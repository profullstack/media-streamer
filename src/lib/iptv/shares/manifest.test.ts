import { describe, expect, it } from 'vitest';

import { isHlsPlaylist, rewriteManifest, resolveUrl } from './manifest';

/** Stand-in for encryptSecret: opaque, and crucially not reversible by inspection. */
const seal = (url: string) => `enc(${Buffer.from(url).toString('hex')})`;

const UPSTREAM = 'http://line.example.com/live/owneruser/ownerpass/1234.m3u8';
const SELF = 'https://bittorrented.com/api/public/iptv/abc/stream?session=s1';

describe('rewriteManifest', () => {
  it('never leaves the owner credentials anywhere in the output', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXTINF:6.0,',
      'segment1.ts',
      '#EXTINF:6.0,',
      'http://line.example.com/live/owneruser/ownerpass/segment2.ts',
      '',
    ].join('\n');

    const out = rewriteManifest(manifest, UPSTREAM, SELF, seal);

    // The failure this test exists for: a manifest proxied verbatim hands the buyer
    // the provider login the session id was hiding.
    expect(out).not.toContain('owneruser');
    expect(out).not.toContain('ownerpass');
    expect(out).not.toContain('line.example.com');
  });

  it('rewrites relative and absolute segments back through our own route', () => {
    const manifest = '#EXTM3U\n#EXTINF:6.0,\nsegment1.ts\n';
    const out = rewriteManifest(manifest, UPSTREAM, SELF, seal);
    expect(out).toContain(`${SELF}&seg=`);
    // Relative refs must be resolved against the upstream before sealing, or the
    // segment cannot be fetched at all.
    expect(out).toContain(encodeURIComponent(seal('http://line.example.com/live/owneruser/ownerpass/segment1.ts')));
  });

  it('rewrites URI="..." attributes, not just bare segment lines', () => {
    const manifest = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="http://line.example.com/key.bin",IV=0x00',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:6.0,',
      'segment1.ts',
    ].join('\n');

    const out = rewriteManifest(manifest, UPSTREAM, SELF, seal);
    // Leaving the key URI alone would publish the decryption-key endpoint on the
    // owner's line even though every segment was sealed.
    expect(out).not.toContain('http://line.example.com/key.bin');
    expect(out).toContain('#EXT-X-KEY:METHOD=AES-128,URI="https://bittorrented.com');
    expect(out).toContain('#EXT-X-MAP:URI="https://bittorrented.com');
    expect(out).toContain('IV=0x00');
  });

  it('preserves comments and directives that carry no URL', () => {
    const manifest = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n';
    expect(rewriteManifest(manifest, UPSTREAM, SELF, seal)).toContain('#EXT-X-TARGETDURATION:6');
  });

  it('leaves non-http references alone rather than sealing a non-URL', () => {
    const manifest = '#EXTM3U\n#EXT-X-KEY:METHOD=NONE\ndata:text/plain,nope\n';
    const out = rewriteManifest(manifest, UPSTREAM, SELF, seal);
    expect(out).toContain('data:text/plain,nope');
  });

  it('returns the manifest untouched when the base URL is unparseable', () => {
    const manifest = '#EXTM3U\nsegment1.ts\n';
    expect(rewriteManifest(manifest, 'not a url', SELF, seal)).toBe(manifest);
  });
});

describe('isHlsPlaylist', () => {
  it('detects playlist content types including parameters', () => {
    expect(isHlsPlaylist('application/vnd.apple.mpegurl')).toBe(true);
    expect(isHlsPlaylist('application/x-mpegURL; charset=utf-8')).toBe(true);
    expect(isHlsPlaylist('video/mp2t')).toBe(false);
    expect(isHlsPlaylist(null)).toBe(false);
  });
});

describe('resolveUrl', () => {
  it('resolves against the upstream directory', () => {
    expect(resolveUrl('seg.ts', new URL(UPSTREAM))).toBe(
      'http://line.example.com/live/owneruser/ownerpass/seg.ts'
    );
  });
});
