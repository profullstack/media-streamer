/**
 * Watch Party Store
 *
 * Parties live in memory, and every write is copied to Redis so a party outlives the
 * process. It used to be memory only, in a module-level Map, which broke two ways:
 *
 *  - Every deploy restarts the app, so every party in progress ended ("That party has
 *    ended") the moment a merge landed.
 *  - A module-level Map is per bundle. Next can compile each route (create, join,
 *    playback, nixamp) into its own chunk with its own copy of this module, so a party
 *    made by one route was "not found" by another. The Map now hangs off globalThis,
 *    which every bundle in the process shares.
 *
 * Memory stays the source of truth while the process is up (one app container), so the
 * reads on the 3 second poll never touch Redis. Redis is only read for a party this
 * process has not seen, which is the first request after a restart.
 */

import Redis from 'ioredis';
import type { WatchParty } from '@/lib/watch-party';

// Party TTL (24 hours)
const PARTY_TTL_MS = 24 * 60 * 60 * 1000;
const REDIS_PREFIX = 'watch-party:';
/** A member who has not polled for this long has closed the tab. */
export const MEMBER_STALE_MS = 30_000;

interface Shared {
  parties: Map<string, WatchParty>;
  /** code -> member id -> last poll, epoch ms. Not persisted: it is rebuilt by polling. */
  seen: Map<string, Map<string, number>>;
  /** code -> the party's own chat (see the end of this file). */
  chat: Map<string, PartyChatLine[]>;
  redis: Redis | null | undefined;
  cleanup: ReturnType<typeof setInterval> | null;
}

const shared = ((globalThis as { __watchPartyStore?: Shared }).__watchPartyStore ??= {
  parties: new Map(),
  seen: new Map(),
  chat: new Map(),
  redis: undefined,
  cleanup: null,
});
const parties = shared.parties;

/** Null when there is no REDIS_URL (tests, local dev): the store is then memory only. */
function redis(): Redis | null {
  if (shared.redis !== undefined) return shared.redis;
  const url = (process.env as Record<string, string | undefined>).REDIS_URL;
  if (!url) {
    shared.redis = null;
    return null;
  }
  // Commands wait for the connection (the offline queue). Without it the first read after
  // a restart was sent before the socket was up, failed, and answered "party not found",
  // which is exactly the moment the store exists for. A Redis that stays down fails each
  // command after two tries and the party falls back to memory.
  const client = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 3000 });
  // Without a listener ioredis throws on a dropped connection; a party must not need Redis.
  client.on('error', () => undefined);
  shared.redis = client;
  return client;
}

function revive(raw: string): WatchParty | undefined {
  try {
    const party = JSON.parse(raw) as WatchParty;
    if (typeof party.code !== 'string' || !Array.isArray(party.members)) return undefined;
    party.createdAt = new Date(party.createdAt);
    party.members = party.members.map((m) => ({ ...m, joinedAt: new Date(m.joinedAt) }));
    return Number.isNaN(party.createdAt.getTime()) ? undefined : party;
  } catch {
    return undefined;
  }
}

/**
 * Get a party by code: from memory, else from Redis (a party made before a restart).
 */
export async function getParty(code: string): Promise<WatchParty | undefined> {
  const held = parties.get(code);
  if (held) return held;
  const client = redis();
  if (!client) return undefined;
  try {
    const raw = await client.get(REDIS_PREFIX + code);
    if (!raw) return undefined;
    const party = revive(raw);
    if (!party) return undefined;
    // Another request may have loaded it while this one waited.
    const raced = parties.get(code);
    if (raced) return raced;
    parties.set(code, party);
    return party;
  } catch {
    return undefined;
  }
}

/**
 * Set/update a party
 */
export function setParty(code: string, party: WatchParty): void {
  parties.set(code, party);
  const client = redis();
  if (!client) return;
  const ttl = Math.max(60, Math.ceil((party.createdAt.getTime() + PARTY_TTL_MS - Date.now()) / 1000));
  client.set(REDIS_PREFIX + code, JSON.stringify(party), 'EX', ttl).catch(() => undefined);
}

/**
 * Delete a party
 */
export function deleteParty(code: string): boolean {
  shared.seen.delete(code);
  shared.chat.delete(code);
  const client = redis();
  if (client) client.del(REDIS_PREFIX + code, CHAT_PREFIX + code).catch(() => undefined);
  return parties.delete(code);
}

/**
 * Check if a party is held in memory
 */
export function hasParty(code: string): boolean {
  return parties.has(code);
}

/**
 * Get all party codes
 */
export function getAllPartyCodes(): string[] {
  return Array.from(parties.keys());
}

/**
 * Get party count
 */
export function getPartyCount(): number {
  return parties.size;
}

/** A member polled: they are still here. */
export function touchMember(code: string, memberId: string, now = Date.now()): void {
  let seen = shared.seen.get(code);
  if (!seen) {
    seen = new Map();
    shared.seen.set(code, seen);
  }
  seen.set(memberId, now);
}

/**
 * Members who stopped polling have closed the tab: drop them, or the list only ever
 * grows and a party fills up with people who left. The host is never dropped (their
 * party ends when they say so, not when their laptop sleeps), and a member this process
 * has never heard from is given a full interval first, so a restart empties nobody.
 */
export function pruneStaleMembers(party: WatchParty, now = Date.now()): WatchParty {
  let seen = shared.seen.get(party.code);
  if (!seen) {
    seen = new Map();
    shared.seen.set(party.code, seen);
  }
  const keep = party.members.filter((m) => {
    if (m.isHost) return true;
    const last = seen.get(m.id);
    if (last === undefined) {
      seen.set(m.id, now);
      return true;
    }
    return now - last <= MEMBER_STALE_MS;
  });
  if (keep.length === party.members.length) return party;
  for (const m of party.members) if (!keep.includes(m)) seen.delete(m.id);
  return { ...party, members: keep };
}

// ---------------------------------------------------------------------------
// The party's own chat
// ---------------------------------------------------------------------------

export interface PartyChatLine {
  id: string;
  authorName: string;
  body: string;
  /** ISO time, strictly increasing within a party so `after` never skips a line. */
  createdAt: string;
}

const CHAT_KEEP = 200;
const CHAT_PREFIX = 'watch-party-chat:';

async function chatOf(code: string): Promise<PartyChatLine[]> {
  const held = shared.chat.get(code);
  if (held) return held;
  let lines: PartyChatLine[] = [];
  const client = redis();
  if (client) {
    try {
      const raw = await client.lrange(CHAT_PREFIX + code, -CHAT_KEEP, -1);
      lines = raw.flatMap((r) => {
        try {
          return [JSON.parse(r) as PartyChatLine];
        } catch {
          return [];
        }
      });
    } catch {
      lines = [];
    }
  }
  const raced = shared.chat.get(code);
  if (raced) return raced;
  shared.chat.set(code, lines);
  return lines;
}

/** Lines after `after` (an ISO time), oldest first; all of them without it. */
export async function readPartyChat(code: string, after?: string): Promise<PartyChatLine[]> {
  const lines = await chatOf(code);
  return after ? lines.filter((l) => l.createdAt > after) : lines;
}

export async function addPartyChat(code: string, authorName: string, body: string): Promise<PartyChatLine> {
  const lines = await chatOf(code);
  const last = lines[lines.length - 1]?.createdAt;
  let at = new Date();
  // Two lines in the same millisecond would share a time and one would be skipped by `after`.
  if (last && at.toISOString() <= last) at = new Date(new Date(last).getTime() + 1);
  const line: PartyChatLine = {
    id: `${at.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    authorName,
    body,
    createdAt: at.toISOString(),
  };
  lines.push(line);
  if (lines.length > CHAT_KEEP) lines.splice(0, lines.length - CHAT_KEEP);
  const client = redis();
  if (client) {
    client
      .multi()
      .rpush(CHAT_PREFIX + code, JSON.stringify(line))
      .ltrim(CHAT_PREFIX + code, -CHAT_KEEP, -1)
      .expire(CHAT_PREFIX + code, PARTY_TTL_MS / 1000)
      .exec()
      .catch(() => undefined);
  }
  return line;
}

/**
 * Clean up old parties (older than TTL)
 * Parties are deleted if they are strictly older than 24 hours (not at exactly 24 hours)
 */
export function cleanupOldParties(): number {
  const now = Date.now();
  const cutoffTime = now - PARTY_TTL_MS;
  let cleaned = 0;

  for (const [code, party] of parties.entries()) {
    // Use < to ensure parties exactly at 24 hours are NOT deleted
    // Only delete if createdAt is strictly before the cutoff
    if (party.createdAt.getTime() < cutoffTime) {
      parties.delete(code);
      shared.seen.delete(code);
      shared.chat.delete(code);
      cleaned++;
    }
  }

  return cleaned;
}

// Cleanup interval (runs every hour)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Start the automatic cleanup interval
 */
export function startCleanupInterval(): void {
  if (shared.cleanup !== null) {
    return; // Already running
  }
  shared.cleanup = setInterval(() => {
    const cleaned = cleanupOldParties();
    if (cleaned > 0) {
      console.log(`[watch-party] Cleaned up ${cleaned} expired parties`);
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent Node.js from exiting if this is the only timer
  if (shared.cleanup.unref) {
    shared.cleanup.unref();
  }
}

/**
 * Stop the automatic cleanup interval
 */
export function stopCleanupInterval(): void {
  if (shared.cleanup !== null) {
    clearInterval(shared.cleanup);
    shared.cleanup = null;
  }
}

// Auto-start cleanup on module load
startCleanupInterval();
