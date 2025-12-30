#!/usr/bin/env npx tsx

/**
 * Codec Detection Backfill Script
 *
 * Detects video/audio codecs for existing torrents that don't have codec info.
 * This is needed because codec detection during indexing may fail if the torrent
 * isn't fully available yet.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-codec-info.ts
 *
 * Options:
 *   --dry-run       Show what would be updated without making changes
 *   --force         Re-detect codecs even for torrents that already have codec info
 *   --limit=N       Process only N torrents (default: all)
 *   --infohash=X    Process only a specific torrent by infohash
 *   --timeout=N     FFprobe timeout in seconds (default: 60)
 *
 * Required environment variables:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for authentication
 *   - NEXT_PUBLIC_APP_URL: Base URL for the streaming API (e.g., https://bittorrented.com)
 */

import { config } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables from .env file
config();

import type { Database } from '../src/lib/supabase/types';
import {
  detectCodecFromUrl,
  formatCodecInfoForDb,
} from '../src/lib/codec-detection';

// ============================================================================
// Types
// ============================================================================

interface Torrent {
  id: string;
  infohash: string;
  name: string;
  video_codec: string | null;
  audio_codec: string | null;
  container: string | null;
  needs_transcoding: boolean | null;
  codec_detected_at: string | null;
}

interface TorrentFile {
  id: string;
  torrent_id: string;
  file_index: number;
  name: string;
  media_category: 'audio' | 'video' | 'ebook' | 'document' | 'other' | null;
}

interface ScriptOptions {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  infohash: string | null;
  timeout: number;
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

// Delay between requests to avoid overwhelming the server
const REQUEST_DELAY_MS = 2000;

// ============================================================================
// Helpers
// ============================================================================

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: false,
    force: false,
    limit: null,
    infohash: null,
    timeout: 60,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--limit=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!isNaN(value) && value > 0) {
        options.limit = value;
      }
    } else if (arg.startsWith('--infohash=')) {
      options.infohash = arg.split('=')[1];
    } else if (arg.startsWith('--timeout=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!isNaN(value) && value > 0) {
        options.timeout = value;
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

// ============================================================================
// Main Logic
// ============================================================================

async function fetchTorrentsToProcess(
  supabase: SupabaseClient<Database>,
  options: ScriptOptions
): Promise<Torrent[]> {
  // First, let's see what statuses exist in the database
  const { data: statusData } = await supabase
    .from('torrents')
    .select('id')
    .limit(1);
  
  console.log(`  Debug: Found ${statusData?.length ?? 0} torrents in database`);

  let query = supabase
    .from('torrents')
    .select('id, infohash, name, video_codec, audio_codec, container, needs_transcoding, codec_detected_at');

  // Filter by specific infohash if provided
  if (options.infohash) {
    query = query.eq('infohash', options.infohash.toLowerCase());
  }

  // Only process torrents without codec info unless --force is used
  if (!options.force && !options.infohash) {
    query = query.is('codec_detected_at', null);
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

async function fetchFirstMediaFile(
  supabase: SupabaseClient<Database>,
  torrentId: string
): Promise<TorrentFile | null> {
  const { data, error } = await supabase
    .from('torrent_files')
    .select('id, torrent_id, file_index, name, media_category')
    .eq('torrent_id', torrentId)
    .in('media_category', ['video', 'audio'])
    .order('file_index', { ascending: true })
    .limit(1);

  if (error) {
    console.warn(`  ⚠️  Failed to fetch files: ${error.message}`);
    return null;
  }

  return (data?.[0] as TorrentFile) ?? null;
}

async function processTorrent(
  supabase: SupabaseClient<Database>,
  torrent: Torrent,
  options: ScriptOptions,
  stats: Stats,
  baseUrl: string
): Promise<void> {
  console.log(`\n📦 Processing: ${torrent.name}`);
  console.log(`   Infohash: ${torrent.infohash}`);

  // Check if already has codec info
  if (torrent.codec_detected_at && !options.force) {
    console.log(`  ⏭️  Skipping: Already has codec info`);
    console.log(`     Video: ${torrent.video_codec ?? 'none'}, Audio: ${torrent.audio_codec ?? 'none'}`);
    stats.skipped++;
    return;
  }

  // Find first media file
  const mediaFile = await fetchFirstMediaFile(supabase, torrent.id);
  if (!mediaFile) {
    console.log(`  ⏭️  Skipping: No video/audio files found`);
    stats.skipped++;
    return;
  }

  console.log(`  📁 File: ${mediaFile.name} (index: ${mediaFile.file_index}, type: ${mediaFile.media_category})`);

  // Build stream URL
  const streamUrl = `${baseUrl}/api/stream?infohash=${torrent.infohash}&fileIndex=${mediaFile.file_index}`;
  console.log(`  🔗 Stream URL: ${streamUrl}`);

  if (options.dryRun) {
    console.log(`  [DRY RUN] Would detect codec from stream`);
    stats.updated++;
    return;
  }

  try {
    console.log(`  🔍 Detecting codec (timeout: ${options.timeout}s)...`);
    const codecInfo = await detectCodecFromUrl(streamUrl, options.timeout);
    const dbData = formatCodecInfoForDb(codecInfo);
    const now = new Date().toISOString();

    console.log(`  ✓ Codec detected:`);
    console.log(`    Video: ${codecInfo.videoCodec ?? 'none'}`);
    console.log(`    Audio: ${codecInfo.audioCodec ?? 'none'}`);
    console.log(`    Container: ${codecInfo.container}`);
    console.log(`    Needs transcoding: ${codecInfo.needsTranscoding ? 'yes' : 'no'}`);

    // Update torrent-level codec info
    const { error: updateError } = await supabase
      .from('torrents')
      .update({
        video_codec: dbData.video_codec,
        audio_codec: dbData.audio_codec,
        container: dbData.container,
        needs_transcoding: dbData.needs_transcoding,
        codec_detected_at: now,
      })
      .eq('id', torrent.id);

    if (updateError) {
      console.error(`  ❌ Failed to update torrent: ${updateError.message}`);
      stats.errors++;
      return;
    }

    // Also update file-level metadata
    if (mediaFile.media_category === 'video') {
      const { error: videoMetaError } = await supabase
        .from('video_metadata')
        .upsert({
          file_id: mediaFile.id,
          codec: dbData.video_codec,
          audio_codec: dbData.audio_codec,
          container: dbData.container,
          duration_seconds: dbData.duration_seconds,
          bitrate: dbData.bit_rate,
          needs_transcoding: dbData.needs_transcoding,
          codec_detected_at: now,
        }, {
          onConflict: 'file_id',
        });

      if (videoMetaError) {
        console.warn(`  ⚠️  Failed to update video metadata: ${videoMetaError.message}`);
      }
    } else if (mediaFile.media_category === 'audio') {
      const { error: audioMetaError } = await supabase
        .from('audio_metadata')
        .upsert({
          file_id: mediaFile.id,
          codec: dbData.audio_codec,
          container: dbData.container,
          duration_seconds: dbData.duration_seconds,
          bitrate: dbData.bit_rate,
          codec_detected_at: now,
        }, {
          onConflict: 'file_id',
        });

      if (audioMetaError) {
        console.warn(`  ⚠️  Failed to update audio metadata: ${audioMetaError.message}`);
      }
    }

    console.log(`  ✅ Updated successfully`);
    stats.updated++;
  } catch (error) {
    console.error(`  ❌ Codec detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stats.errors++;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Codec Detection Backfill Script\n');

  const options = parseArgs();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (options.force) {
    console.log('⚠️  FORCE MODE - Re-detecting all codecs\n');
  }

  if (options.infohash) {
    console.log(`🎯 Processing specific torrent: ${options.infohash}\n`);
  }

  if (options.limit) {
    console.log(`📊 Limiting to ${options.limit} torrents\n`);
  }

  console.log(`⏱️  FFprobe timeout: ${options.timeout} seconds\n`);

  // Check for required environment variables
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error('Missing NEXT_PUBLIC_APP_URL environment variable');
  }
  console.log(`🌐 Base URL: ${baseUrl}\n`);

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Fetch torrents to process
  console.log('📥 Fetching torrents...');
  const torrents = await fetchTorrentsToProcess(supabase, options);
  console.log(`Found ${torrents.length} torrents to process`);

  if (torrents.length === 0) {
    console.log('\n✅ No torrents need codec detection');
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
    await processTorrent(supabase, torrent, options, stats, baseUrl);
    stats.processed++;

    // Progress indicator
    const progress = Math.round((stats.processed / stats.total) * 100);
    console.log(`\n📊 Progress: ${stats.processed}/${stats.total} (${progress}%)`);

    // Rate limiting
    if (stats.processed < stats.total) {
      await sleep(REQUEST_DELAY_MS);
    }
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
