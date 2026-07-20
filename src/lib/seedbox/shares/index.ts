/**
 * Seedbox Rental (pay-per-watch) — public API of the shares module.
 * See docs/prds/seedbox-pay-per-watch.md.
 */

export * from './types';
export { parseMagnet } from './magnet';
export {
  passCookieName,
  generateGrantToken,
  hashGrantToken,
  verifyGrantToken,
  buildPassCookieValue,
  parsePassCookieValue,
  generateShareSlug,
} from './pass';
export {
  RentalError,
  ownerSeedboxReady,
  createRental,
  listRentals,
  getRental,
  updateRental,
  deleteRental,
  getRentalActivity,
  isShareOpen,
  toPublicShare,
  getPublicShare,
  isShareOwnedBy,
  mintOwnerPass,
  createCheckout,
  resolvePass,
  getGrantStatus,
  addDownload,
  listDownloadsWithProgress,
  listDownloadFiles,
  streamForPass,
  type PlayableFile,
  handleShareWebhook,
  type CheckoutResult,
  type PassResolution,
  type DownloadProgress,
  type WebhookOutcome,
} from './service';
