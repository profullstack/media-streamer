#!/usr/bin/env npx tsx
/**
 * DHT-IMDB Matching Script v2
 * Uses cleanTorrentName for proper title parsing.
 * Matches against imdb_title_basics via Supabase RPC.
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
import { extractSearchQuery } from '../src/lib/metadata-enrichment/metadata-enrichment';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BATCH_SIZE = 5000;
const MAX_BATCHES = 100;

async function main() {
  let totalMatched = 0;
  let totalProcessed = 0;
  let offset = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    // Get unmatched torrents — use RPC to avoid bytea issues
    const { data: torrents, error } = await (supabase as any).rpc('get_unmatched_dht_torrents', {
      batch_limit: BATCH_SIZE,
      batch_offset: offset,
    });

    if (error) {
      console.error('Error fetching torrents:', error.message);
      break;
    }

    if (!torrents?.length) {
      console.log(`[Batch ${batch}] No more unmatched torrents.`);
      break;
    }

    // Parse titles
    const toMatch: { hex_hash: string; title: string; year: number }[] = [];
    for (const t of torrents as { hex_hash: string; name: string }[]) {
      const { query, year } = extractSearchQuery(t.name, 'movie');
      if (query && year && query.length > 2) {
        toMatch.push({ hex_hash: t.hex_hash, title: query.toLowerCase().trim(), year });
      }
    }

    // Lookup each against IMDB (batch via RPC)
    let batchMatched = 0;
    
    // Process in chunks of 100
    for (let i = 0; i < toMatch.length; i += 100) {
      const chunk = toMatch.slice(i, i + 100);
      const titles = chunk.map(c => c.title);
      const years = chunk.map(c => c.year);

      const { data: matches } = await (supabase as any).rpc('match_titles_to_imdb', {
        titles_arr: titles,
        years_arr: years,
      });

      if (matches?.length) {
        for (const m of matches as { idx: number; tconst: string }[]) {
          const item = chunk[m.idx];
          if (!item) continue;

          const { error: insertErr } = await (supabase as any)
            .from('dht_imdb_matches')
            .upsert({
              info_hash: `\\x${item.hex_hash}`,
              tconst: m.tconst,
              match_method: 'clean_title_v2',
            }, { onConflict: 'info_hash' });

          if (!insertErr) batchMatched++;
        }
      }
    }

    totalMatched += batchMatched;
    totalProcessed += torrents.length;
    offset += BATCH_SIZE;
    console.log(`[Batch ${batch}] Processed ${torrents.length}, matched ${batchMatched} (${totalMatched} total)`);
  }

  console.log(`\nDone. Processed ${totalProcessed}, matched ${totalMatched} new torrents.`);
}

main().catch(console.error);
