/**
 * Seedbox-rental authorization tests.
 *
 * The rental flow hands an anonymous, paying stranger a pipe into someone
 * else's box, so what a pass may reach is the part worth pinning down: scope
 * comes from what the owner's seedbox confirms it downloaded, never from
 * anything the renter typed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeedboxShare, SeedboxShareDownload, SeedboxShareGrant } from './types';

vi.mock('./repository', () => ({
  getShareBySlug: vi.fn(),
  getGrantById: vi.fn(),
  getDownloadById: vi.fn(),
  listDownloadsByGrant: vi.fn(),
  countDownloadsByGrant: vi.fn(),
  insertDownload: vi.fn(),
  updateDownloadMeta: vi.fn(),
}));

vi.mock('@/lib/seedbox', () => ({
  isValidMagnet: vi.fn(() => true),
  loadAccountSeedboxConfig: vi.fn(),
  sendTorrentToSeedbox: vi.fn(async () => SEND_OK),
}));

vi.mock('@/lib/seedbox/stream', () => ({
  streamSeedboxFile: vi.fn(async () => new Response('media', { status: 200 })),
}));

vi.mock('@/lib/coinpayportal/client', () => ({
  getCoinPayPortalClient: vi.fn(),
}));

import { loadAccountSeedboxConfig, sendTorrentToSeedbox } from '@/lib/seedbox';
import { streamSeedboxFile } from '@/lib/seedbox/stream';
import { generateGrantToken, hashGrantToken } from './pass';
import * as repo from './repository';
import {
  addDownload,
  isShareAcceptingDownloads,
  isShareOpen,
  listDownloadFiles,
  streamForPass,
} from './service';

const SEND_OK = { ok: true, transport: 'http' as const, message: 'added' };

const SEEDBOX_CONFIG = {
  http: {
    baseUrl: 'http://box:9160',
    token: 't',
    addPath: '/add',
    auth: { kind: 'bearer' as const },
    magnetField: 'magnet',
  },
  ssh: null,
  files: { baseUrl: 'http://box:8080', auth: { kind: 'none' as const } },
};

function share(overrides: Partial<SeedboxShare> = {}): SeedboxShare {
  return {
    id: 'share-1',
    slug: 'abc123',
    ownerAccountId: 'owner-1',
    title: 'Rent my seedbox',
    description: null,
    priceUsd: 0.25,
    passWindowMinutes: 1440,
    maxDownloadsPerPass: 2,
    maxDownloadSizeGb: null,
    status: 'active',
    expiresAt: null,
    payoutWalletAddress: null,
    payoutBlockchain: null,
    viewCount: 0,
    sessionCount: 0,
    earningsUsd: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function grant(overrides: Partial<SeedboxShareGrant> = {}): SeedboxShareGrant {
  return {
    id: 'grant-1',
    shareId: 'share-1',
    coinpayportalPaymentId: 'pay-1',
    grantTokenHash: 'hash',
    status: 'paid',
    amountUsd: 0.25,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    paidAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function download(overrides: Partial<SeedboxShareDownload> = {}): SeedboxShareDownload {
  return {
    id: 'dl-1',
    grantId: 'grant-1',
    shareId: 'share-1',
    infohash: 'a'.repeat(40),
    name: 'Some.Torrent.2026',
    nameVerified: true,
    magnet: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
    status: 'complete',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

const streamOpts = { method: 'GET' as const, range: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAccountSeedboxConfig).mockResolvedValue(SEEDBOX_CONFIG);
  vi.mocked(sendTorrentToSeedbox).mockResolvedValue(SEND_OK);
});

describe('streamForPass', () => {
  it('streams a file under a name the seedbox confirmed', async () => {
    vi.mocked(repo.listDownloadsByGrant).mockResolvedValue([download()]);

    const res = await streamForPass(
      share(),
      grant(),
      'Some.Torrent.2026/episode.mp4',
      streamOpts
    );

    expect(res.status).toBe(200);
    expect(streamSeedboxFile).toHaveBeenCalledWith(
      SEEDBOX_CONFIG.files,
      'Some.Torrent.2026/episode.mp4',
      streamOpts
    );
  });

  it('refuses a name that only ever came from the renter’s magnet', async () => {
    // The renter paid, then submitted a magnet whose `dn` names a folder that
    // already exists on the owner's box. Nothing confirmed that torrent, so the
    // name must not open the owner's own library.
    vi.mocked(repo.listDownloadsByGrant).mockResolvedValue([
      download({ name: 'Movies', nameVerified: false, status: 'added' }),
    ]);

    const res = await streamForPass(share(), grant(), 'Movies/Owners.Film.mkv', streamOpts);

    expect(res.status).toBe(403);
    expect(streamSeedboxFile).not.toHaveBeenCalled();
  });

  it('refuses a file outside every download the pass owns', async () => {
    vi.mocked(repo.listDownloadsByGrant).mockResolvedValue([download()]);

    const res = await streamForPass(share(), grant(), 'Other.Torrent/x.mp4', streamOpts);

    expect(res.status).toBe(403);
    expect(streamSeedboxFile).not.toHaveBeenCalled();
  });
});

describe('listDownloadFiles', () => {
  const token = generateGrantToken();
  const cookie = `grant-1.${token}`;

  beforeEach(() => {
    vi.mocked(repo.getShareBySlug).mockResolvedValue(share());
    vi.mocked(repo.getGrantById).mockResolvedValue(grant({ grantTokenHash: hashGrantToken(token) }));
  });

  it('lists nothing while the download name is still unconfirmed', async () => {
    vi.mocked(repo.getDownloadById).mockResolvedValue(
      download({ name: 'Movies', nameVerified: false, status: 'added' })
    );

    const result = await listDownloadFiles('abc123', cookie, 'dl-1');

    expect(result).toEqual({ ok: true, files: [] });
    // Never reached the owner's files server with a renter-chosen directory.
    expect(loadAccountSeedboxConfig).not.toHaveBeenCalled();
  });

  it('rejects a download belonging to another pass', async () => {
    vi.mocked(repo.getDownloadById).mockResolvedValue(download({ grantId: 'someone-else' }));

    const result = await listDownloadFiles('abc123', cookie, 'dl-1');

    expect(result).toEqual({ ok: false, status: 404, message: 'Download not found' });
  });
});

describe('addDownload', () => {
  const magnet = `magnet:?xt=urn:btih:${'b'.repeat(40)}&dn=My%20Torrent`;

  beforeEach(() => {
    vi.mocked(repo.countDownloadsByGrant).mockResolvedValue(0);
    vi.mocked(repo.insertDownload).mockImplementation(async (record) => download(record));
  });

  it('stores the magnet’s name as an unverified label', async () => {
    await addDownload(share(), grant(), magnet);

    expect(repo.insertDownload).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Torrent', infohash: 'b'.repeat(40) })
    );
  });

  it('strips path separators out of a hostile magnet name', async () => {
    await addDownload(share(), grant(), `magnet:?xt=urn:btih:${'b'.repeat(40)}&dn=..%2F..%2Fetc`);

    const record = vi.mocked(repo.insertDownload).mock.calls[0][0];
    expect(record.name).not.toContain('/');
    expect(record.name).not.toBe('..');
  });

  it('refuses new downloads once the owner pauses the rental', async () => {
    await expect(addDownload(share({ status: 'paused' }), grant(), magnet)).rejects.toThrow(
      /not accepting new downloads/
    );
    expect(sendTorrentToSeedbox).not.toHaveBeenCalled();
  });

  it('still accepts downloads on a pass bought before the link auto-expired', async () => {
    const lapsed = share({ expiresAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(isShareOpen(lapsed)).toBe(false); // no new passes sold
    expect(isShareAcceptingDownloads(lapsed)).toBe(true); // but a paid pass isn't voided

    await expect(addDownload(lapsed, grant(), magnet)).resolves.toBeTruthy();
  });
});
