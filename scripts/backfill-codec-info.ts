#!/usr/bin/env npx tsx

/**
 * Torrent Backfill Script
 *
 * Backfills missing data for existing torrents:
 * - Codec detection (video/audio codecs, container, transcoding needs)
 * - Swarm stats (seeders/leechers from tracker scraping)
 * - Health status (calculated from seeders)
 *
 * Usage:
 *   pnpm tsx scripts/backfill-codec-info.ts
 *
 * Options:
 *   --dry-run       Show what would be updated without making changes
 *   --force         Re-detect all data even for torrents that already have it
 *   --limit=N       Process only N torrents (default: all)
 *   --infohash=X    Process only a specific torrent by infohash
 *   --timeout=N     FFprobe timeout in seconds (default: 60)
 *   --skip-codec    Skip codec detection (only update swarm stats)
 *   --skip-swarm    Skip swarm stats (only update codec info)
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
import {
  scrapeMultipleTrackers,
  SCRAPE_TRACKERS,
} from '../src/lib/tracker-scrape';

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
  seeders: number | null;
  leechers: number | null;
  swarm_updated_at: string | null;
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
  skipCodec: boolean;
  skipSwarm: boolean;
}

interface Stats {
  total: number;
  processed: number;
  codecUpdated: number;
  swarmUpdated: number;
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
    skipCodec: false,
    skipSwarm: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--skip-codec') {
      options.skipCodec = true;
    } else if (arg === '--skip-swarm') {
      options.skipSwarm = true;
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
    .from('bt_torrents')
    .select('id')
    .limit(1);
  
  console.log(`  Debug: Found ${statusData?.length ?? 0} torrents in database`);

  let query = supabase
    .from('bt_torrents')
    .select('id, infohash, name, video_codec, audio_codec, container, needs_transcoding, codec_detected_at, seeders, leechers, swarm_updated_at');

  // Filter by specific infohash if provided
  if (options.infohash) {
    query = query.eq('infohash', options.infohash.toLowerCase());
  }

  // Only process torrents without codec info unless --force is used
  // When --force is used, process all torrents
  if (!options.force && !options.infohash) {
    // Process torrents that need either codec detection OR swarm update
    // We'll filter more specifically in processTorrent
    query = query.or('codec_detected_at.is.null,swarm_updated_at.is.null');
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
    .from('bt_torrent_files')
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

async function updateSwarmStats(
  supabase: SupabaseClient<Database>,
  torrent: Torrent,
  options: ScriptOptions,
  stats: Stats
): Promise<void> {
  // Check if already has swarm info
  if (torrent.swarm_updated_at && !options.force) {
    console.log(`  ⏭️  Skipping swarm: Already has swarm info`);
    console.log(`     Seeders: ${torrent.seeders ?? 'unknown'}, Leechers: ${torrent.leechers ?? 'unknown'}`);
    return;
  }

  if (options.dryRun) {
    console.log(`  [DRY RUN] Would scrape trackers for swarm stats`);
    stats.swarmUpdated++;
    return;
  }

  try {
    console.log(`  🔍 Scraping trackers for swarm stats...`);
    
    // Use default trackers for scraping
    const swarmStats = await scrapeMultipleTrackers(SCRAPE_TRACKERS, torrent.infohash, {
      timeout: 15000,
      maxConcurrent: 5,
    });

    const now = new Date().toISOString();

    console.log(`  ✓ Swarm stats retrieved:`);
    console.log(`    Seeders: ${swarmStats.seeders ?? 'unknown'}`);
    console.log(`    Leechers: ${swarmStats.leechers ?? 'unknown'}`);
    console.log(`    Trackers responded: ${swarmStats.trackersResponded}/${swarmStats.trackersQueried}`);

    // Update torrent with swarm stats
    const { error: updateError } = await supabase
      .from('bt_torrents')
      .update({
        seeders: swarmStats.seeders,
        leechers: swarmStats.leechers,
        swarm_updated_at: now,
      })
      .eq('id', torrent.id);

    if (updateError) {
      console.error(`  ❌ Failed to update swarm stats: ${updateError.message}`);
      stats.errors++;
      return;
    }

    console.log(`  ✅ Swarm stats updated successfully`);
    stats.swarmUpdated++;
  } catch (error) {
    console.error(`  ❌ Swarm scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stats.errors++;
  }
}

async function updateCodecInfo(
  supabase: SupabaseClient<Database>,
  torrent: Torrent,
  options: ScriptOptions,
  stats: Stats,
  baseUrl: string
): Promise<void> {
  // Check if already has codec info
  if (torrent.codec_detected_at && !options.force) {
    console.log(`  ⏭️  Skipping codec: Already has codec info`);
    console.log(`     Video: ${torrent.video_codec ?? 'none'}, Audio: ${torrent.audio_codec ?? 'none'}`);
    return;
  }

  // Find first media file
  const mediaFile = await fetchFirstMediaFile(supabase, torrent.id);
  if (!mediaFile) {
    console.log(`  ⏭️  Skipping codec: No video/audio files found`);
    return;
  }

  console.log(`  📁 File: ${mediaFile.name} (index: ${mediaFile.file_index}, type: ${mediaFile.media_category})`);

  // Build stream URL
  const streamUrl = `${baseUrl}/api/stream?infohash=${torrent.infohash}&fileIndex=${mediaFile.file_index}`;
  console.log(`  🔗 Stream URL: ${streamUrl}`);

  if (options.dryRun) {
    console.log(`  [DRY RUN] Would detect codec from stream`);
    stats.codecUpdated++;
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
      .from('bt_torrents')
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
        .from('bt_video_metadata')
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
        .from('bt_audio_metadata')
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

    console.log(`  ✅ Codec info updated successfully`);
    stats.codecUpdated++;
  } catch (error) {
    console.error(`  ❌ Codec detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stats.errors++;
  }
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

  // Determine what needs to be done
  const needsCodec = !options.skipCodec && (!torrent.codec_detected_at || options.force);
  const needsSwarm = !options.skipSwarm && (!torrent.swarm_updated_at || options.force);

  if (!needsCodec && !needsSwarm) {
    console.log(`  ⏭️  Skipping: Already has all data`);
    stats.skipped++;
    return;
  }

  // Update swarm stats first (faster, doesn't require streaming)
  if (needsSwarm) {
    await updateSwarmStats(supabase, torrent, options, stats);
  }

  // Update codec info (requires streaming the file)
  if (needsCodec) {
    await updateCodecInfo(supabase, torrent, options, stats, baseUrl);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Torrent Backfill Script\n');

  const options = parseArgs();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (options.force) {
    console.log('⚠️  FORCE MODE - Re-detecting all data\n');
  }

  if (options.infohash) {
    console.log(`🎯 Processing specific torrent: ${options.infohash}\n`);
  }

  if (options.limit) {
    console.log(`📊 Limiting to ${options.limit} torrents\n`);
  }

  if (options.skipCodec) {
    console.log('⏭️  Skipping codec detection\n');
  }

  if (options.skipSwarm) {
    console.log('⏭️  Skipping swarm stats\n');
  }

  console.log(`⏱️  FFprobe timeout: ${options.timeout} seconds\n`);

  // Check for required environment variables
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl && !options.skipCodec) {
    throw new Error('Missing NEXT_PUBLIC_APP_URL environment variable (required for codec detection)');
  }
  if (baseUrl) {
    console.log(`🌐 Base URL: ${baseUrl}\n`);
  }

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Fetch torrents to process
  console.log('📥 Fetching torrents...');
  const torrents = await fetchTorrentsToProcess(supabase, options);
  console.log(`Found ${torrents.length} torrents to process`);

  if (torrents.length === 0) {
    console.log('\n✅ No torrents need processing');
    return;
  }

  // Process each torrent
  const stats: Stats = {
    total: torrents.length,
    processed: 0,
    codecUpdated: 0,
    swarmUpdated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const torrent of torrents) {
    await processTorrent(supabase, torrent, options, stats, baseUrl ?? '');
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
  console.log(`  Codec updated: ${stats.codecUpdated}`);
  console.log(`  Swarm updated: ${stats.swarmUpdated}`);
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
