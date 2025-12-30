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
 *   --missing-only  Only process torrents that don't have metadata_fetched_at set
 *   --no-poster     Re-fetch metadata for torrents that were enriched but have no poster
 *   --limit=N       Process only N torrents (default: all)
 *   --type=TYPE     Only process torrents of specific type (movie, tvshow, music, book)
 *   --all-status    Process torrents regardless of status (default: only 'ready' torrents)
 *
 * Required environment variables:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for authentication
 *   - OMDB_API_KEY: (optional) OMDb API key for movie and TV show metadata
 *   - FANART_TV_API_KEY: (optional) Fanart.tv API key for high-quality posters and artist images
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

interface TorrentFile {
  id: string;
  torrent_id: string;
  name: string;
  extension: string | null;
  media_category: 'audio' | 'video' | 'ebook' | 'document' | 'other' | null;
  size: number;
}

// Audio file extensions
const AUDIO_EXTENSIONS = new Set([
  'flac', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'wma', 'aiff', 'ape', 'alac', 'opus'
]);

// Video file extensions
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mpg', 'mpeg'
]);

// Ebook file extensions
const EBOOK_EXTENSIONS = new Set([
  'epub', 'mobi', 'pdf', 'azw', 'azw3', 'djvu', 'fb2', 'cbr', 'cbz'
]);

interface ScriptOptions {
  dryRun: boolean;
  force: boolean;
  noPoster: boolean;
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
  omdb: 100, // OMDb: 1000 requests/day for free tier (used for movies AND TV shows)
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
    noPoster: false,
    limit: null,
    type: null,
    allStatus: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--no-poster') {
      options.noPoster = true;
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
    case 'tvshow':
      // Both movies and TV shows use OMDb
      return RATE_LIMITS.omdb;
    case 'music':
      return RATE_LIMITS.musicbrainz;
    case 'book':
      return RATE_LIMITS.openlibrary;
    default:
      return 100;
  }
}

/**
 * Detect content type from torrent files
 * This is more reliable than parsing the torrent name
 */
function detectContentTypeFromFiles(files: TorrentFile[], torrentName: string): ContentType {
  if (files.length === 0) {
    // Fall back to name-based detection if no files
    return detectContentType(torrentName);
  }

  // Count files by media category and extension
  let audioCount = 0;
  let videoCount = 0;
  let ebookCount = 0;
  let audioSize = 0;
  let videoSize = 0;
  let ebookSize = 0;

  for (const file of files) {
    const ext = file.extension?.toLowerCase() ?? '';
    const category = file.media_category;

    // Check by extension first (more reliable)
    if (AUDIO_EXTENSIONS.has(ext)) {
      audioCount++;
      audioSize += file.size;
    } else if (VIDEO_EXTENSIONS.has(ext)) {
      videoCount++;
      videoSize += file.size;
    } else if (EBOOK_EXTENSIONS.has(ext)) {
      ebookCount++;
      ebookSize += file.size;
    } else if (category === 'audio') {
      audioCount++;
      audioSize += file.size;
    } else if (category === 'video') {
      videoCount++;
      videoSize += file.size;
    } else if (category === 'ebook') {
      ebookCount++;
      ebookSize += file.size;
    }
  }

  // Determine content type based on file composition
  // Use both count and size to make better decisions

  // If mostly audio files (by count), it's music
  if (audioCount > 0 && audioCount >= videoCount && audioCount >= ebookCount) {
    return 'music';
  }

  // If has video files, determine if movie or TV show
  if (videoCount > 0) {
    // Check torrent name for TV show patterns
    const lowerName = torrentName.toLowerCase();
    const hasTVPatterns =
      /\bs\d{1,2}e\d{1,2}\b/i.test(torrentName) ||
      /\bs\d{1,2}\b/i.test(torrentName) ||
      /\bseason\s*\d+\b/i.test(torrentName) ||
      /\bepisode\s*\d+\b/i.test(torrentName) ||
      /\bcomplete\s*series\b/i.test(torrentName) ||
      lowerName.includes('complete series') ||
      lowerName.includes('season');

    // Multiple video files often indicate TV show
    if (hasTVPatterns || videoCount > 3) {
      return 'tvshow';
    }

    return 'movie';
  }

  // If mostly ebook files, it's a book
  if (ebookCount > 0) {
    return 'book';
  }

  // Fall back to name-based detection
  return detectContentType(torrentName);
}

/**
 * Fetch files for a torrent from the database
 */
async function fetchTorrentFiles(
  supabase: SupabaseClient<Database>,
  torrentId: string
): Promise<TorrentFile[]> {
  const { data, error } = await supabase
    .from('torrent_files')
    .select('id, torrent_id, name, extension, media_category, size')
    .eq('torrent_id', torrentId)
    .order('size', { ascending: false }) // Largest files first
    .limit(100); // Limit to avoid huge queries

  if (error) {
    console.warn(`  ⚠️  Failed to fetch files: ${error.message}`);
    return [];
  }

  return (data ?? []) as TorrentFile[];
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

  // Handle different modes:
  // --no-poster: fetch torrents that were enriched but have no poster
  // --force: fetch all torrents regardless of metadata status
  // default: fetch only torrents without metadata_fetched_at
  if (options.noPoster) {
    // Torrents that have been enriched but don't have a poster
    query = query.not('metadata_fetched_at', 'is', null);
    query = query.is('poster_url', null);
  } else if (!options.force) {
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

  // Fetch files for this torrent to detect content type more reliably
  const files = await fetchTorrentFiles(supabase, torrent.id);
  console.log(`  Files: ${files.length} found`);

  // Detect content type - prefer file-based detection over name-based
  let contentType: ContentType;
  if (torrent.content_type) {
    contentType = torrent.content_type;
    console.log(`  Type: ${contentType} (from database)`);
  } else if (files.length > 0) {
    contentType = detectContentTypeFromFiles(files, torrent.name);
    console.log(`  Type: ${contentType} (detected from ${files.length} files)`);
    
    // Log file breakdown for debugging
    const audioFiles = files.filter(f => AUDIO_EXTENSIONS.has(f.extension?.toLowerCase() ?? '') || f.media_category === 'audio');
    const videoFiles = files.filter(f => VIDEO_EXTENSIONS.has(f.extension?.toLowerCase() ?? '') || f.media_category === 'video');
    const ebookFiles = files.filter(f => EBOOK_EXTENSIONS.has(f.extension?.toLowerCase() ?? '') || f.media_category === 'ebook');
    console.log(`    Audio: ${audioFiles.length}, Video: ${videoFiles.length}, Ebook: ${ebookFiles.length}`);
  } else {
    contentType = detectContentType(torrent.name);
    console.log(`  Type: ${contentType} (detected from name, no files found)`);
  }

  if (contentType === 'other') {
    console.log(`  ⏭️  Skipping: Unknown content type`);
    stats.skipped++;
    return;
  }

  // Check if we have the required API keys
  const omdbApiKey = process.env.OMDB_API_KEY;
  const fanartTvApiKey = process.env.FANART_TV_API_KEY;

  // Both movies and TV shows use OMDb
  if ((contentType === 'movie' || contentType === 'tvshow') && !omdbApiKey) {
    console.log(`  ⏭️  Skipping: OMDB_API_KEY not configured`);
    stats.skipped++;
    return;
  }

  // Fetch metadata
  try {
    // Import extractSearchQuery to show the cleaned query
    const { extractSearchQuery } = await import('../src/lib/metadata-enrichment/metadata-enrichment');
    const { query: cleanedQuery, year: extractedYear } = extractSearchQuery(torrent.name, contentType);
    console.log(`  🔍 Searching for: "${cleanedQuery}" (year: ${extractedYear ?? 'unknown'}) (as ${contentType})`);
    
    const result = await enrichTorrentMetadata(torrent.name, {
      omdbApiKey,
      fanartTvApiKey,
      musicbrainzUserAgent: MUSICBRAINZ_USER_AGENT,
      // Pass the file-detected content type as override
      contentTypeOverride: contentType,
    });

    // Log the full result for debugging
    console.log(`  📋 API Response:`, JSON.stringify({
      contentType: result.contentType,
      title: result.title,
      year: result.year,
      posterUrl: result.posterUrl ? '✓' : '✗',
      coverUrl: result.coverUrl ? '✓' : '✗',
      externalId: result.externalId,
      externalSource: result.externalSource,
      error: result.error,
    }, null, 2).split('\n').map(l => `     ${l}`).join('\n'));

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
    if (result.posterUrl) console.log(`    Poster: ${result.posterUrl}`);
    if (result.coverUrl) console.log(`    Cover: ${result.coverUrl}`);
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

  if (options.noPoster) {
    console.log('🖼️  NO-POSTER MODE - Re-enriching torrents that have no poster\n');
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
  console.log(`  OMDB_API_KEY: ${process.env.OMDB_API_KEY ? '✓ configured (movies + TV shows)' : '✗ not set'}`);
  console.log(`  FANART_TV_API_KEY: ${process.env.FANART_TV_API_KEY ? '✓ configured (high-quality posters)' : '✗ not set (using OMDb posters)'}`);
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
