import { describe, expect, it } from 'vitest';
import { gateway } from './crawl-gateway';

/*
 * x402-gateway 0.18.3: a session cookie, an API bearer or a cast token that is
 * only the right SHAPE is a hint, never a pass. GPTBot wearing one is charged;
 * an odd browser string wearing one is not judged by it.
 */
const GPTBOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)';
const session = encodeURIComponent(JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r' }));
const page = (headers: Record<string, string>, path = '/search?q=x') =>
  new Request(`https://bittorrented.com${path}`, { headers: { 'x-real-ip': '198.51.100.40', accept: 'text/html', ...headers } });

describe('crawl gateway: shapes are hints, not passes', () => {
  it('charges GPTBot with no session', async () => {
    expect((await gateway.handle(page({ 'user-agent': GPTBOT })))?.status).toBe(402);
  });
  it('charges GPTBot with a forged session cookie', async () => {
    expect((await gateway.handle(page({ 'user-agent': GPTBOT, cookie: `sb-auth-token=${session}` })))?.status).toBe(402);
  });
  it('charges GPTBot with a bearer that only looks like an API token', async () => {
    expect((await gateway.handle(page({ 'user-agent': GPTBOT, authorization: `Bearer btr_${'0'.repeat(64)}` })))?.status).toBe(402);
  });
});
