/**
 * robots.txt Route Tests
 *
 * Behavior:
 * - Training crawlers (GPTBot, meta-externalagent, ...) are refused with Disallow: /
 *   and may only read /crawl, where they can pay for access
 * - Retrieval crawlers (OAI-SearchBot, ...) are named and allowed
 * - Private paths (/api/, /login, /settings, /dashboard/) stay disallowed for everyone
 */

import { describe, it, expect } from 'vitest';
import { GET } from './route';

/** Split robots.txt into groups, keyed by the user agent that opens each one. */
function groupsOf(text: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    const agent = lines[0]?.match(/^User-agent:\s*(.+)$/i)?.[1];
    if (agent) groups.set(agent, lines.slice(1));
  }
  return groups;
}

async function fetchRobots(): Promise<{ status: number; type: string | null; text: string }> {
  const res = GET();
  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
}

describe('robots.txt route', () => {
  it('serves plain text', async () => {
    const { status, type } = await fetchRobots();
    expect(status).toBe(200);
    expect(type).toContain('text/plain');
  });

  it('refuses GPTBot everywhere but the sales page', async () => {
    const { text } = await fetchRobots();
    const rules = groupsOf(text).get('GPTBot');
    expect(rules).toBeDefined();
    expect(rules).toContain('Disallow: /');
    expect(rules).toContain('Allow: /crawl');
  });

  it('refuses meta-externalagent everywhere but the sales page', async () => {
    const { text } = await fetchRobots();
    const rules = groupsOf(text).get('meta-externalagent');
    expect(rules).toBeDefined();
    expect(rules).toContain('Disallow: /');
    expect(rules).toContain('Allow: /crawl');
  });

  it('names OAI-SearchBot as welcome', async () => {
    const { text } = await fetchRobots();
    const rules = groupsOf(text).get('OAI-SearchBot');
    expect(rules).toBeDefined();
    expect(rules).toContain('Allow: /');
    expect(rules).not.toContain('Disallow: /');
  });

  it('keeps private paths disallowed for everyone', async () => {
    const { text } = await fetchRobots();
    const groups = groupsOf(text);
    for (const agent of ['*', 'OAI-SearchBot']) {
      const rules = groups.get(agent);
      expect(rules).toContain('Disallow: /api/');
      expect(rules).toContain('Disallow: /login');
      expect(rules).toContain('Disallow: /settings');
      expect(rules).toContain('Disallow: /dashboard/');
    }
  });

  it('points at the sitemap', async () => {
    const { text } = await fetchRobots();
    expect(text).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);
  });
});
