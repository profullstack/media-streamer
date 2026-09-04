/**
 * Drives the real librespot binary through the manager. Skipped unless
 * LIBRESPOT_PATH points at one, so CI never needs it; run it locally after
 * bumping the pinned commit, because the argument set is only ever validated
 * by the binary itself (an unknown flag is a silent exit, not a type error).
 *
 *   LIBRESPOT_PATH=/path/to/librespot pnpm exec vitest run src/lib/spotify/librespot.integration
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const binary = process.env.LIBRESPOT_PATH;
const tempRoot = mkdtempSync(join(tmpdir(), 'spotify-integration-'));

vi.mock('@/lib/config/temp-dir', () => ({ getTempDir: () => tempRoot }));

describe.skipIf(!binary || !existsSync(binary))('librespot pairing (real binary)', () => {
  let manager: import('./librespot').SpotifyPlayerManager;

  beforeAll(async () => {
    const { SpotifyPlayerManager } = await import('./librespot');
    manager = new SpotifyPlayerManager();
  });

  afterAll(() => {
    manager?.stopAll();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('accepts our argument set and prints a pairing code', async () => {
    const status = await manager.startPairing('integration-user', { deviceName: 'BitTorrented Test' });
    expect(status.error).toBeNull();
    expect(status.state).toBe('pairing');
    expect(status.pairing?.code).toMatch(/^[A-Z0-9-]{4,}$/);
    expect(status.pairing?.url).toContain('spotify.com/pair');
    expect(existsSync(join(tempRoot, 'spotify', 'integration-user', 'onevent.cjs'))).toBe(true);
  }, 20_000);

  it('reports stopped after stop()', () => {
    manager.stop('integration-user', { purge: true });
    expect(manager.getStatus('integration-user').state).toBe('stopped');
    expect(existsSync(join(tempRoot, 'spotify', 'integration-user'))).toBe(false);
  });
});
