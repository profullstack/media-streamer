/**
 * CoinPayPortal Client
 * 
 * Client library for CoinPayPortal API integration
 */

import crypto from 'crypto';
import type {
  CoinPayPortalConfig,
  CryptoBlockchain,
  PaymentResponse,
  PaymentStatusResponse,
  WebhookPayload,
} from './types';

const DEFAULT_BASE_URL = 'https://coinpayportal.com/api';
const DEFAULT_PORTAL_URL = 'https://coinpayportal.com';

export class CoinPayPortalClient {
  private apiKey: string;
  private businessId: string;
  private webhookSecret: string;
  private baseUrl: string;
  private portalUrl: string;

  constructor(config: CoinPayPortalConfig) {
    this.apiKey = config.apiKey;
    this.businessId = config.businessId;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.portalUrl = config.baseUrl?.replace('/api', '') || DEFAULT_PORTAL_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Parse response body
    const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; message?: string };

    // Handle HTTP errors
    if (!response.ok) {
      const errorMessage = data.error || data.message || response.statusText;
      throw new Error(
        `CoinPayPortal API error: ${response.status} - ${errorMessage}`
      );
    }

    // Handle API-level errors (success: false with 200 status)
    if (data.success === false && data.error) {
      throw new Error(`CoinPayPortal API error: ${data.error}`);
    }

    return data as T;
  }

  /**
   * Create a new payment request
   */
  async createPayment(params: {
    amount: number;
    blockchain: CryptoBlockchain;
    description?: string;
    metadata?: Record<string, string>;
    webhookUrl?: string;
    redirectUrl?: string;
  }): Promise<PaymentResponse & { paymentUrl: string }> {
    const payload = {
      business_id: this.businessId,
      amount: params.amount,
      currency: 'USD',
      blockchain: params.blockchain,
      description: params.description,
      metadata: params.metadata,
      webhook_url: params.webhookUrl,
      redirect_url: params.redirectUrl,
    };

    const response = await this.request<PaymentResponse>('/payments/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    // Add the hosted payment page URL
    return {
      ...response,
      paymentUrl: `${this.portalUrl}/pay/${response.payment.id}`,
    };
  }

  /**
   * Get payment status by ID
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    return this.request<PaymentStatusResponse>(`/payments/${paymentId}`);
  }

  /**
   * Get the hosted payment page URL for a payment
   */
  getPaymentUrl(paymentId: string): string {
    return `${this.portalUrl}/pay/${paymentId}`;
  }

  /**
   * Verify webhook signature
   * Signature format: t=timestamp,v1=signature
   */
  verifyWebhookSignature(payload: string, signature: string, tolerance: number = 300): boolean {
    try {
      // Parse signature header (format: t=timestamp,v1=signature)
      const parts = signature.split(',');
      const signatureParts: Record<string, string> = {};
      
      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key && value) {
          signatureParts[key] = value;
        }
      }

      const timestamp = signatureParts.t;
      const expectedSignature = signatureParts.v1;

      if (!timestamp || !expectedSignature) {
        console.error('Invalid signature format: missing timestamp or signature');
        return false;
      }

      // Check timestamp tolerance (prevent replay attacks)
      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
      if (Math.abs(timestampAge) > tolerance) {
        console.error('Webhook timestamp outside tolerance window');
        return false;
      }

      // Compute expected signature using timestamp.payload format
      const signedPayload = `${timestamp}.${payload}`;
      const computedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(signedPayload)
        .digest('hex');

      // Timing-safe comparison - convert hex strings to buffers
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const computedBuffer = Buffer.from(computedSignature, 'hex');

      // Check buffer lengths match before timing-safe comparison
      if (expectedBuffer.length !== computedBuffer.length) {
        console.error('Signature length mismatch');
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, computedBuffer);
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Parse and verify webhook payload
   */
  parseWebhook(rawBody: string, signature: string): WebhookPayload | null {
    if (!this.verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid webhook signature');
      return null;
    }

    try {
      return JSON.parse(rawBody) as WebhookPayload;
    } catch (error) {
      console.error('Failed to parse webhook payload:', error);
      return null;
    }
  }
}

// Singleton instance
let client: CoinPayPortalClient | null = null;

export function getCoinPayPortalClient(): CoinPayPortalClient {
  if (!client) {
    const apiKey = process.env.COINPAYPORTAL_API_KEY;
    const businessId = process.env.NEXT_PUBLIC_COINPAYPORTAL_MERCHANT_ID;
    const webhookSecret = process.env.COINPAYPORTAL_WEBHOOK_SECRET || '';

    if (!apiKey) {
      throw new Error(
        'Missing CoinPayPortal configuration. Please set COINPAYPORTAL_API_KEY environment variable.'
      );
    }

    if (!businessId) {
      throw new Error(
        'Missing CoinPayPortal configuration. Please set NEXT_PUBLIC_COINPAYPORTAL_MERCHANT_ID environment variable.'
      );
    }

    client = new CoinPayPortalClient({
      apiKey,
      businessId,
      webhookSecret,
      baseUrl: process.env.COINPAYPORTAL_API_URL,
    });
  }

  return client;
}

// Reset client (for testing)
export function resetCoinPayPortalClient(): void {
  client = null;
}

export type { CryptoBlockchain };
