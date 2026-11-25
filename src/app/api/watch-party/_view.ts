/**
 * What a party looks like to a client, and who counts as its host.
 *
 * One shape for every route, so the page can poll GET and get exactly what
 * create, join and the playback update answered.
 */

import type { WatchParty } from '@/lib/watch-party';

export interface PartyView {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  mediaUrl: string;
  mediaTitle: string;
  state: WatchParty['state'];
  memberCount: number;
  members: { id: string; name: string; isHost: boolean }[];
  playback: WatchParty['playback'];
  settings: WatchParty['settings'];
  createdAt: string;
  /**
   * The server's clock when this was written. `playback.lastUpdate` is on the same clock,
   * so a client works out "how long ago" from the two and never from its own clock: a
   * laptop that is 40 seconds fast used to be seeked 40 seconds past the host.
   */
  serverTime: number;
}

/**
 * What a party may play: an https link (a file or an HLS playlist the host has), or one
 * of this site's own stream paths. Anything else, `javascript:` and plain http included
 * (a browser refuses http media on an https page), is refused rather than stored.
 */
const OWN_STREAM_PATHS = ['/api/stream', '/api/stream/hls', '/api/seedbox/stream'];

export function cleanMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || url.length > 2000) return null;
  if (url.startsWith('/')) {
    const path = url.split('?')[0] ?? '';
    return !url.startsWith('//') && OWN_STREAM_PATHS.includes(path) ? url : null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function partyView(party: WatchParty): PartyView {
  return {
    serverTime: Date.now(),
    id: party.id,
    code: party.code,
    hostId: party.hostId,
    hostName: party.hostName,
    mediaUrl: party.mediaUrl,
    mediaTitle: party.mediaTitle,
    state: party.state,
    memberCount: party.members.length,
    members: party.members.map((m) => ({ id: m.id, name: m.name, isHost: m.isHost })),
    playback: party.playback,
    settings: party.settings,
    createdAt: party.createdAt.toISOString(),
  };
}

/**
 * Is this request the host's?
 *
 * A signed-in host is proven by the session: the party's hostId is their user
 * id, and the cookie is the only thing that says so. A guest-hosted party has
 * only its guest string, which is the best such a party can do -- and it is
 * accepted only for guest hosts, so a member who saw a signed-in host's id in
 * the member list cannot present it as their own.
 */
export function isHostOf(party: WatchParty, sessionUserId: string | undefined, claimedHostId: string | undefined): boolean {
  if (sessionUserId && sessionUserId === party.hostId) return true;
  return party.hostId.startsWith('guest_') && claimedHostId === party.hostId;
}
