/**
 * Vault errors. A locked vault is never a crash: callers turn it into a 423 with
 * a clear "unlock to resume" message, and background work for that user pauses.
 */

export type VaultLockReason = 'vault_missing' | 'vault_locked' | 'legacy_unmigrated';

const MESSAGES: Record<VaultLockReason, string> = {
  vault_missing:
    'Set up your key vault first (Settings > Key vault). Your keys and passwords are sealed with a passphrase only you know.',
  vault_locked: 'Your key vault is locked: unlock it in Settings > Key vault to resume.',
  legacy_unmigrated:
    'This secret was stored under the old server key. Unlock your key vault (Settings > Key vault) once to re-seal it, then it works again.',
};

export class VaultLockedError extends Error {
  readonly code: VaultLockReason;
  readonly status = 423;

  constructor(code: VaultLockReason = 'vault_locked', message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'VaultLockedError';
    this.code = code;
  }
}

export function isVaultLockedError(err: unknown): err is VaultLockedError {
  return err instanceof VaultLockedError || (err as { name?: string } | null)?.name === 'VaultLockedError';
}

/** JSON body + status for a locked vault, or null when the error is something else. */
export function vaultErrorBody(err: unknown): { body: { error: string; code: VaultLockReason; locked: true }; status: 423 } | null {
  if (!isVaultLockedError(err)) return null;
  return { body: { error: err.message, code: err.code, locked: true }, status: 423 };
}
