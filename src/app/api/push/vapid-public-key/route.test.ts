/**
 * VAPID Public Key API Route Tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import { generateVapidKeys } from '@profullstack/notifications/server';
import { GET, dynamic } from './route';

const saved = {
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
};

function restore(name: keyof typeof saved): void {
  if (saved[name] === undefined) delete process.env[name];
  else process.env[name] = saved[name];
}

describe('GET /api/push/vapid-public-key', () => {
  afterEach(() => {
    restore('VAPID_PUBLIC_KEY');
    restore('VAPID_PRIVATE_KEY');
    restore('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  });

  it('is rendered per request, never at build time', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('returns the public key read from the environment at request time', async () => {
    const keys = generateVapidKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;

    const response = GET();
    const data = (await response.json()) as { publicKey: string };

    expect(response.status).toBe(200);
    expect(data.publicKey).toBe(keys.publicKey);
    expect(JSON.stringify(data)).not.toContain(keys.privateKey);
  });

  it('returns 503 when the keys are not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    const response = GET();
    const data = (await response.json()) as { publicKey: string | null };

    expect(response.status).toBe(503);
    expect(data.publicKey).toBeNull();
  });
});
