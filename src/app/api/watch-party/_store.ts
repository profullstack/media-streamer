/**
 * Watch Party In-Memory Store
 *
 * Simple in-memory storage for watch parties.
 * For production, this should be replaced with a database.
 */

import type { WatchParty } from '@/lib/watch-party';

// In-memory party storage
const parties = new Map<string, WatchParty>();

// Party TTL (24 hours)
const PARTY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Get a party by code
 */
export function getParty(code: string): WatchParty | undefined {
  return parties.get(code);
}

/**
 * Set/update a party
 */
export function setParty(code: string, party: WatchParty): void {
  parties.set(code, party);
}

/**
 * Delete a party
 */
export function deleteParty(code: string): boolean {
  return parties.delete(code);
}

/**
 * Check if a party exists
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

/**
 * Clean up old parties (older than TTL)
 */
export function cleanupOldParties(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [code, party] of parties.entries()) {
    if (now - party.createdAt.getTime() > PARTY_TTL_MS) {
      parties.delete(code);
      cleaned++;
    }
  }

  return cleaned;
}
