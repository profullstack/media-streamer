#!/usr/bin/env npx tsx
/**
 * bittorrented.com (media-streamer) Stats Dashboard
 * Usage: npx tsx scripts/stats.ts
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
// Try multiple env file locations
const envPaths = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.env.HOME || "", "www/bittorrented.com/media-streamer/.env"),
];
for (const p of envPaths) dotenv.config({ path: p });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function count(table: string, filter?: Record<string, unknown>) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      if (val === null) q = q.is(col, null);
      else if (typeof val === "string" && val.startsWith("not."))
        q = q.not(col, "is", null);
      else q = q.eq(col, val as string);
    }
  }
  const { count: c, error } = await q;
  if (error) console.error(`  ⚠ ${table}:`, error.message);
  return c ?? 0;
}

async function countSince(table: string, col: string, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { count: c } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(col, since);
  return c ?? 0;
}

function header(title: string) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(50));
}

function line(label: string, value: number | string) {
  console.log(`  ${label.padEnd(35)} ${value}`);
}

async function main() {
  console.log("📊 bittorrented.com Stats Dashboard");
  console.log(`   ${new Date().toISOString()}\n`);

  // ── Users ──
  header("👤 Users");
  const totalUsers = await count("user_profiles");
  const newUsers7d = await countSince("user_profiles", "created_at", 7);
  const newUsers30d = await countSince("user_profiles", "created_at", 30);

  line("Total users", totalUsers);
  line("  New (7 days)", newUsers7d);
  line("  New (30 days)", newUsers30d);

  // ── Torrents ──
  header("🧲 Torrents");
  const totalTorrents = await count("bt_torrents");
  const newTorrents7d = await countSince("bt_torrents", "created_at", 7);
  const newTorrents30d = await countSince("bt_torrents", "created_at", 30);
  const totalFiles = await count("bt_torrent_files");
  const totalFolders = await count("bt_torrent_folders");

  line("Total torrents", totalTorrents);
  line("  New (7 days)", newTorrents7d);
  line("  New (30 days)", newTorrents30d);
  line("  Total files", totalFiles);
  line("  Total folders", totalFolders);

  // ── Content Types ──
  header("🎬 Content Metadata");
  const videoMeta = await count("bt_video_metadata");
  const audioMeta = await count("bt_audio_metadata");
  const ebookMeta = await count("bt_ebook_metadata");

  line("Video metadata entries", videoMeta);
  line("Audio metadata entries", audioMeta);
  line("Ebook metadata entries", ebookMeta);

  // ── IPTV ──
  header("📺 IPTV");
  const totalPlaylists = await count("iptv_playlists");
  const totalIptvSubs = await count("iptv_subscriptions");
  const iptvChannelFavs = await count("iptv_channel_favorites");

  line("Playlists", totalPlaylists);
  line("Subscriptions", totalIptvSubs);
  line("Channel favorites", iptvChannelFavs);

  // ── Podcasts ──
  header("🎙️ Podcasts");
  const totalPodcasts = await count("podcasts");
  const podcastSubs = await count("podcast_subscriptions");
  const podcastEps = await count("podcast_episodes");

  line("Podcasts", totalPodcasts);
  line("Subscriptions", podcastSubs);
  line("Episodes", podcastEps);

  // ── Engagement ──
  header("💬 Engagement");
  const totalComments = await count("torrent_comments");
  const totalVotes = await count("torrent_votes");
  const totalFavorites = await count("torrent_favorites");
  const radioFavs = await count("radio_station_favorites");

  line("Torrent comments", totalComments);
  line("Torrent votes", totalVotes);
  line("Torrent favorites", totalFavorites);
  line("Radio favorites", radioFavs);

  // ── Watch/Read Progress ──
  header("📖 Progress Tracking");
  const watchProgress = await count("watch_progress");
  const readProgress = await count("reading_progress");
  const podcastProgress = await count("podcast_listen_progress");

  line("Watch progress entries", watchProgress);
  line("Reading progress entries", readProgress);
  line("Podcast listen progress", podcastProgress);

  // ── Collections & Watchlists ──
  header("📚 Collections & Watchlists");
  const collections = await count("collections");
  const collectionItems = await count("collection_items");
  const watchlists = await count("user_watchlists");
  const watchlistItems = await count("watchlist_items");

  line("Collections", collections);
  line("  Items", collectionItems);
  line("Watchlists", watchlists);
  line("  Items", watchlistItems);

  // ── Subscriptions & Payments ──
  header("💰 Subscriptions & Payments");
  const userSubs = await count("user_subscriptions");
  const payments = await count("payment_history");
  const iptvPayments = await count("iptv_payment_history");

  line("User subscriptions", userSubs);
  line("Payment history", payments);
  line("IPTV payments", iptvPayments);

  // ── Family Plans ──
  header("👨‍👩‍👧‍👦 Family Plans");
  const familyPlans = await count("family_plans");
  const familyMembers = await count("family_members");
  const familyInvites = await count("family_invitations");

  line("Family plans", familyPlans);
  line("  Members", familyMembers);
  line("  Invitations", familyInvites);

  // ── DHT Crawler ──
  header("🕷️ DHT Crawler");
  const dhtTorrents = await count("dht_torrents");
  const dhtFiles = await count("dht_torrent_files");
  const dhtApiKeys = await count("dht_api_keys");
  const dhtNewTorrents7d = await countSince("dht_torrents", "discovered_at", 7);

  line("DHT torrents indexed", dhtTorrents);
  line("  New (7 days)", dhtNewTorrents7d);
  line("  Files indexed", dhtFiles);
  line("  API keys", dhtApiKeys);

  // ── Push Notifications ──
  header("🔔 Notifications");
  const pushSubs = await count("push_subscriptions");
  const notifications = await count("notification_history");

  line("Push subscriptions", pushSubs);
  line("Notification history", notifications);

  console.log(`\n${"═".repeat(50)}\n`);
}

main().catch(console.error);
