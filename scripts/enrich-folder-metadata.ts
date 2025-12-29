#!/usr/bin/env npx tsx

/**
 * Folder Metadata Enrichment Script
 *
 * Fetches cover art for individual folders within torrents
 * (music discographies, movie collections, etc.)
 *
 * Usage:
 *   pnpm tsx scripts/enrich-folder-metadata.ts
 *
 * Options:
 *   --dry-run       Show what would be updated without making changes
 *   --force         Re-fetch metadata even for folders that already have it
 *   --limit=N       Process only N torrents (default: all)
 *   --torrent=ID    Process only a specific torrent by ID
 *   --all-status    Process torrents regardless of status (default: only 'ready' torrents)
 *   --type=TYPE     Only process torrents of specific type (music, movie, tvshow, book)
 *
 * Required environment variables:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for authentication
 *
 * Note: MusicBrainz doesn't require an API key.
 */

import { config } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environment variables from .env file
config();

import type { Database } from '../src/lib/supabase/types';
import {
  extractAlbumFolders,
  enrichAlbumFolder,
  type AlbumFolder,
} from '../src/lib/folder-metadata';

// ============================================================================
// Types
// ============================================================================

interface Torrent {
  id: string;
  name: string;
  content_type: string | null;
}

interface TorrentFile {
  id: string;
  torrent_id: string;
  path: string;
}

type ContentType = 'movie' | 'tvshow' | 'music' | 'book' | 'other';

interface ScriptOptions {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  torrentId: string | null;
  allStatus: boolean;
  type: ContentType | null;
}

interface Stats {
  torrentsProcessed: number;
  foldersFound: number;
  foldersEnriched: number;
  foldersSkipped: number;
  errors: number;
}

// ============================================================================
// Configuration
// ============================================================================

const MUSICBRAINZ_USER_AGENT = 'BitTorrented/1.0.0 (https://bittorrented.com)';

// Rate limiting: MusicBrainz requires 1 request/second
const RATE_LIMIT_DELAY = 1100;

// ============================================================================
// Helpers
// ============================================================================

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: false,
    force: false,
    limit: null,
    torrentId: null,
    allStatus: false,
    type: null,
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
    } else if (arg.startsWith('--torrent=')) {
      options.torrentId = arg.split('=')[1];
    } else if (arg.startsWith('--type=')) {
      const value = arg.split('=')[1] as ContentType;
      if (['movie', 'tvshow', 'music', 'book', 'other'].includes(value)) {
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

// ============================================================================
// Database Operations
// ============================================================================

async function fetchTorrents(
  supabase: SupabaseClient<Database>,
  options: ScriptOptions
): Promise<Torrent[]> {
  let query = supabase
    .from('torrents')
    .select('id, name, content_type');

  // Filter by status unless --all-status is used
  if (!options.allStatus) {
    query = query.eq('status', 'ready');
  }

  // Filter by content type if specified
  if (options.type) {
    query = query.eq('content_type', options.type);
  }

  if (options.torrentId) {
    query = query.eq('id', options.torrentId);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  query = query.order('created_at', { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch torrents: ${error.message}`);
  }

  return (data ?? []) as Torrent[];
}

async function fetchTorrentFiles(
  supabase: SupabaseClient<Database>,
  torrentId: string
): Promise<TorrentFile[]> {
  const { data, error } = await supabase
    .from('torrent_files')
    .select('id, torrent_id, path')
    .eq('torrent_id', torrentId);

  if (error) {
    throw new Error(`Failed to fetch files: ${error.message}`);
  }

  return (data ?? []) as TorrentFile[];
}

async function fetchExistingFolders(
  supabase: SupabaseClient<Database>,
  torrentId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('torrent_folders')
    .select('path')
    .eq('torrent_id', torrentId);

  if (error) {
    console.warn(`  ⚠️  Failed to fetch existing folders: ${error.message}`);
    return new Set();
  }

  return new Set((data ?? []).map((f) => f.path));
}

async function upsertFolder(
  supabase: SupabaseClient<Database>,
  torrentId: string,
  folder: AlbumFolder,
  coverUrl: string | undefined,
  externalId: string | undefined,
  externalSource: string | undefined,
  dryRun: boolean
): Promise<boolean> {
  const folderData = {
    torrent_id: torrentId,
    path: folder.path,
    artist: folder.artist,
    album: folder.album,
    year: folder.year ?? null,
    cover_url: coverUrl ?? null,
    external_id: externalId ?? null,
    external_source: externalSource ?? null,
    metadata_fetched_at: new Date().toISOString(),
  };

  if (dryRun) {
    console.log(`    [DRY RUN] Would upsert folder:`, folderData);
    return true;
  }

  const { error } = await supabase
    .from('torrent_folders')
    .upsert(folderData, {
      onConflict: 'torrent_id,path',
    });

  if (error) {
    console.error(`    ❌ Failed to upsert folder: ${error.message}`);
    return false;
  }

  return true;
}

// ============================================================================
// Main Logic
// ============================================================================

async function processTorrent(
  supabase: SupabaseClient<Database>,
  torrent: Torrent,
  options: ScriptOptions,
  stats: Stats
): Promise<void> {
  console.log(`\n📦 Processing: ${torrent.name}`);

  // Fetch files for this torrent
  const files = await fetchTorrentFiles(supabase, torrent.id);
  console.log(`  Files: ${files.length}`);

  if (files.length === 0) {
    console.log(`  ⏭️  Skipping: No files found`);
    return;
  }

  // Extract album folders
  const folders = extractAlbumFolders(files);
  console.log(`  Album folders: ${folders.length}`);
  stats.foldersFound += folders.length;

  if (folders.length === 0) {
    console.log(`  ⏭️  Skipping: No album folders detected`);
    return;
  }

  // Get existing folders (to skip if not forcing)
  const existingFolders = options.force
    ? new Set<string>()
    : await fetchExistingFolders(supabase, torrent.id);

  // Process each folder
  for (const folder of folders) {
    console.log(`\n  📁 ${folder.path}`);
    console.log(`     Artist: ${folder.artist}`);
    console.log(`     Album: ${folder.album}`);
    if (folder.year) {
      console.log(`     Year: ${folder.year}`);
    }

    // Skip if already processed (unless forcing)
    if (existingFolders.has(folder.path)) {
      console.log(`     ⏭️  Already processed, skipping`);
      stats.foldersSkipped++;
      continue;
    }

    // Enrich folder with cover art
    try {
      console.log(`     🔍 Searching MusicBrainz + Fanart.tv...`);
      const fanartTvApiKey = process.env.FANART_TV_API_KEY;
      const result = await enrichAlbumFolder(folder, {
        musicbrainzUserAgent: MUSICBRAINZ_USER_AGENT,
        fanartTvApiKey,
      });

      if (result.error) {
        console.log(`     ⚠️  Error: ${result.error}`);
        stats.errors++;
      } else if (result.coverUrl) {
        console.log(`     ✓ Found cover: ${result.coverUrl}`);

        // Save to database
        const saved = await upsertFolder(
          supabase,
          torrent.id,
          folder,
          result.coverUrl,
          result.externalId,
          result.externalSource,
          options.dryRun
        );

        if (saved) {
          stats.foldersEnriched++;
          console.log(`     ✅ ${options.dryRun ? 'Would save' : 'Saved'} to database`);
        } else {
          stats.errors++;
        }
      } else {
        console.log(`     ⏭️  No cover art found`);
        
        // Still save the folder info without cover
        await upsertFolder(
          supabase,
          torrent.id,
          folder,
          undefined,
          result.externalId,
          result.externalSource,
          options.dryRun
        );
        stats.foldersSkipped++;
      }

      // Rate limiting
      await sleep(RATE_LIMIT_DELAY);
    } catch (error) {
      console.error(`     ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      stats.errors++;
    }
  }

  stats.torrentsProcessed++;
}

async function main(): Promise<void> {
  console.log('🚀 Folder Metadata Enrichment Script\n');

  const options = parseArgs();

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (options.force) {
    console.log('⚠️  FORCE MODE - Re-fetching all metadata\n');
  }

  if (options.allStatus) {
    console.log('📋 Processing all torrents regardless of status\n');
  }

  if (options.type) {
    console.log(`📁 Filtering by type: ${options.type}\n`);
  }

  if (options.torrentId) {
    console.log(`📁 Processing specific torrent: ${options.torrentId}\n`);
  }

  if (options.limit) {
    console.log(`📊 Limiting to ${options.limit} torrents\n`);
  }

  console.log('🔑 API Keys:');
  console.log(`  MusicBrainz: ✓ no key required`);
  console.log(`  FANART_TV_API_KEY: ${process.env.FANART_TV_API_KEY ? '✓ configured' : '✗ not set (album covers disabled)'}`);

  // Initialize Supabase client
  const supabase = getSupabaseClient();

  // Fetch torrents
  console.log('\n📥 Fetching torrents...');
  const torrents = await fetchTorrents(supabase, options);
  console.log(`Found ${torrents.length} torrents to process`);

  if (torrents.length === 0) {
    console.log('\n✅ No torrents found');
    return;
  }

  // Process each torrent
  const stats: Stats = {
    torrentsProcessed: 0,
    foldersFound: 0,
    foldersEnriched: 0,
    foldersSkipped: 0,
    errors: 0,
  };

  for (const torrent of torrents) {
    await processTorrent(supabase, torrent, options, stats);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 Summary:');
  console.log(`  Torrents processed: ${stats.torrentsProcessed}`);
  console.log(`  Folders found: ${stats.foldersFound}`);
  console.log(`  Folders enriched: ${stats.foldersEnriched}`);
  console.log(`  Folders skipped: ${stats.foldersSkipped}`);
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
