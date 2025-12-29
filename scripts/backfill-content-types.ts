#!/usr/bin/env tsx
/**
 * Backfill Content Types Script
 *
 * Detects and updates content_type for all torrents that don't have one set.
 * Run with: pnpm tsx scripts/backfill-content-types.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { detectContentType } from '../src/lib/metadata-enrichment/metadata-enrichment.js';

// Load environment variables from .env file
config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TorrentRow {
  id: string;
  name: string;
  content_type: string | null;
}

async function backfillContentTypes(): Promise<void> {
  console.log('Backfilling content types for torrents...\n');

  // Get all torrents without content_type
  const { data: torrents, error } = await supabase
    .from('torrents')
    .select('id, name, content_type')
    .is('content_type', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching torrents:', error.message);
    process.exit(1);
  }

  if (!torrents || torrents.length === 0) {
    console.log('All torrents already have content_type set.');
    return;
  }

  console.log(`Found ${torrents.length} torrents without content_type.\n`);

  // Count by detected type
  const counts: Record<string, number> = {
    movie: 0,
    tvshow: 0,
    music: 0,
    book: 0,
    other: 0,
  };

  // Process each torrent
  const updates: Array<{ id: string; name: string; detectedType: string }> = [];

  for (const torrent of torrents as TorrentRow[]) {
    const detectedType = detectContentType(torrent.name);
    counts[detectedType]++;
    updates.push({
      id: torrent.id,
      name: torrent.name,
      detectedType,
    });
  }

  // Show preview
  console.log('Detection preview:');
  console.log('==================');
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');

  // Show some examples
  console.log('Examples by type:');
  console.log('=================');
  for (const type of ['movie', 'tvshow', 'music', 'book', 'other']) {
    const examples = updates.filter((u) => u.detectedType === type).slice(0, 3);
    if (examples.length > 0) {
      console.log(`\n${type.toUpperCase()}:`);
      for (const ex of examples) {
        console.log(`  - ${ex.name.substring(0, 70)}${ex.name.length > 70 ? '...' : ''}`);
      }
    }
  }
  console.log('');

  // Update database
  console.log('Updating database...');
  let successCount = 0;
  let errorCount = 0;

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('torrents')
      .update({ content_type: update.detectedType })
      .eq('id', update.id);

    if (updateError) {
      console.error(`Error updating ${update.id}: ${updateError.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Successfully updated: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log('');
  console.log('Content type distribution:');
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }
}

// Run the backfill
backfillContentTypes().catch((err: Error) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
