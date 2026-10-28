export { sealer, LOST_PASSPHRASE_COPY, VAULT_APP, VAULT_SCOPE } from './sealer';
export { VaultLockedError, isVaultLockedError, vaultErrorBody, type VaultLockReason } from './errors';
export { unlockStore, dataKeyFor, ttlSeconds } from './unlock';
export {
  SEALED_PREFIX,
  isSealedValue,
  sealValue,
  sealOptional,
  openOptional,
  openValue,
  sealWithKey,
  openWithKey,
} from './fields';
export { isLegacyValue, legacyMigrationEnabled } from './legacy';
export { FIELDS, migrateLegacySecrets } from './migrate';
export { getVaultSeal, createVaultSeal, replaceVaultSeal } from './repository';
export { withVaultErrors } from './route';
