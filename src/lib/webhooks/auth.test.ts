// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getApiUser = vi.fn();
const getCurrentUser = vi.fn();
vi.mock('@/lib/api-tokens', () => ({ getApiUser: (r: Request) => getApiUser(r) }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: () => getCurrentUser() }));

import { resolveWebhookOwner } from './auth';

const url = 'https://bittorrented.com/api/v1/webhooks';

beforeEach(() => {
  getApiUser.mockReset();
  getCurrentUser.mockReset();
});

describe('resolveWebhookOwner', () => {
  it('uses the API token when a Bearer header is sent, and never falls back to the cookie', async () => {
    getApiUser.mockResolvedValue({ id: 'u-token', email: null });
    getCurrentUser.mockResolvedValue({ id: 'u-cookie', email: 'a@b' });
    expect(await resolveWebhookOwner(new Request(url, { headers: { authorization: 'Bearer btr_x' } }))).toBe('u-token');
    getApiUser.mockResolvedValue(null);
    expect(await resolveWebhookOwner(new Request(url, { headers: { authorization: 'Bearer nope' } }))).toBeNull();
  });

  it('answers null with neither a token nor a session', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await resolveWebhookOwner(new Request(url))).toBeNull();
  });

  it('lets a session read, and write only from this site', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b' });
    expect(await resolveWebhookOwner(new Request(url))).toBe('u1');
    const own = new Request(url, { method: 'POST', headers: { origin: 'https://bittorrented.com', host: 'bittorrented.com' } });
    expect(await resolveWebhookOwner(own)).toBe('u1');
    const evil = new Request(url, { method: 'POST', headers: { origin: 'https://evil.example', host: 'bittorrented.com' } });
    expect(await resolveWebhookOwner(evil)).toBeNull();
    const crossNoOrigin = new Request(url, { method: 'DELETE', headers: { 'sec-fetch-site': 'cross-site' } });
    expect(await resolveWebhookOwner(crossNoOrigin)).toBeNull();
  });
});
