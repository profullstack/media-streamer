/**
 * ArgonTV Module
 *
 * IPTV reseller API integration for ArgonTV
 */

export { ArgonTVClient, getArgonTVClient, resetArgonTVClient } from './client';
export {
  // Package constants
  ARGONTV_PACKAGES,
  PACKAGE_DURATION_DAYS,
  IPTV_PACKAGE_PRICES,
  
  // Types
  type ArgonTVConfig,
  type ArgonTVPackageKey,
  type ArgonTVPackageId,
  type CreateLineRequest,
  type CreateLineResponse,
  type CreateLineErrorResponse,
  type ExtendLineRequest,
  type ExtendLineResponse,
  type ExtendLineErrorResponse,
  type GetLineResponse,
  type GetLineErrorResponse,
  type Template,
  type GetTemplatesResponse,
  type IPTVSubscription,
  type IPTVSubscriptionStatus,
  type CreateIPTVSubscriptionInput,
  type ExtendIPTVSubscriptionInput,
  type IPTVPaymentType,
  type IPTVPaymentMetadata,
  type IPTVPackagePrice,
  
  // Utility functions
  getPackageDisplayName,
  getPackagePrice,
  getAllPackagePrices,
  isValidPackageKey,
} from './types';

export {
  // Repository
  createIPTVSubscriptionRepository,
  getIPTVSubscriptionRepository,
  resetIPTVSubscriptionRepository,
  
  // Repository types
  type IPTVSubscriptionRepository,
  type CreateSubscriptionData,
  type CreatePaymentData,
  type UpdatePaymentStatusData,
  type GetUserPaymentsOptions,
} from './repository';

export {
  // Service
  createIPTVSubscriptionService,
  getIPTVSubscriptionService,
  resetIPTVSubscriptionService,
  
  // Service types
  type IPTVSubscriptionService,
  type UserSubscriptionInfo,
  type PaymentCompletionResult,
} from './service';
