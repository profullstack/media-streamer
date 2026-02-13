/**
 * Auto-save IPTV playlist after subscription creation
 * 
 * Saves the M3U playlist URL to iptv_playlists so users can immediately
 * watch live TV after purchasing a subscription.
 */

import { getServerClient } from '../supabase/client';

const BASE_NAME = 'IPTV Subscription';

/**
 * Generate a unique playlist name for the user.
 * Returns "IPTV Subscription" if none exists, otherwise "IPTV Subscription N"
 * where N = max existing suffix + 1.
 */
export async function generatePlaylistName(userId: string): Promise<string> {
  const supabase = getServerClient();

  const { data: existing } = await supabase
    .from('iptv_playlists')
    .select('name')
    .eq('user_id', userId)
    .like('name', `${BASE_NAME}%`);

  if (!existing || existing.length === 0) {
    return BASE_NAME;
  }

  const names = new Set(existing.map(p => p.name));

  if (!names.has(BASE_NAME)) {
    return BASE_NAME;
  }

  // Find max suffix number
  let maxNum = 1;
  for (const name of names) {
    if (name === BASE_NAME) continue;
    const match = name.match(/^IPTV Subscription (\d+)$/);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }

  return `${BASE_NAME} ${maxNum + 1}`;
}

/**
 * Auto-save a playlist for a user after IPTV subscription creation.
 * Skips M3U URL validation since we trust ArgonTV's URLs.
 */
export async function autoSavePlaylist(userId: string, m3uUrl: string): Promise<void> {
  const supabase = getServerClient();
  const name = await generatePlaylistName(userId);

  const { error } = await supabase
    .from('iptv_playlists')
    .insert({
      user_id: userId,
      name,
      m3u_url: m3uUrl,
      epg_url: null,
      is_active: true,
    });

  if (error) {
    console.error('[IPTV Auto-Save] Failed to save playlist:', error);
    throw new Error(`Failed to auto-save playlist: ${error.message}`);
  }

  console.log(`[IPTV Auto-Save] Saved playlist "${name}" for user ${userId}`);
}
