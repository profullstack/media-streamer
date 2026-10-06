import { describe, expect, it } from 'vitest';
import { meter } from './throttle';

/** A signed-out browser: no session cookie, one address. */
const from = (ip: string, path: string, init: RequestInit = {}) =>
  new Request(`https://bittorrented.com${path}`, {
    ...init,
    headers: { 'x-forwarded-for': ip, 'x-real-ip': ip, 'user-agent': 'Mozilla/5.0 Firefox/140.0' },
  });

describe('the site-wide allowance, signed out', () => {
  it('never meters the way back in', async () => {
    // A logout plus a few reloads: Next prefetches each of these on every page view.
    const paths = ['/invite-only', '/login', '/signup', '/forgot-password', '/reset-password', '/manifest.json'];
    for (let i = 0; i < 40; i++) {
      for (const path of paths) expect(await meter(from('198.51.100.7', path))).toBeNull();
    }
  });

  it('keeps "who am I" out of the sign-in bucket, so page views cannot spend the login', async () => {
    const ip = '198.51.100.8';
    for (let i = 0; i < 30; i++) expect(await meter(from(ip, '/api/auth/me'))).toBeNull();
    expect(await meter(from(ip, '/api/auth/login', { method: 'POST' }))).toBeNull();
  });

  it('still holds sign-in attempts to ten a minute', async () => {
    const ip = '198.51.100.9';
    for (let i = 0; i < 10; i++) expect(await meter(from(ip, '/api/auth/login', { method: 'POST' }))).toBeNull();
    const refused = await meter(from(ip, '/api/auth/login', { method: 'POST' }));
    expect(refused?.status).toBeGreaterThanOrEqual(402);
  });

  it('still meters everything else at a hundred a minute', async () => {
    const ip = '198.51.100.10';
    for (let i = 0; i < 100; i++) expect(await meter(from(ip, '/pricing'))).toBeNull();
    expect((await meter(from(ip, '/pricing')))?.status).toBeGreaterThanOrEqual(402);
  });
});
