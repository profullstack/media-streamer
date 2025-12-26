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
