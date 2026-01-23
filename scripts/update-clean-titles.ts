#!/usr/bin/env npx tsx

/**
 * Update Clean Titles Script
 *
 * Updates the clean_title column for all torrents in the database.
 * Uses the cleanTorrentName function to generate clean titles from raw torrent names.
 *
 * Usage:
 *   pnpm tsx scripts/update-clean-titles.ts
 *
 * Options:
 *   --dry-run       Show what would be updated without making changes
 *   --limit=N       Process only N torrents (default: all)
 *   --missing-only  Only process torrents that don't have clean_title set
 *
 * Required environment variables:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for authentication
 */

import { config } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables from .env file
config();

import type { Database } from '../src/lib/supabase/types';
import { cleanTorrentNameForDisplay } from '../src/lib/metadata-enrichment/metadata-enrichment';

// ============================================================================
// Types
// ============================================================================

interface Torrent {
  id: string;
  name: string;
  clean_title: string | null;
}

interface ScriptOptions {
  dryRun: boolean;
  limit: number | null;
  missingOnly: boolean;
}

interface Stats {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

// ============================================================================
// Helpers
// ============================================================================

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: false,
    limit: null,
    missingOnly: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--missing-only') {
      options.missingOnly = true;
    } else if (arg.startsWith('--limit=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!isNaN(value) && value > 0) {
        options.limit = value;
      }
    }
  }

  return options;
}

function getSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================================================
// Main Logic
// ============================================================================

async function fetchTorrents(
  supabase: SupabaseClient<Database>,
  options: ScriptOptions
): Promise<Torrent[]> {
  let query = supabase
    .from('bt_torrents')
    .select('id, name, clean_title');

  // Only fetch torrents without clean_title if --missing-only is used
  if (options.missingOnly) {
    query = query.is('clean_title', null);
  }

  // Apply limit if specified
  if (options.limit) {
    query = query.limit(options.limit);
  }

  // Order by created_at to process oldest first
  query = query.order('created_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch torrents: ${error.message}`);
  }

  return (data ?? []) as Torrent[];
}

async function updateTorrentCleanTitle(
  supabase: SupabaseClient<Database>,
  torrentId: string,
  cleanTitle: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) {
    return true;
  }

  const { error } = await supabase
    .from('bt_torrents')
    .update({ clean_title: cleanTitle })
    .eq('id', torrentId);

  if (error) {
    console.error(`  ❌ Failed to update: ${error.message}`);
    return false;
  }

  return true;
}

async function processTorrent(
  supabase: SupabaseClient<Database>,
  torrent: Torrent,
  options: ScriptOptions,
  stats: Stats
): Promise<void> {
  // Generate clean title
  const cleanTitle = cleanTorrentNameForDisplay(torrent.name);

  // Skip if clean title is the same as existing
  if (torrent.clean_title === cleanTitle) {
    stats.skipped++;
    return;
  }

  // Skip if clean title is empty or too short
  if (!cleanTitle || cleanTitle.length < 2) {
    console.log(`  ⏭️  Skipping "${torrent.name}" - clean title too short: "${cleanTitle}"`);
    stats.skipped++;
    return;
  }

  if (options.dryRun) {
    console.log(`  [DRY RUN] "${torrent.name}" → "${cleanTitle}"`);
  }

  // Update the database
  const updated = await updateTorrentCleanTitle(
    supabase,
    torrent.id,
    cleanTitle,
    options.dryRun
  );

  if (updated) {
    stats.updated++;
  } else {
    stats.errors++;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Update Clean Titles Script\n');

  const options = parseArgs();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (options.missingOnly) {
    console.log('📋 Processing only torrents without clean_title\n');
  }

  if (options.limit) {
    console.log(`📊 Limiting to ${options.limit} torrents\n`);
  }

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Fetch torrents to process
  console.log('📥 Fetching torrents...');
  const torrents = await fetchTorrents(supabase, options);
  console.log(`Found ${torrents.length} torrents to process\n`);

  if (torrents.length === 0) {
    console.log('✅ No torrents need clean title updates');
    return;
  }

  // Process each torrent
  const stats: Stats = {
    total: torrents.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  // Process in batches for efficiency
  const BATCH_SIZE = 100;
  const batches = Math.ceil(torrents.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, torrents.length);
    const batch = torrents.slice(start, end);

    console.log(`\n📦 Processing batch ${i + 1}/${batches} (${batch.length} torrents)...`);

    // If not dry run, use batch update for efficiency
    if (!options.dryRun) {
      const updates: { id: string; clean_title: string }[] = [];

      for (const torrent of batch) {
        const cleanTitle = cleanTorrentNameForDisplay(torrent.name);

        if (torrent.clean_title === cleanTitle) {
          stats.skipped++;
          continue;
        }

        if (!cleanTitle || cleanTitle.length < 2) {
          stats.skipped++;
          continue;
        }

        updates.push({ id: torrent.id, clean_title: cleanTitle });
      }

      // Batch update using individual updates (Supabase doesn't support bulk upsert well)
      for (const update of updates) {
        const { error } = await supabase
          .from('bt_torrents')
          .update({ clean_title: update.clean_title })
          .eq('id', update.id);

        if (error) {
          console.error(`  ❌ Failed to update ${update.id}: ${error.message}`);
          stats.errors++;
        } else {
          stats.updated++;
        }
      }

      stats.processed += batch.length;
    } else {
      // Dry run - show each update
      for (const torrent of batch) {
        await processTorrent(supabase, torrent, options, stats);
        stats.processed++;
      }
    }

    // Progress indicator
    const progress = Math.round((stats.processed / stats.total) * 100);
    console.log(`📊 Progress: ${stats.processed}/${stats.total} (${progress}%)`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 Summary:');
  console.log(`  Total processed: ${stats.processed}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log('='.repeat(50));

  if (options.dryRun) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
