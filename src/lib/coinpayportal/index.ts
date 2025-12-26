/**
 * CoinPayPortal Module
 *
 * Client library for CoinPayPortal API integration
 */

export { CoinPayPortalClient, getCoinPayPortalClient, resetCoinPayPortalClient } from './client';
export type {
  CoinPayPortalConfig,
  CryptoBlockchain,
  CreatePaymentRequest,
  PaymentResponse,
  PaymentStatusResponse,
  WebhookPayload,
} from './types';

// Webhook handler exports (server-side only)
export {
  createWebhookHandler,
  getWebhookHandler,
  resetWebhookHandler,
  type WebhookHandler,
  type WebhookHandlerResult,
} from './webhook-handler';
