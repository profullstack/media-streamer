#!/usr/bin/env tsx
/**
 * Re-detect Content Types Script
 *
 * Re-detects and updates content_type for ALL torrents using the latest detection patterns.
 * Run with: pnpm tsx scripts/redetect-content-types.ts
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

async function redetectContentTypes(): Promise<void> {
  console.log('Re-detecting content types for ALL torrents...\n');

  // Get all torrents
  const { data: torrents, error } = await supabase
    .from('torrents')
    .select('id, name, content_type')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching torrents:', error.message);
    process.exit(1);
  }

  if (!torrents || torrents.length === 0) {
    console.log('No torrents found in database.');
    return;
  }

  console.log(`Found ${torrents.length} torrents.\n`);

  // Count by detected type
  const counts: Record<string, number> = {
    movie: 0,
    tvshow: 0,
    music: 0,
    book: 0,
    other: 0,
  };

  // Track changes
  const changes: Array<{ id: string; name: string; oldType: string | null; newType: string }> = [];

  // Process each torrent
  for (const torrent of torrents as TorrentRow[]) {
    const detectedType = detectContentType(torrent.name);
    counts[detectedType]++;
    
    if (torrent.content_type !== detectedType) {
      changes.push({
        id: torrent.id,
        name: torrent.name,
        oldType: torrent.content_type,
        newType: detectedType,
      });
    }
  }

  // Show detection summary
  console.log('Detection summary:');
  console.log('==================');
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');

  // Show changes
  if (changes.length === 0) {
    console.log('No changes needed - all content types are already correct.');
    return;
  }

  console.log(`Found ${changes.length} torrents that need updating:\n`);
  for (const change of changes) {
    console.log(`  [${change.oldType ?? 'null'} → ${change.newType}] ${change.name.substring(0, 60)}${change.name.length > 60 ? '...' : ''}`);
  }
  console.log('');

  // Update database
  console.log('Updating database...');
  let successCount = 0;
  let errorCount = 0;

  for (const change of changes) {
    const { error: updateError } = await supabase
      .from('torrents')
      .update({ content_type: change.newType })
      .eq('id', change.id);

    if (updateError) {
      console.error(`Error updating ${change.id}: ${updateError.message}`);
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
  console.log('Final content type distribution:');
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }
}

// Run the re-detection
redetectContentTypes().catch((err: Error) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
