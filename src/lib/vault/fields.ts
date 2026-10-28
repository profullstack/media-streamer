/**
 * Field-level sealing for user secrets stored in text columns.
 *
 * A sealed column value is `ss2:<base64url(JSON CipherBlob)>` (seal_version 2).
 * The AES-GCM AAD binds app + scope + owner user id + field name, so a value
 * copied onto another user or column does not open.
 *
 * Sealing and opening on the server both need the owner's data key from the
 * in-memory unlock store. While the owner is locked, both throw
 * VaultLockedError: saves ask the user to unlock, and jobs pause.
 */

import { isCipherBlob, type CipherBlob } from '@profullstack/sealed-secrets';

import { VaultLockedError } from './errors';
import { sealer } from './sealer';
import { dataKeyFor } from './unlock';

export const SEALED_PREFIX = 'ss2:';

export function isSealedValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(SEALED_PREFIX);
}

function encodeBlob(blob: CipherBlob): string {
  return SEALED_PREFIX + Buffer.from(JSON.stringify(blob), 'utf8').toString('base64url');
}

function decodeBlob(value: string): CipherBlob {
  const parsed: unknown = JSON.parse(Buffer.from(value.slice(SEALED_PREFIX.length), 'base64url').toString('utf8'));
  if (!isCipherBlob(parsed)) throw new Error('invalid sealed value');
  return parsed;
}

/** Seal with an explicit data key (migration, tests). */
export async function sealWithKey(dek: Uint8Array, ownerId: string, field: string, plaintext: string): Promise<string> {
  return encodeBlob(await sealer.sealSecrets(dek, { v: plaintext }, ownerId, field));
}

/** Open with an explicit data key (migration, tests). */
export async function openWithKey(dek: Uint8Array, ownerId: string, field: string, value: string): Promise<string> {
  const map = await sealer.unsealSecrets(dek, decodeBlob(value), ownerId, field);
  return map.v ?? '';
}

function requireKey(ownerId: string): Uint8Array {
  const dek = dataKeyFor(ownerId);
  if (!dek) throw new VaultLockedError('vault_locked');
  return dek;
}

/** Seal a new secret for its owner. Throws VaultLockedError while locked. */
export async function sealValue(ownerId: string, field: string, plaintext: string): Promise<string> {
  return sealWithKey(requireKey(ownerId), ownerId, field, plaintext);
}

/** Seal when a non-empty secret is present; pass null/blank through as null. */
export async function sealOptional(
  ownerId: string,
  field: string,
  plaintext: string | null | undefined
): Promise<string | null> {
  const trimmed = plaintext?.trim();
  return trimmed ? sealValue(ownerId, field, trimmed) : null;
}

/**
 * Open a stored secret just before use. null/empty -> null. A legacy
 * (server-key or plaintext) value is never used at runtime: it throws
 * `legacy_unmigrated` until the owner unlocks and the migration re-seals it.
 */
export async function openOptional(
  ownerId: string,
  field: string,
  value: string | null | undefined
): Promise<string | null> {
  if (value == null || value.length === 0) return null;
  if (!isSealedValue(value)) throw new VaultLockedError('legacy_unmigrated');
  return openWithKey(requireKey(ownerId), ownerId, field, value);
}

export async function openValue(ownerId: string, field: string, value: string): Promise<string> {
  const out = await openOptional(ownerId, field, value);
  if (out == null) throw new Error(`missing secret ${field}`);
  return out;
}
