/**
 * A watch party here, as a room on nixamp.
 *
 * The film never leaves bittorrented.com: we have the torrent, the rights and
 * the bandwidth, and nixamp has none of those. What crosses over is the room
 * -- who is in it, the chat, and the second everybody is supposed to be at --
 * because that is the part every nixamp client already knows how to open: the
 * browser, the terminal, the desktop app, the television and an agent over MCP.
 *
 * Bridging is idempotent on both sides. We call it whenever the host opens
 * the party page, and nixamp answers the same room rather than making a
 * second one; the row we keep is only so this process does not have to ask
 * nixamp before it can tell a member where the room is.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import { getAppOrigin } from './config';
import { getNixampAccount, usableAccessToken, NixampConnectionLost } from './accounts';

function sb(): SupabaseClient {
  return createServerClient() as unknown as SupabaseClient;
}

export interface BridgedRoom {
  partyCode: string;
  nixampSite: string;
  eventId: string;
  roomId: string;
  slug: string;
  /** https://nixamp.com/live/<slug> — the room, joinable from any nixamp client. */
  nixampUrl: string;
}

interface RoomRow {
  party_code: string;
  nixamp_site: string;
  nixamp_event_id: string;
  nixamp_room_id: string;
  nixamp_slug: string;
  nixamp_url: string;
}

function fromRow(row: RoomRow): BridgedRoom {
  return {
    partyCode: row.party_code,
    nixampSite: row.nixamp_site,
    eventId: row.nixamp_event_id,
    roomId: row.nixamp_room_id,
    slug: row.nixamp_slug,
    nixampUrl: row.nixamp_url,
  };
}

/** Where a party can be watched here, which is what nixamp shows its clients. */
export function watchPartyUrl(partyCode: string, origin = ''): string {
  const base = getAppOrigin(origin) || 'https://bittorrented.com';
  return `${base}/watch-party?code=${encodeURIComponent(partyCode)}`;
}

/** The room a party already has, without asking nixamp. */
export async function getBridgedRoom(partyCode: string): Promise<BridgedRoom | null> {
  const { data, error } = await sb()
    .from('bt_watch_party_rooms')
    .select('*')
    .eq('party_code', partyCode.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as RoomRow);
}

interface NixampPartyAnswer {
  party?: { roomId?: string; slug?: string; partyCode?: string; positionNow?: number; playing?: boolean };
  event?: { id?: string; title?: string; status?: string };
  links?: { nixampUrl?: string; roomUrl?: string };
  error?: string;
}

export class NixampNotConnected extends Error {
  constructor() {
    super('connect your nixamp account first');
    this.name = 'NixampNotConnected';
  }
}

export interface BridgeInput {
  userId: string;
  partyCode: string;
  title?: string;
  mediaTitle?: string;
  /** This deployment's own origin, when it is not the configured one. */
  origin?: string;
}

/**
 * Put a party on nixamp as a room, under the host's own nixamp account.
 *
 * Deliberately the HOST's account and not a service credential: the room
 * belongs to a person over there, appears in their events, and is theirs to
 * end. A service account would make every party on nixamp belong to
 * "bittorrented", which is nobody.
 */
export async function bridgeParty(input: BridgeInput, fetcher: typeof fetch = fetch): Promise<BridgedRoom> {
  const account = await getNixampAccount(input.userId);
  if (!account) throw new NixampNotConnected();
  const { accessToken, config } = await usableAccessToken(account, fetcher);

  const res = await fetcher(`${config.site}/api/v1/watch-parties`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partyCode: input.partyCode,
      ...(input.title ? { title: input.title } : {}),
      ...(input.mediaTitle ? { mediaTitle: input.mediaTitle } : {}),
      partyUrl: watchPartyUrl(input.partyCode, input.origin),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as NixampPartyAnswer;
  if (!res.ok || !body.party?.roomId || !body.event?.id) {
    throw new Error(body.error ?? `nixamp would not bridge that party (${res.status})`);
  }

  const room: BridgedRoom = {
    partyCode: input.partyCode.toUpperCase(),
    nixampSite: config.site,
    eventId: body.event.id,
    roomId: body.party.roomId,
    slug: body.party.slug ?? '',
    nixampUrl: body.links?.nixampUrl ?? `${config.site}/live/${body.party.slug ?? body.event.id}`,
  };

  await sb().from('bt_watch_party_rooms').upsert(
    {
      party_code: room.partyCode,
      host_user_id: input.userId,
      nixamp_site: room.nixampSite,
      nixamp_event_id: room.eventId,
      nixamp_room_id: room.roomId,
      nixamp_slug: room.slug,
      nixamp_url: room.nixampUrl,
    },
    { onConflict: 'party_code' }
  );

  return room;
}

/**
 * Tell nixamp where playback is, so somebody joining from a nixamp client
 * lands on the same second as everybody in the browser here.
 *
 * Best effort by design: a watch party whose players are in sync locally must
 * not stop working because nixamp is slow. It answers whether it landed.
 */
export async function pushPlayback(
  input: { userId: string; partyCode: string; positionSeconds: number; playing: boolean; mediaTitle?: string },
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  const account = await getNixampAccount(input.userId);
  if (!account) return false;
  try {
    const { accessToken, config } = await usableAccessToken(account, fetcher);
    const res = await fetcher(
      `${config.site}/api/v1/watch-parties/${encodeURIComponent(input.partyCode)}/playback`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionSeconds: input.positionSeconds,
          playing: input.playing,
          ...(input.mediaTitle ? { mediaTitle: input.mediaTitle } : {}),
        }),
      }
    );
    return res.ok;
  } catch (error) {
    if (error instanceof NixampConnectionLost) return false;
    return false;
  }
}

/** End the room when the party ends. Same best-effort reasoning. */
export async function endBridgedParty(userId: string, partyCode: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const account = await getNixampAccount(userId);
  if (!account) return false;
  try {
    const { accessToken, config } = await usableAccessToken(account, fetcher);
    const res = await fetcher(`${config.site}/api/v1/watch-parties/${encodeURIComponent(partyCode)}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) await sb().from('bt_watch_party_rooms').delete().eq('party_code', partyCode.toUpperCase());
    return res.ok;
  } catch {
    return false;
  }
}
