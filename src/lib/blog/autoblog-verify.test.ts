// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { signRequest } from '@profullstack/autoblog';
import { verifyAutoblogDelivery } from './autoblog-verify';

const post = {
  id: 'post-1',
  title: 'Hello',
  slug: 'hello',
  html: '<p>hi</p>',
  status: 'published',
  published_at: '2026-10-28T00:00:00.000Z',
  tags: [],
  categories: [],
};

/** Exactly what the autoblog sender (crawlproof) puts on the wire. */
function signed(token: string, opts: { ts?: number; body?: string } = {}) {
  const body = opts.body ?? JSON.stringify({ specversion: '1.0', id: 'evt_1', type: 'post.published.v1', source: 'https://crawlproof.com', time: post.published_at, data: { post } });
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const headers = { ...signRequest({ id: 'evt_1', timestamp: ts, body, secret: token }), authorization: `Bearer ${token}` };
  return { headers: headers as Record<string, string>, body };
}

describe('autoblog receiver on @profullstack/webhooks verifyAndParse', () => {
  it('verifies a delivery signed by @profullstack/autoblog (the live cp_bt_ token shape)', () => {
    const token = 'cp_bt_' + 'x'.repeat(43);
    const { headers, body } = signed(token);
    const r = verifyAutoblogDelivery(headers, body, token);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.post.slug).toBe('hello');
  });

  it('verifies a whsec_-shaped token as its UTF-8 bytes, like the autoblog sender keys it', () => {
    const token = 'whsec_' + Buffer.from('k'.repeat(32)).toString('base64');
    const { headers, body } = signed(token);
    expect(verifyAutoblogDelivery(headers, body, token).ok).toBe(true);
  });

  it('rejects a wrong token, a tampered body and a stale timestamp with 401', () => {
    const token = 'cp_bt_right';
    const { headers, body } = signed(token);
    expect(verifyAutoblogDelivery(headers, body, 'cp_bt_wrong')).toMatchObject({ ok: false, status: 401 });
    expect(verifyAutoblogDelivery(headers, body.replace('Hello', 'Hellp'), token)).toMatchObject({ ok: false, status: 401 });
    const old = signed(token, { ts: Math.floor(Date.now() / 1000) - 3600 });
    expect(verifyAutoblogDelivery(old.headers, old.body, token)).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects a signed but malformed envelope with 400', () => {
    const token = 'cp_bt_right';
    const { headers, body } = signed(token, { body: JSON.stringify({ specversion: '1.0', id: 'e', type: 't', source: 's', data: { post: { id: 1 } } }) });
    expect(verifyAutoblogDelivery(headers, body, token)).toMatchObject({ ok: false, status: 400, reason: 'invalid event envelope' });
  });
});
