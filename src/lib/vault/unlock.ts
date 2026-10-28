/**
 * In-process unlock sessions: userId -> data key, with a TTL.
 *
 * The data key lives ONLY here: never in the database, Redis, disk, logs, error
 * reports or process.env. A restart empties the store, so every user's sealed
 * secrets are locked again until they unlock. One store per process, pinned on
 * globalThis so Next.js route bundles share it.
 */

import { UnlockStore, parseTtl, UNLOCK_DEFAULT_TTL_SECONDS } from '@profullstack/sealed-secrets';

const KEY = Symbol.for('bittorrented.vault.unlockStore');

type WithStore = typeof globalThis & { [KEY]?: UnlockStore };

export function unlockStore(): UnlockStore {
  const g = globalThis as WithStore;
  if (!g[KEY]) g[KEY] = new UnlockStore();
  return g[KEY]!;
}

/** Test hook: drop the store as a restart would. */
export function resetUnlockStoreForTests(): void {
  const g = globalThis as WithStore;
  g[KEY]?.lockAll();
  delete g[KEY];
}

/** The user's data key while unlocked, else null. Do not keep it past the current job. */
export function dataKeyFor(userId: string): Uint8Array | null {
  return unlockStore().get(userId);
}

/** Accepts "8h"/"7d"/seconds; default 8h, max 7d. */
export function ttlSeconds(input: unknown): number {
  if (input == null || input === '') return UNLOCK_DEFAULT_TTL_SECONDS;
  return parseTtl(String(input));
}
