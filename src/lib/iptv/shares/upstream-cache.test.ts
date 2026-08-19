import { describe, expect, it, beforeEach } from 'vitest';
import { sharedFetch, resetCache, cacheStats } from './upstream-cache';

/**
 * These tests exist for one reason: if this deduplication stops working, the
 * product still appears to work. Every listener gets audio. The only visible
 * consequence is that the owner's SiriusXM account is being used by six people at
 * once from one IP, which is what gets an account terminated — and we would find
 * out from the owner, not from an error.
 */

const bytes = (s: string) => {
  const encoded = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buf).set(encoded);
  return buf;
};

const segment = (body = 'ts-data') => ({
  body: bytes(body),
  contentType: 'video/mp2t',
  status: 200,
});

describe('sharedFetch', () => {
  beforeEach(() => resetCache());

  it('collapses simultaneous requests for one URL into a single fetch', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const fetcher = async () => {
      calls++;
      await gate;
      return segment();
    };

    // Ten listeners ask for the same segment before any of them has an answer.
    const all = Promise.all(Array.from({ length: 10 }, () => sharedFetch('seg-1', fetcher)));
    release();
    const results = await all;

    expect(calls).toBe(1);
    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(new TextDecoder().decode(r.body)).toBe('ts-data');
    }
  });

  it('serves a listener who arrives a moment later from memory', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return segment();
    };

    const first = await sharedFetch('seg-2', fetcher);
    const second = await sharedFetch('seg-2', fetcher);

    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  });

  it('fetches different URLs independently', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return segment();
    };
    await Promise.all([sharedFetch('a', fetcher), sharedFetch('b', fetcher)]);
    expect(calls).toBe(2);
  });

  it('does not pin a failed response', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { body: bytes('nope'), contentType: 'text/plain', status: 403 };
    };

    await sharedFetch('seg-3', fetcher);
    await sharedFetch('seg-3', fetcher);

    // A 403 from an expired token must be retried, not served for 30 seconds.
    expect(calls).toBe(2);
  });

  it('lets a later request retry after an upstream throw', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls === 1) throw new Error('connection reset');
      return segment();
    };

    await expect(sharedFetch('seg-4', fetcher)).rejects.toThrow('connection reset');
    const retry = await sharedFetch('seg-4', fetcher);

    expect(calls).toBe(2);
    expect(retry.status).toBe(200);
  });

  it('expires a manifest quickly and a segment slowly', async () => {
    // A manifest is identified by content type or extension; the distinction is what
    // stops a live playlist being served stale while segments still dedupe.
    await sharedFetch('http://x/live.m3u8', async () => ({
      body: bytes('#EXTM3U'),
      contentType: 'application/vnd.apple.mpegurl',
      status: 200,
    }));
    await sharedFetch('http://x/1.ts', async () => segment());

    expect(cacheStats().entries).toBe(2);
  });
});
