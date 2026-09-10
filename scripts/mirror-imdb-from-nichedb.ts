#!/usr/bin/env npx tsx
/**
 * Mirror IMDb titles from nichedb.dev into imdb_title_basics / imdb_title_ratings.
 *
 * Replaces the nightly IMDb dump download (scripts/update-imdb-daily.sh) for the
 * two tables the site reads on every torrent page. It walks nichedb's `screen`
 * collection over the public API, id-ordered, with a cursor kept in
 * nichedb_mirror_cursor so a run can stop at its page cap and the next run
 * carries on. Once a walk reaches the end, later walks send `since=` and only see
 * titles nichedb updated after the previous walk began.
 *
 * Usage:
 *   pnpm mirror:imdb                  one capped run (cron)
 *   pnpm mirror:imdb -- --all         run until the walk completes (first backfill, ~3-4 h)
 *   pnpm mirror:imdb -- --max-pages=N --interval-ms=MS --dry-run --reset
 *
 * Options:
 *   --all             No page cap for this run
 *   --max-pages=N     Pages per run (default NICHEDB_MIRROR_MAX_PAGES or 480)
 *   --interval-ms=MS  Pause between pages (default NICHEDB_MIRROR_INTERVAL_MS or 7000).
 *                     nichedb allows 600 requests/hour per IP; 7 s is ~514/h, leaving
 *                     the rest for the site's own match calls from the same box.
 *   --tags=a,b        Only walk items carrying all these tags (default: none, all titles;
 *                     `imdb` walks the IMDb-sourced rows only)
 *   --reset           Forget the cursor and start a full backfill
 *   --dry-run         Fetch and map, write nothing (cursor included)
 *
 * Required environment variables:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   NICHEDB_BASE_URL (default https://nichedb.dev)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

import {
  MIRROR_CURSOR_NAME,
  runMirror,
  type MirrorCursor,
  type MirrorRows,
  type MirrorStore,
} from '../src/lib/nichedb/mirror';

interface Options {
  maxPages: number;
  intervalMs: number;
  tags: string[];
  reset: boolean;
  dryRun: boolean;
}

function parseArgs(): Options {
  const opts: Options = {
    maxPages: Number(process.env.NICHEDB_MIRROR_MAX_PAGES) || 480,
    intervalMs: Number(process.env.NICHEDB_MIRROR_INTERVAL_MS) || 7000,
    tags: (process.env.NICHEDB_MIRROR_TAGS ?? '').split(',').filter(Boolean),
    reset: false,
    dryRun: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--all') opts.maxPages = 0;
    else if (arg.startsWith('--max-pages=')) opts.maxPages = Number(arg.slice('--max-pages='.length)) || 0;
    else if (arg.startsWith('--interval-ms=')) opts.intervalMs = Number(arg.slice('--interval-ms='.length)) || 0;
    else if (arg.startsWith('--tags=')) opts.tags = arg.slice('--tags='.length).split(',').filter(Boolean);
    else if (arg === '--reset') opts.reset = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm mirror:imdb -- [--all] [--max-pages=N] [--interval-ms=MS] [--tags=a,b] [--reset] [--dry-run]');
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }
  return opts;
}

function stamp(): string {
  return new Date().toISOString();
}

/** --dry-run without Supabase credentials: walk from the start, keep nothing. */
function memoryStore(): MirrorStore {
  let cursor: MirrorCursor | null = null;
  return {
    async loadCursor() { return cursor; },
    async saveCursor(_name, c) { cursor = { ...c }; },
    async writeRows() {},
  };
}

function makeStore(dryRun: boolean): MirrorStore {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (dryRun) {
      console.log('no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: dry run with an in-memory cursor');
      return memoryStore();
    }
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  return {
    async loadCursor(name: string): Promise<MirrorCursor | null> {
      const { data, error } = await supabase
        .from('nichedb_mirror_cursor')
        .select('after_id, since')
        .eq('name', name)
        .maybeSingle();
      if (error) throw new Error(`cursor read failed: ${error.message}`);
      if (!data) return null;
      return { after_id: Number(data.after_id) || 0, since: data.since ?? null };
    },
    async saveCursor(name: string, cursor: MirrorCursor): Promise<void> {
      if (dryRun) return;
      const { error } = await supabase
        .from('nichedb_mirror_cursor')
        .upsert(
          { name, after_id: cursor.after_id, since: cursor.since, updated_at: new Date().toISOString() },
          { onConflict: 'name' },
        );
      if (error) throw new Error(`cursor write failed: ${error.message}`);
    },
    async writeRows(rows: MirrorRows): Promise<void> {
      if (dryRun) return;
      if (rows.basics.length) {
        const { error } = await supabase
          .from('imdb_title_basics')
          .upsert(rows.basics, { onConflict: 'tconst' });
        if (error) throw new Error(`imdb_title_basics upsert failed: ${error.message}`);
      }
      if (rows.basicsFill.length) {
        // Rows from TMDB/TVmaze that know a tconst: fill gaps, never overwrite IMDb's own row.
        const { error } = await supabase
          .from('imdb_title_basics')
          .upsert(rows.basicsFill, { onConflict: 'tconst', ignoreDuplicates: true });
        if (error) throw new Error(`imdb_title_basics fill failed: ${error.message}`);
      }
      if (rows.ratings.length) {
        const { error } = await supabase
          .from('imdb_title_ratings')
          .upsert(rows.ratings, { onConflict: 'tconst' });
        if (error) throw new Error(`imdb_title_ratings upsert failed: ${error.message}`);
      }
    },
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const store = makeStore(opts.dryRun);

  console.log(`[${stamp()}] nichedb -> imdb_* mirror starting (maxPages=${opts.maxPages || 'unlimited'}, interval=${opts.intervalMs}ms, tags=${opts.tags.join(',') || 'none'}${opts.dryRun ? ', DRY RUN' : ''})`);

  if (opts.reset) {
    console.log(`[${stamp()}] resetting cursor ${MIRROR_CURSOR_NAME}`);
    await store.saveCursor(MIRROR_CURSOR_NAME, { after_id: 0, since: null });
  }

  const result = await runMirror({
    store,
    maxPages: opts.maxPages,
    intervalMs: opts.intervalMs,
    tags: opts.tags.length ? opts.tags : undefined,
    log: (line) => console.log(`[${stamp()}] ${line}`),
  });

  console.log(`[${stamp()}] done: ${result.pages} pages, ${result.items} items, ${result.basics} basics upserted, ${result.basicsFill} basics filled, ${result.ratings} ratings upserted; ${result.stoppedBecause}; cursor after_id=${result.cursor.after_id} since=${result.cursor.since ?? 'none'}`);
  if (!result.completed && result.stoppedBecause !== 'page-cap') process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[${stamp()}] FAILED:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
