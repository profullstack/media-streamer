/**
 * The stream route serves files from the user's own HLS directory and nothing
 * else. The gate is the filename shape, so these tests pin the shape and the
 * auth check rather than the file contents.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

const tempRoot = join(process.cwd(), '.tmp-spotify-stream-test');
vi.mock('@/lib/config/temp-dir', () => ({ getTempDir: () => tempRoot }));

function call(file: string): Promise<Response> {
  return import('./route').then(({ GET }) =>
    GET(new Request(`http://localhost/api/spotify/stream/${file}`), {
      params: Promise.resolve({ file }),
    })
  );
}

describe('GET /api/spotify/stream/[file]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', email: 'u@example.com' });
    const hls = join(tempRoot, 'spotify', 'user-1', 'hls');
    mkdirSync(hls, { recursive: true });
    writeFileSync(join(hls, 'index.m3u8'), '#EXTM3U\n#EXTINF:2.0,\nseg_00001.ts\n');
    writeFileSync(join(hls, 'seg_00001.ts'), Buffer.from([0x47, 0x00, 0x11]));
    mkdirSync(join(tempRoot, 'spotify', 'user-1', 'cache'), { recursive: true });
    writeFileSync(join(tempRoot, 'spotify', 'user-1', 'cache', 'credentials.json'), '{"secret":1}');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('requires a session', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await call('index.m3u8');
    expect(res.status).toBe(401);
  });

  it('serves the playlist uncached with the HLS content type', async () => {
    const res = await call('index.m3u8');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('seg_00001.ts');
  });

  it('serves a segment as MPEG-TS', async () => {
    const res = await call('seg_00001.ts');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp2t');
    expect((await res.arrayBuffer()).byteLength).toBe(3);
  });

  it('404s before anything is playing', async () => {
    const res = await call('seg_00009.ts');
    expect(res.status).toBe(404);
  });

  it('never serves a name outside the two ffmpeg shapes', async () => {
    for (const bad of ['..%2Fcache%2Fcredentials.json', 'credentials.json', 'index.m3u8.tmp']) {
      const res = await call(decodeURIComponent(bad));
      expect(res.status).toBe(404);
    }
  });

  it('serves only the current user directory', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-2', email: 'v@example.com' });
    const res = await call('index.m3u8');
    expect(res.status).toBe(404);
  });
});
