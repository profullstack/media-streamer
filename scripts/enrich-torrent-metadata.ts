#!/usr/bin/env npx tsx

/**
 * Torrent Metadata Enrichment Script
 *
 * Fetches metadata (posters, covers, descriptions) for existing torrents
 * that don't have metadata yet.
 *
 * Usage:
 *   pnpm tsx scripts/enrich-torrent-metadata.ts
 *
 * Options:
 *   --dry-run       Show what would be updated without making changes
 *   --force         Re-fetch metadata even for torrents that already have it
 *   --limit=N       Process only N torrents (default: all)
 *   --type=TYPE     Only process torrents of specific type (movie, tvshow, music, book)
 *   --all-status    Process torrents regardless of status (default: only 'ready' torrents)
 *
 * Required environment variables:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for authentication
 *   - OMDB_API_KEY: (optional) OMDb API key for movie metadata
 *   - THETVDB_API_KEY: (optional) TheTVDB API key for TV show metadata
 *
 * Note: MusicBrainz and Open Library don't require API keys.
 */

import { config } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables from .env file
config();
import type { Database } from '../src/lib/supabase/types';
import {
  enrichTorrentMetadata,
  detectContentType,
  type ContentType,
  type EnrichmentResult,
} from '../src/lib/metadata-enrichment/metadata-enrichment';

// ============================================================================
// Types
// ============================================================================

interface Torrent {
  id: string;
  name: string;
  content_type: ContentType | null;
  poster_url: string | null;
  cover_url: string | null;
  metadata_fetched_at: string | null;
}

interface ScriptOptions {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  type: ContentType | null;
  allStatus: boolean;
}

interface Stats {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

// ============================================================================
// Configuration
// ============================================================================

const MUSICBRAINZ_USER_AGENT = 'BitTorrented/1.0.0 (https://bittorrented.com)';

// Rate limiting delays (in ms) to respect API limits
const RATE_LIMITS: Record<string, number> = {
  omdb: 100, // OMDb: 1000 requests/day for free tier
  thetvdb: 100, // TheTVDB: varies by plan
  musicbrainz: 1100, // MusicBrainz: 1 request/second
  openlibrary: 100, // Open Library: no strict limit but be nice
};

// ============================================================================
// Helpers
// ============================================================================

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: false,
    force: false,
    limit: null,
    type: null,
    allStatus: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--all-status') {
      options.allStatus = true;
    } else if (arg.startsWith('--limit=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!isNaN(value) && value > 0) {
        options.limit = value;
      }
    } else if (arg.startsWith('--type=')) {
      const value = arg.split('=')[1] as ContentType;
      if (['movie', 'tvshow', 'music', 'book'].includes(value)) {
        options.type = value;
      }
    }
  }

  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getRateLimitDelay(contentType: ContentType): number {
  switch (contentType) {
    case 'movie':
      return RATE_LIMITS.omdb;
    case 'tvshow':
      return RATE_LIMITS.thetvdb;
    case 'music':
      return RATE_LIMITS.musicbrainz;
    case 'book':
      return RATE_LIMITS.openlibrary;
    default:
      return 100;
  }
}

// ============================================================================
// Main Logic
// ============================================================================

async function fetchTorrentsToEnrich(
  supabase: SupabaseClient<Database>,
  options: ScriptOptions
): Promise<Torrent[]> {
  let query = supabase
    .from('torrents')
    .select('id, name, content_type, poster_url, cover_url, metadata_fetched_at');

  // Filter by status unless --all-status is used
  if (!options.allStatus) {
    query = query.eq('status', 'ready');
  }

  // Filter by type if specified
  if (options.type) {
    query = query.eq('content_type', options.type);
  }

  // Only fetch torrents without metadata unless --force is used
  if (!options.force) {
    query = query.is('metadata_fetched_at', null);
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

async function updateTorrentMetadata(
  supabase: SupabaseClient<Database>,
  torrentId: string,
  result: EnrichmentResult,
  dryRun: boolean
): Promise<boolean> {
  const updateData: Record<string, unknown> = {
    content_type: result.contentType,
    metadata_fetched_at: new Date().toISOString(),
  };

  if (result.posterUrl) {
    updateData.poster_url = result.posterUrl;
  }
  if (result.coverUrl) {
    updateData.cover_url = result.coverUrl;
  }
  if (result.externalId) {
    updateData.external_id = result.externalId;
  }
  if (result.externalSource) {
    updateData.external_source = result.externalSource;
  }
  if (result.year) {
    updateData.year = result.year;
  }
  if (result.description) {
    updateData.description = result.description;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would update with:`, updateData);
    return true;
  }

  const { error } = await supabase
    .from('torrents')
    .update(updateData)
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
  console.log(`\n📦 Processing: ${torrent.name}`);

  // Detect content type if not already set
  const contentType = torrent.content_type ?? detectContentType(torrent.name);
  console.log(`  Type: ${contentType}`);

  if (contentType === 'other') {
    console.log(`  ⏭️  Skipping: Unknown content type`);
    stats.skipped++;
    return;
  }

  // Check if we have the required API keys
  const omdbApiKey = process.env.OMDB_API_KEY;
  const thetvdbApiKey = process.env.THETVDB_API_KEY;

  if (contentType === 'movie' && !omdbApiKey) {
    console.log(`  ⏭️  Skipping: OMDB_API_KEY not configured`);
    stats.skipped++;
    return;
  }

  if (contentType === 'tvshow' && !thetvdbApiKey) {
    console.log(`  ⏭️  Skipping: THETVDB_API_KEY not configured`);
    stats.skipped++;
    return;
  }

  // Fetch metadata
  try {
    const result = await enrichTorrentMetadata(torrent.name, {
      omdbApiKey,
      thetvdbApiKey,
      musicbrainzUserAgent: MUSICBRAINZ_USER_AGENT,
    });

    if (result.error) {
      console.log(`  ⚠️  API error: ${result.error}`);
      stats.errors++;
      return;
    }

    // Check if we got any useful metadata
    const hasMetadata =
      result.posterUrl || result.coverUrl || result.externalId || result.year;

    if (!hasMetadata) {
      console.log(`  ⏭️  No metadata found`);
      stats.skipped++;
      return;
    }

    console.log(`  ✓ Found metadata:`);
    if (result.title) console.log(`    Title: ${result.title}`);
    if (result.year) console.log(`    Year: ${result.year}`);
    if (result.posterUrl) console.log(`    Poster: ${result.posterUrl.substring(0, 50)}...`);
    if (result.coverUrl) console.log(`    Cover: ${result.coverUrl.substring(0, 50)}...`);
    if (result.externalSource) console.log(`    Source: ${result.externalSource}`);

    // Update the database
    const updated = await updateTorrentMetadata(
      supabase,
      torrent.id,
      result,
      options.dryRun
    );

    if (updated) {
      stats.updated++;
      console.log(`  ✅ ${options.dryRun ? 'Would update' : 'Updated'} successfully`);
    } else {
      stats.errors++;
    }
  } catch (error) {
    console.error(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stats.errors++;
  }

  // Rate limiting
  const delay = getRateLimitDelay(contentType);
  await sleep(delay);
}

async function main(): Promise<void> {
  console.log('🚀 Torrent Metadata Enrichment Script\n');

  const options = parseArgs();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (options.force) {
    console.log('⚠️  FORCE MODE - Re-fetching all metadata\n');
  }

  if (options.type) {
    console.log(`📁 Filtering by type: ${options.type}\n`);
  }

  if (options.limit) {
    console.log(`📊 Limiting to ${options.limit} torrents\n`);
  }

  if (options.allStatus) {
    console.log(`📋 Processing all torrents regardless of status\n`);
  }

  // Check for API keys
  console.log('🔑 API Keys:');
  console.log(`  OMDB_API_KEY: ${process.env.OMDB_API_KEY ? '✓ configured' : '✗ not set'}`);
  console.log(`  THETVDB_API_KEY: ${process.env.THETVDB_API_KEY ? '✓ configured' : '✗ not set'}`);
  console.log(`  MusicBrainz: ✓ no key required`);
  console.log(`  Open Library: ✓ no key required`);

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Fetch torrents to process
  console.log('\n📥 Fetching torrents...');
  const torrents = await fetchTorrentsToEnrich(supabase, options);
  console.log(`Found ${torrents.length} torrents to process`);

  if (torrents.length === 0) {
    console.log('\n✅ No torrents need metadata enrichment');
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

  for (const torrent of torrents) {
    await processTorrent(supabase, torrent, options, stats);
    stats.processed++;

    // Progress indicator
    const progress = Math.round((stats.processed / stats.total) * 100);
    console.log(`\n📊 Progress: ${stats.processed}/${stats.total} (${progress}%)`);
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
