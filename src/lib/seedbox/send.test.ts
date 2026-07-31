import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./ssh-transport', () => ({
  sendMagnetViaSsh: vi.fn().mockResolvedValue({ ok: true, transport: 'ssh', message: 'watch dir' }),
  sendMagnetViaSshToLocalApi: vi.fn().mockResolvedValue({ ok: true, transport: 'ssh', message: 'local api' }),
  getSeedboxPublicKey: vi.fn().mockResolvedValue(null),
}));
vi.mock('./http-transport', () => ({
  sendMagnetViaHttp: vi.fn().mockResolvedValue({ ok: true, transport: 'http', message: 'http' }),
  buildAuthHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer tok' }),
}));

import type { SeedboxConfig } from './config';
import { sendMagnetViaSsh, sendMagnetViaSshToLocalApi } from './ssh-transport';
import { sendTorrentToSeedbox } from './send';

const MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Example';

const ssh = {
  host: 'box.example.com',
  port: 22,
  user: 'seed',
  privateKey: 'KEY',
  privateKeyPath: null,
  watchDir: '/home/seed/Downloads/watch',
  addCommand: null,
};

const http = {
  baseUrl: 'http://box.example.com:9161',
  token: 'tok',
  addPath: '/add',
  auth: { kind: 'bearer' as const },
  magnetField: 'magnet',
};

beforeEach(() => vi.clearAllMocks());

describe('sendTorrentToSeedbox — SSH delivery', () => {
  it('hands the magnet to torlink’s own add-API over loopback when one is configured', async () => {
    // Regression: a .magnet dropped in the watch dir is read by nobody, because
    // torlink's blackhole is a separate `torlnk watch` process the provisioner
    // never starts — and it keeps its own queue, invisible to serve's /status.
    const config = { http, ssh, files: null } as unknown as SeedboxConfig;
    const result = await sendTorrentToSeedbox(MAGNET, 'Example', 'ssh', config);

    expect(result.ok).toBe(true);
    expect(sendMagnetViaSshToLocalApi).toHaveBeenCalledTimes(1);
    expect(sendMagnetViaSsh).not.toHaveBeenCalled();
  });

  it('targets loopback on the add-API port, not the public host', async () => {
    const config = { http, ssh, files: null } as unknown as SeedboxConfig;
    await sendTorrentToSeedbox(MAGNET, 'Example', 'ssh', config);

    const [, addUrl, token, magnet] = (sendMagnetViaSshToLocalApi as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [unknown, string, string, string];
    expect(addUrl).toBe('http://127.0.0.1:9161/add');
    expect(token).toBe('tok');
    expect(magnet).toBe(MAGNET);
  });

  it('defaults to torlink’s port when the configured URL carries none', async () => {
    const config = {
      http: { ...http, baseUrl: 'http://box.example.com' },
      ssh,
      files: null,
    } as unknown as SeedboxConfig;
    await sendTorrentToSeedbox(MAGNET, 'Example', 'ssh', config);

    const [, addUrl] = (sendMagnetViaSshToLocalApi as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [unknown, string];
    expect(addUrl).toBe('http://127.0.0.1:9161/add');
  });

  it('falls back to the watch dir / add command when there is no add-API', async () => {
    const config = { http: null, ssh, files: null } as unknown as SeedboxConfig;
    const result = await sendTorrentToSeedbox(MAGNET, 'Example', 'ssh', config);

    expect(result.ok).toBe(true);
    expect(sendMagnetViaSsh).toHaveBeenCalledTimes(1);
    expect(sendMagnetViaSshToLocalApi).not.toHaveBeenCalled();
  });
});

describe('sendTorrentToSeedbox — a silent drop must not report success', () => {
  const config = { http, ssh: null, files: null } as unknown as SeedboxConfig;
  const noSleep = async (): Promise<void> => {};

  /** /status answering with the given torrent list. */
  const statusFetch = (entries: unknown[]): typeof fetch =>
    vi.fn(async () => ({ ok: true, json: async () => ({ downloads: entries, seeds: [] }) })) as
      unknown as typeof fetch;

  it('turns torlink’s fake "added" into a real error', async () => {
    // Observed in production: /add returned {"ok":true,"outcome":"added"} and
    // the torrent never appeared in /status or on disk. The user saw "Sent"
    // and lost the torrent. A send that cannot be verified is not a send.
    const result = await sendTorrentToSeedbox(MAGNET, 'Example', 'http', config, {
      fetchImpl: statusFetch([]),
      sleep: noSleep,
      attempts: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/never registered it/i);
  });

  it('reports success when torlink really did take it', async () => {
    const result = await sendTorrentToSeedbox(MAGNET, 'Example', 'http', config, {
      fetchImpl: statusFetch([{ id: '0123456789abcdef0123456789abcdef01234567' }]),
      sleep: noSleep,
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe('http');
  });

  it('fails open when /status cannot be read, rather than inventing a failure', async () => {
    const dead = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await sendTorrentToSeedbox(MAGNET, 'Example', 'http', config, {
      fetchImpl: dead,
      sleep: noSleep,
    });

    expect(result.ok).toBe(true);
  });

  it('never overrides a transport error with the verification message', async () => {
    const { sendMagnetViaHttp } = await import('./http-transport');
    (sendMagnetViaHttp as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce({ ok: false, transport: 'http', message: 'Seedbox API returned 401' });

    const result = await sendTorrentToSeedbox(MAGNET, 'Example', 'http', config, {
      fetchImpl: statusFetch([]),
      sleep: noSleep,
    });

    expect(result.message).toBe('Seedbox API returned 401');
  });
});
