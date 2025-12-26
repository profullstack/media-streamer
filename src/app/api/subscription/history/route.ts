/**
 * Subscription Payment History API Route
 *
 * Returns the current user's payment history for subscription renewals.
 * This helps users track when they paid and when they need to renew.
 * 
 * Server-side only - maintains Supabase security rules.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPaymentHistoryRepository } from '@/lib/payments';

/**
 * Payment history item for response
 */
interface PaymentHistoryItem {
  id: string;
  plan: string;
  amountUsd: number;
  amountCrypto: string | null;
  cryptoCurrency: string | null;
  blockchain: string | null;
  txHash: string | null;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Payment history response
 */
interface PaymentHistoryResponse {
  payments: PaymentHistoryItem[];
  total: number;
}

/**
 * GET /api/subscription/history
 *
 * Get current user's payment history
 */
export async function GET(): Promise<NextResponse<PaymentHistoryResponse | { error: string }>> {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get payment history repository
    const paymentRepo = getPaymentHistoryRepository();

    // Get user's payment history
    const payments = await paymentRepo.getUserPayments(user.id);

    // Transform to response format
    const paymentItems: PaymentHistoryItem[] = payments.map((payment) => ({
      id: payment.id,
      plan: payment.plan,
      amountUsd: payment.amount_usd,
      amountCrypto: payment.amount_crypto,
      cryptoCurrency: payment.crypto_currency,
      blockchain: payment.blockchain,
      txHash: payment.tx_hash,
      status: payment.status,
      periodStart: payment.period_start,
      periodEnd: payment.period_end,
      createdAt: payment.created_at,
      completedAt: payment.completed_at,
    }));

    return NextResponse.json(
      {
        payments: paymentItems,
        total: paymentItems.length,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Payment history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500 }
    );
  }
}
