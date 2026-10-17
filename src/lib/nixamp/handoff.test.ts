import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./accounts', () => ({
  usableAccessToken: vi.fn(async () => ({ accessToken: 'nxa_member', config: { site: 'https://nixamp.com' } })),
}));

const tables: Record<string, unknown[]> = {};
vi.mock('@/lib/supabase/client', () => ({
  getServerClient: () => ({
    from: (table: string) => {
      const rows = () => tables[table] ?? [];
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (done: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve(done({ data: rows(), error: null })),
      };
      return query;
    },
  }),
}));

import { createFileGrant, HandoffError, listHosts, startHandoff, verifyFileGrant } from './handoff';
import type { NixampAccount } from './accounts';

const account = (scopes: string[]) => ({ id: 'row', userId: 'u1', scopes, nixampSite: 'https://nixamp.com' }) as unknown as NixampAccount;

function nixamp(record: Array<{ url: string; init?: RequestInit }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    record.push({ url, init });
    if (url === 'https://nixamp.com/api/v1/servers') {
      return new Response(JSON.stringify({ servers: [{ id: 's1', name: 'server1', url: 'https://server1.chovy.nixamp.com:4321' }, { id: 's2', name: 'lan', url: 'http://192.168.1.5:4321' }] }), { status: 200 });
    }
    if (url === 'https://server1.chovy.nixamp.com:4321/api/v1/integrations/bittorrented/handoffs') {
      return new Response(JSON.stringify({ handoff: { id: 'abcdef0123456789', status: 'importing', stationId: 'st', counts: { pending: 1 } }, created: true }), { status: 201 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  delete process.env.NIXAMP_HANDOFF_SECRET;
  for (const key of Object.keys(tables)) delete tables[key];
});

describe('file grants', () => {
  it('open one file until they expire, and nothing forged', async () => {
    const claims = { userId: 'u1', torrentId: 't1', fileId: 'f1', audience: 'https://server1.chovy.nixamp.com:4321', expiresAt: Math.floor(Date.now() / 1000) + 60 };
    const grant = await createFileGrant(claims);
    expect(await verifyFileGrant(grant)).toEqual(claims);
    const [payload, signature] = grant.split('.');
    const forged = Buffer.from(JSON.stringify(['u1', 't1', 'f2', claims.audience, claims.expiresAt])).toString('base64url');
    expect(await verifyFileGrant(`${forged}.${signature}`)).toBeNull();
    expect(await verifyFileGrant(`${payload}.${signature}.x`)).toBeNull();
    expect(await verifyFileGrant(grant, (claims.expiresAt + 1) * 1000)).toBeNull();
    expect(await verifyFileGrant('not-a-grant')).toBeNull();
  });
});

describe('Broadcast with Nixamp', () => {
  it('asks a connection made before stations to reconnect', async () => {
    await expect(listHosts(account(['profile', 'parties']), nixamp([]))).rejects.toMatchObject({ code: 'reconnect_required', status: 409 });
  });

  it('lists only https servers, and never sends the token to a server that is not theirs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const hosts = await listHosts(account(['stations']), nixamp(calls));
    expect(hosts.map((one) => one.name)).toEqual(['server1']);
    await expect(
      startHandoff('u1', account(['stations']), { host: 'https://evil.example', torrentId: 't1', fileIds: ['f1'] }, nixamp(calls)),
    ).rejects.toBeInstanceOf(HandoffError);
    expect(calls.every((call) => !call.url.startsWith('https://evil.example'))).toBe(true);
  });

  it('refuses files that are not audio', async () => {
    tables['bt_torrents'] = [{ id: 't1', name: 'Some Album', infohash: 'ab'.repeat(20) }];
    tables['bt_torrent_files'] = [{ id: 'f1', name: 'readme.txt', size: 10, mime_type: 'text/plain', media_category: 'other', file_index: 0 }];
    await expect(
      startHandoff('u1', account(['stations']), { host: 'https://server1.chovy.nixamp.com:4321', torrentId: 't1', fileIds: ['f1'] }, nixamp([])),
    ).rejects.toMatchObject({ code: 'not_audio' });
  });

  it('hands audio over with one-file grants and a key that makes a retry the same handoff', async () => {
    tables['bt_torrents'] = [{ id: 't1', name: 'Some Album', infohash: 'ab'.repeat(20) }];
    tables['bt_torrent_files'] = [{ id: 'f1', name: '01 Song.flac', size: 1234, mime_type: 'audio/flac', media_category: 'audio', file_index: 3 }];
    tables['bt_audio_metadata'] = [{ file_id: 'f1', title: 'Song', artist: 'Band', album: 'LP', track_number: 1 }];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const first = await startHandoff('u1', account(['stations']), { host: 'https://server1.chovy.nixamp.com:4321/', torrentId: 't1', fileIds: ['f1'], name: 'My Station' }, nixamp(calls));
    expect(first.status).toBe(201);
    const sent = calls.find((call) => call.url.endsWith('/handoffs'))!;
    expect((sent.init!.headers as Record<string, string>).authorization).toBe('Bearer nxa_member');
    const body = JSON.parse(String(sent.init!.body));
    expect(body.version).toBe(1);
    expect(body.files[0]).toMatchObject({ fileId: 'f1', name: '01 Song.flac', size: 1234, metadata: { title: 'Song', artist: 'Band', album: 'LP', track: 1 } });
    const grant = String(body.files[0].url).split('/api/v1/nixamp/files/')[1]!;
    expect(await verifyFileGrant(grant)).toMatchObject({ fileId: 'f1', torrentId: 't1', audience: 'https://server1.chovy.nixamp.com:4321' });
    const again: Array<{ url: string; init?: RequestInit }> = [];
    await startHandoff('u1', account(['stations']), { host: 'https://server1.chovy.nixamp.com:4321', torrentId: 't1', fileIds: ['f1'] }, nixamp(again));
    const second = JSON.parse(String(again.find((call) => call.url.endsWith('/handoffs'))!.init!.body));
    expect(second.idempotencyKey).toBe(body.idempotencyKey);
  });
});
