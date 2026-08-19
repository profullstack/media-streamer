import { describe, expect, it } from 'vitest';

import { fetchUpstream } from './upstream';

/**
 * The behaviour that matters: a resale request carries the owner's provider
 * credentials, so it must be verified unless the provider's certificate is
 * genuinely broken -- not unverified by default, the way the rest of the codebase
 * reaches IPTV providers.
 */
describe('fetchUpstream', () => {
  it('succeeds against a host with a valid certificate', async () => {
    const res = await fetchUpstream({ url: 'https://example.com/', timeoutMs: 20000 });
    expect(res.status).toBeGreaterThan(0);
  }, 30000);

  it('still reaches a host whose certificate is expired', async () => {
    // badssl serves a deliberately expired certificate: precisely the provider
    // population the fallback exists for. A strict-only client fails here.
    const res = await fetchUpstream({ url: 'https://expired.badssl.com/', timeoutMs: 20000 });
    expect(res.status).toBe(200);
  }, 30000);

  it('still reaches a host with a self-signed certificate', async () => {
    const res = await fetchUpstream({ url: 'https://self-signed.badssl.com/', timeoutMs: 20000 });
    expect(res.status).toBe(200);
  }, 30000);

  it('propagates a non-certificate failure rather than retrying unverified', async () => {
    // A DNS failure must not be mistaken for a broken certificate and quietly
    // downgraded; the fallback has to stay scoped to certificate errors.
    await expect(
      fetchUpstream({ url: 'https://this-host-does-not-exist.invalid/', timeoutMs: 8000 })
    ).rejects.toBeDefined();
  }, 20000);
});
