/**
 * Payments Module Exports
 */

export {
  createPaymentRequest,
  validatePaymentRequest,
  getSubscriptionPrice,
  formatCryptoAmount,
  parseCryptoAmount,
  generatePaymentId,
  createPaymentSession,
  getPaymentStatus,
  updatePaymentStatus,
  completePayment,
  cancelPayment,
  expirePayment,
  verifyWebhookSignature,
  processWebhookPayload,
  calculateSubscriptionExpiry,
  isSubscriptionActive,
  getSubscriptionDaysRemaining,
  formatSubscriptionExpiry,
} from './payments';

export type {
  PaymentRequest,
  PaymentSession,
  PaymentStatus,
  SubscriptionPlan,
  SubscriptionPrice,
  CryptoType,
  WebhookPayload,
  WebhookResult,
  CreatePaymentRequestOptions,
  CreatePaymentSessionOptions,
} from './payments';

// Repository exports (server-side only)
export {
  // Types
  type PaymentHistoryRepository,
  type CreatePaymentData,
  type UpdatePaymentStatusData,
  type GetUserPaymentsOptions,
  
  // Factory function
  createPaymentHistoryRepository,
  
  // Singleton accessors
  getPaymentHistoryRepository,
  resetPaymentHistoryRepository,
} from './repository';
