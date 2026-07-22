/**
 * VOD Monetization — public API. See docs/prds/vod-monetization.md.
 */

export * from './types';
export { VodError } from './errors';
export { vodViewerCookieName, generateViewerKey, hashViewerKey } from './pass';
export { MAX_SYNC_TITLES } from './sync';
export type { SyncResult } from './sync';
export {
  createProvider,
  listProviders,
  getProvider,
  updateProvider,
  deleteProvider,
  syncProvider,
  getProviderActivity,
  isProviderOpen,
  toPublicProvider,
  getPublicProvider,
  isProviderOwnedBy,
  browseCatalog,
  createCheckout,
  getGrantStatus,
  resolveAccess,
  getAccessSummary,
  streamTitle,
  downloadTitle,
  handleVodWebhook,
  type VodCheckoutResult,
  type ViewerAccess,
  type WebhookOutcome,
} from './service';
