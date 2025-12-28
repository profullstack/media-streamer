#!/usr/bin/env tsx
/**
 * Check Torrent Metadata Script
 *
 * Verifies if torrents have cover_url/poster_url populated in the database.
 * Run with: pnpm tsx scripts/check-torrent-metadata.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

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

interface TorrentMetadata {
  id: string;
  name: string;
  content_type: string | null;
  cover_url: string | null;
  poster_url: string | null;
  year: number | null;
  metadata_fetched_at: string | null;
}

async function checkTorrentMetadata(): Promise<void> {
  console.log('Checking torrent metadata in database...\n');

  // Get all torrents with metadata fields
  const { data: torrents, error } = await supabase
    .from('torrents')
    .select('id, name, content_type, cover_url, poster_url, year, metadata_fetched_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching torrents:', error.message);
    process.exit(1);
  }

  if (!torrents || torrents.length === 0) {
    console.log('No torrents found in database.');
    return;
  }

  console.log(`Found ${torrents.length} torrents:\n`);

  // Count statistics
  let withCoverUrl = 0;
  let withPosterUrl = 0;
  let withContentType = 0;
  let withMetadataFetched = 0;

  for (const torrent of torrents as TorrentMetadata[]) {
    const hasCover = torrent.cover_url !== null;
    const hasPoster = torrent.poster_url !== null;
    const hasContentType = torrent.content_type !== null;
    const hasMetadataFetched = torrent.metadata_fetched_at !== null;

    if (hasCover) withCoverUrl++;
    if (hasPoster) withPosterUrl++;
    if (hasContentType) withContentType++;
    if (hasMetadataFetched) withMetadataFetched++;

    // Status indicators
    const coverStatus = hasCover ? '✅' : '❌';
    const posterStatus = hasPoster ? '✅' : '❌';
    const typeStatus = hasContentType ? `[${torrent.content_type}]` : '[no type]';

    console.log(`${coverStatus} cover | ${posterStatus} poster | ${typeStatus}`);
    console.log(`   Name: ${torrent.name.substring(0, 60)}${torrent.name.length > 60 ? '...' : ''}`);
    
    if (hasCover) {
      console.log(`   Cover URL: ${torrent.cover_url}`);
    }
    if (hasPoster) {
      console.log(`   Poster URL: ${torrent.poster_url}`);
    }
    if (hasMetadataFetched) {
      console.log(`   Metadata fetched: ${torrent.metadata_fetched_at}`);
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total torrents checked: ${torrents.length}`);
  console.log(`With cover_url:         ${withCoverUrl} (${((withCoverUrl / torrents.length) * 100).toFixed(1)}%)`);
  console.log(`With poster_url:        ${withPosterUrl} (${((withPosterUrl / torrents.length) * 100).toFixed(1)}%)`);
  console.log(`With content_type:      ${withContentType} (${((withContentType / torrents.length) * 100).toFixed(1)}%)`);
  console.log(`With metadata_fetched:  ${withMetadataFetched} (${((withMetadataFetched / torrents.length) * 100).toFixed(1)}%)`);
  console.log('');

  if (withCoverUrl === 0 && withPosterUrl === 0) {
    console.log('⚠️  No torrents have cover art or poster URLs populated.');
    console.log('   Run the enrichment script to fetch metadata:');
    console.log('   pnpm tsx scripts/enrich-torrent-metadata.ts');
  }
}

// Run the check
checkTorrentMetadata().catch((err: Error) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
