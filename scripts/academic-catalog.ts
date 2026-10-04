/**
 * Rebuild src/data/academic/catalog.json from academictorrents.com.
 *
 *   pnpm academic:catalog            resume the licence crawl, then write the catalog
 *   pnpm academic:catalog --offline  write the catalog from the cache only
 *
 * The site asks scrapers to read its daily database.xml instead of the browse
 * page, so that is where the list comes from. The licence is only on each
 * details page (window.detailsLicense), fetched one at a time with a pause so a
 * full crawl of ~1,650 entries is a background job, not a burst. Every answer
 * is appended to a cache, so an interrupted run picks up where it stopped.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { decideLicense, type AcademicLicense } from '../src/lib/academic/license';
import type { Catalog, CatalogEntry } from '../src/lib/academic/catalog';
import { isSellable } from '../src/lib/academic/license';
import { isWebseed, readTorrent } from '../src/lib/seedbox/torrent-file';

const DATABASE = 'https://academictorrents.com/database.xml';
const CACHE = process.env.ACADEMIC_LICENSE_CACHE ?? '.academic-licenses.jsonl';
const SEED_CACHE = process.env.ACADEMIC_WEBSEED_CACHE ?? '.academic-webseeds.jsonl';
const OUT = 'src/data/academic/catalog.json';
const CATEGORIES = new Set(['Dataset', 'Course']);
const PAUSE_MS = 1500;
// database.xml is remote input; only a v1 infohash may ever reach a details URL.
const INFOHASH = /^[0-9a-f]{40}$/;
const UA = 'Mozilla/5.0 (compatible; bittorrented-dataset-mirror; +https://bittorrented.com)';

interface Item {
  title: string;
  category: string;
  infohash: string;
  size: number;
  description: string;
}

/** Descriptions are kept for sellable entries only, capped where nichedb caps a summary. */
const DESCRIPTION_MAX = 4000;

const unescape = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');

function parseDatabase(xml: string): Item[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (t: string) => it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] ?? '';
    return {
      title: unescape(tag('title')).trim(),
      category: tag('category'),
      infohash: tag('infohash').toLowerCase(),
      size: Number(tag('size')) || 0,
      description: unescape(tag('description')).replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX),
    };
  });
}

function readCache(): Map<string, AcademicLicense | null> {
  const cache = new Map<string, AcademicLicense | null>();
  if (!existsSync(CACHE)) return cache;
  for (const line of readFileSync(CACHE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { infohash: string; license: (AcademicLicense & { error?: string }) | null };
    // Network errors are not answers; leave them out so the next run retries.
    if (row.license && 'error' in row.license) continue;
    cache.set(row.infohash, row.license);
  }
  return cache;
}

async function fetchLicense(infohash: string): Promise<AcademicLicense | null> {
  if (!INFOHASH.test(infohash)) throw new Error('not a v1 infohash');
  const url = new URL(`/details/${infohash}`, 'https://academictorrents.com');
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const match = (await res.text()).match(/window\.detailsLicense = (\{.*?\});/);
  return match ? (JSON.parse(match[1]) as AcademicLicense) : null;
}

function readSeedCache(): Map<string, string[]> {
  const cache = new Map<string, string[]>();
  if (!existsSync(SEED_CACHE)) return cache;
  for (const line of readFileSync(SEED_CACHE, 'utf8').split('\n')) {
    if (line.trim()) {
      const row = JSON.parse(line) as { infohash: string; webseeds: string[] };
      cache.set(row.infohash, row.webseeds);
    }
  }
  return cache;
}

/** The .torrent's url-list. Most swarms here are near dead; these HTTP sources are what finish. */
async function fetchWebseeds(infohash: string): Promise<string[]> {
  if (!INFOHASH.test(infohash)) throw new Error('not a v1 infohash');
  const url = new URL(`/download/${infohash}.torrent`, 'https://academictorrents.com');
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readTorrent(Buffer.from(await res.arrayBuffer()))?.webseeds ?? [];
}

async function main() {
  const offline = process.argv.includes('--offline');
  const res = await fetch('https://academictorrents.com/database.xml', { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`database.xml: HTTP ${res.status}`);
  const items = parseDatabase(await res.text()).filter((i) => CATEGORIES.has(i.category) && INFOHASH.test(i.infohash));
  const cache = readCache();

  if (!offline) {
    const todo = items.filter((i) => !cache.has(i.infohash));
    console.log(`${items.length} datasets and courses; ${todo.length} licences to fetch`);
    for (const [n, item] of todo.entries()) {
      try {
        const license = await fetchLicense(item.infohash);
        cache.set(item.infohash, license);
        appendFileSync(CACHE, `${JSON.stringify({ infohash: item.infohash, license })}\n`);
      } catch (error) {
        console.warn(`  ${item.infohash}: ${(error as Error).message}`);
      }
      if ((n + 1) % 50 === 0) console.log(`  ${n + 1}/${todo.length}`);
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }

  const entries: CatalogEntry[] = items
    .filter((i) => cache.has(i.infohash))
    .map((i) => {
      const license = cache.get(i.infohash) ?? null;
      const { verdict, reason, spdx } = decideLicense(license);
      // `canonical` is what we decided on (it may come from a bare URL); `raw` is what the uploader wrote.
      const kept = license ? { raw: license.raw ?? null, canonical: spdx, label: license.label ?? null, confidence: license.confidence ?? null } : null;
      const { description, ...rest } = i;
      // 1,452 unsellable descriptions would only bloat the bundle; nothing reads them.
      return { ...rest, ...(isSellable(verdict) && description ? { description } : {}), license: kept, verdict, reason };
    });
  // Webseeds only matter for what we would mirror, so only sellable entries cost a request.
  const seeds = readSeedCache();
  if (!offline) {
    const todo = entries.filter((e) => isSellable(e.verdict) && !seeds.has(e.infohash));
    if (todo.length) console.log(`${todo.length} sellable torrents to read for webseeds`);
    for (const e of todo) {
      try {
        const webseeds = await fetchWebseeds(e.infohash);
        seeds.set(e.infohash, webseeds);
        appendFileSync(SEED_CACHE, `${JSON.stringify({ infohash: e.infohash, webseeds })}\n`);
      } catch (error) {
        console.warn(`  ${e.infohash}: ${(error as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }
  for (const e of entries) {
    // Filtered again here so a rule tightened after a crawl applies to the cache too.
    const webseeds = seeds.get(e.infohash)?.filter(isWebseed);
    if (webseeds?.length) e.webseeds = webseeds;
  }

  const catalog: Catalog = { source: DATABASE, fetchedAt: new Date().toISOString(), entries };
  writeFileSync(OUT, `${JSON.stringify(catalog, null, 1)}\n`);

  const tally = new Map<string, { n: number; bytes: number }>();
  for (const e of entries) {
    const t = tally.get(e.verdict) ?? { n: 0, bytes: 0 };
    tally.set(e.verdict, { n: t.n + 1, bytes: t.bytes + e.size });
  }
  console.log(`wrote ${OUT}: ${entries.length} of ${items.length} entries have an answer`);
  for (const [verdict, t] of tally) console.log(`  ${verdict.padEnd(14)} ${String(t.n).padStart(5)}  ${(t.bytes / 1e12).toFixed(2)} TB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
