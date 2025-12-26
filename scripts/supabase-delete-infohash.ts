#!/usr/bin/env -S node --env-file=.env --import=tsx

/**
 * Supabase Torrent Deletion Script
 * 
 * Deletes all data associated with a torrent infohash from the database.
 * This includes:
 *   - torrents (main record)
 *   - torrent_files (cascades from torrents)
 *   - audio_metadata (cascades from torrent_files)
 *   - video_metadata (cascades from torrent_files)
 *   - ebook_metadata (cascades from torrent_files)
 *   - user_favorites (cascades from torrent_files)
 *   - collection_items (cascades from torrent_files)
 *   - reading_progress (cascades from torrent_files)
 *   - watch_progress (cascades from torrent_files)
 * 
 * Usage:
 *   pnpm tsx --env-file=.env scripts/supabase-delete-infohash.ts <infohash>
 * 
 * Or with the npm script:
 *   pnpm supabase:delete-torrent <infohash>
 * 
 * Example:
 *   pnpm tsx --env-file=.env scripts/supabase-delete-infohash.ts dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c
 * 
 * Required environment variables:
 *   - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for admin access
 */

import { createClient } from '@supabase/supabase-js';
import {
  validateInfohash,
  formatBytes,
  getTorrentByInfohash,
  getFileIds,
  countRelatedRecords,
  deleteTorrentById,
} from '../src/lib/torrent-deletion/torrent-deletion.js';

async function main(): Promise<void> {
  console.log('🗑️  Supabase Torrent Deletion Script\n');

  // Get infohash from command line arguments
  const infohash = process.argv[2];

  if (!infohash) {
    console.error('❌ Error: Infohash argument is required');
    console.error('\nUsage:');
    console.error('  pnpm tsx scripts/supabase-delete-infohash.ts <infohash>');
    console.error('\nExample:');
    console.error('  pnpm tsx scripts/supabase-delete-infohash.ts dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c');
    process.exit(1);
  }

  if (!validateInfohash(infohash)) {
    console.error('❌ Error: Invalid infohash format');
    console.error('   Infohash must be a 40-character hexadecimal string');
    console.error(`   Received: ${infohash}`);
    process.exit(1);
  }

  // Get required environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!serviceRoleKey) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    process.exit(1);
  }

  // Create Supabase client with service role key for admin access
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log(`🔍 Looking up torrent: ${infohash}\n`);

  try {
    // Find the torrent
    const torrent = await getTorrentByInfohash(supabase, infohash);

    if (!torrent) {
      console.error('❌ Error: Torrent not found');
      console.error(`   No torrent exists with infohash: ${infohash}`);
      process.exit(1);
    }

    console.log('📦 Found torrent:');
    console.log(`   ID: ${torrent.id}`);
    console.log(`   Name: ${torrent.name}`);
    console.log(`   Files: ${torrent.file_count}`);
    console.log(`   Size: ${formatBytes(torrent.total_size)}`);
    console.log('');

    // Get file IDs for counting related records
    const fileIds = await getFileIds(supabase, torrent.id);
    console.log(`📁 Found ${fileIds.length} files in torrent\n`);

    // Count related records that will be deleted
    const counts = await countRelatedRecords(supabase, fileIds);

    console.log('📊 Records to be deleted:');
    console.log(`   • Torrent: 1`);
    console.log(`   • Files: ${fileIds.length}`);
    console.log(`   • Audio metadata: ${counts.audioMetadata}`);
    console.log(`   • Video metadata: ${counts.videoMetadata}`);
    console.log(`   • Ebook metadata: ${counts.ebookMetadata}`);
    console.log(`   • User favorites: ${counts.favorites}`);
    console.log(`   • Collection items: ${counts.collectionItems}`);
    console.log(`   • Reading progress: ${counts.readingProgress}`);
    console.log(`   • Watch progress: ${counts.watchProgress}`);
    console.log('');

    // Confirm deletion
    console.log('⚠️  This action is irreversible!\n');
    
    // Check for --force flag to skip confirmation
    const forceFlag = process.argv.includes('--force') || process.argv.includes('-f');
    
    if (!forceFlag) {
      // Use readline for confirmation
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question('Are you sure you want to delete this torrent? (yes/no): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('\n❌ Deletion cancelled');
        process.exit(0);
      }
    } else {
      console.log('🔧 Force flag detected, skipping confirmation\n');
    }

    // Perform deletion
    console.log('\n🗑️  Deleting torrent and all related data...');
    await deleteTorrentById(supabase, torrent.id);

    const totalDeleted = 1 + fileIds.length + 
      counts.audioMetadata + 
      counts.videoMetadata + 
      counts.ebookMetadata + 
      counts.favorites + 
      counts.collectionItems + 
      counts.readingProgress + 
      counts.watchProgress;

    console.log('\n✅ Successfully deleted torrent and all related data!');
    console.log('\n📝 Summary:');
    console.log(`   Torrent: ${torrent.name}`);
    console.log(`   Infohash: ${infohash}`);
    console.log(`   Total records deleted: ${totalDeleted}`);

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
