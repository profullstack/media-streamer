import { describe, it, expect, vi } from 'vitest';

import type { SeedboxHttpConfig } from './config';
import { buildAuthHeaders, sendMagnetViaHttp } from './http-transport';

const MAGNET = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Example';

function httpConfig(overrides: Partial<SeedboxHttpConfig> = {}): SeedboxHttpConfig {
  return {
    baseUrl: 'https://box.example.com',
    token: 'secret-token',
    addPath: '/api/torrents/add',
    auth: { kind: 'bearer' },
    magnetField: 'magnet',
    ...overrides,
  };
}

describe('buildAuthHeaders', () => {
  it('builds a bearer header by default', () => {
    expect(buildAuthHeaders(httpConfig())).toEqual({ Authorization: 'Bearer secret-token' });
  });
  it('builds a custom header when configured', () => {
    expect(buildAuthHeaders(httpConfig({ auth: { kind: 'header', header: 'X-Api-Key' } }))).toEqual({
      'X-Api-Key': 'secret-token',
    });
  });
});

describe('sendMagnetViaHttp', () => {
  it('POSTs the magnet to the configured URL with auth + body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await sendMagnetViaHttp(httpConfig(), MAGNET, 'Example', fetchMock as unknown as typeof fetch);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://box.example.com/api/torrents/add');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init.body as string)).toEqual({ magnet: MAGNET, name: 'Example' });
  });

  it('respects a custom magnet field name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await sendMagnetViaHttp(httpConfig({ magnetField: 'url' }), MAGNET, '', fetchMock as unknown as typeof fetch);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ url: MAGNET });
  });

  it('reports a failing status with the response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad token', { status: 401 }));
    const result = await sendMagnetViaHttp(httpConfig(), MAGNET, 'x', fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('401');
    expect(result.message).toContain('bad token');
  });

  it('reports network failures without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sendMagnetViaHttp(httpConfig(), MAGNET, 'x', fetchMock as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Could not reach seedbox');
  });
});
