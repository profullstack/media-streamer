/**
 * Payment Status API Route
 *
 * Returns real-time payment status by polling CoinPayPortal.
 * Used by our custom /pay/[id] page to show live status updates.
 *
 * @route GET /api/payments/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPaymentHistoryRepository } from '@/lib/payments';
import { getIPTVSubscriptionRepository } from '@/lib/argontv';
import { getCoinPayPortalClient } from '@/lib/coinpayportal';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: paymentId } = await params;

    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Look up payment in subscription payment_history first, then IPTV
    const paymentRepo = getPaymentHistoryRepository();
    const iptvRepo = getIPTVSubscriptionRepository();

    const payment = await paymentRepo.getPaymentByExternalId(paymentId);
    let isIptv = false;
    let iptvPayment: Awaited<ReturnType<typeof iptvRepo.getPaymentByExternalId>> = null;

    if (!payment) {
      // Try IPTV payment table
      iptvPayment = await iptvRepo.getPaymentByExternalId(paymentId);
      if (iptvPayment) {
        isIptv = true;
      }
    }

    const record = payment || iptvPayment;
    if (!record) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (record.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Normalize fields across both tables
    const dbStatus = record.status;
    const dbTxHash = record.tx_hash;
    const dbAmountCrypto = record.amount_crypto;
    const dbAmountUsd = record.amount_usd;
    const dbCryptoCurrency = record.crypto_currency;
    const dbBlockchain = record.blockchain;
    const dbPaymentAddress = record.payment_address;
    const dbPlan = isIptv && iptvPayment ? (iptvPayment as Record<string, unknown>).package_key as string || 'iptv' : payment?.plan || 'unknown';
    const dbCreatedAt = record.created_at;
    const dbCompletedAt = record.completed_at;

    // If payment is already in a terminal state, return from DB
    const terminalStatuses = ['confirmed', 'forwarded', 'failed', 'expired'];
    if (terminalStatuses.includes(dbStatus)) {
      return NextResponse.json({
        status: dbStatus,
        txHash: dbTxHash,
        amountCrypto: dbAmountCrypto,
        amountUsd: dbAmountUsd,
        cryptoCurrency: dbCryptoCurrency,
        blockchain: dbBlockchain,
        paymentAddress: dbPaymentAddress,
        plan: dbPlan,
        createdAt: dbCreatedAt,
        completedAt: dbCompletedAt,
      });
    }

    // Poll CoinPayPortal for latest status
    try {
      const client = getCoinPayPortalClient();
      const externalStatus = await client.getPaymentStatus(paymentId);

      if (externalStatus.success && externalStatus.payment) {
        const ep = externalStatus.payment;

        // Update our DB if status changed
        if (ep.status && ep.status !== dbStatus) {
          try {
            if (isIptv) {
              // Map CoinPayPortal statuses to IPTV-compatible statuses
              const iptvStatus = ep.status === 'forwarded' || ep.status === 'forwarding'
                ? 'confirmed'
                : ep.status;
              await iptvRepo.updatePaymentStatus(paymentId, {
                status: iptvStatus as 'pending' | 'detected' | 'confirmed' | 'failed' | 'expired',
                txHash: ep.tx_hash ?? undefined,
                amountCrypto: ep.crypto_amount ?? undefined,
              });
            } else {
              await paymentRepo.updatePaymentStatus(paymentId, {
                status: ep.status,
                txHash: ep.tx_hash ?? undefined,
                amountCrypto: ep.crypto_amount ?? undefined,
              });
            }
          } catch (updateErr) {
            console.error('[PaymentStatus] Failed to update DB status:', updateErr);
          }
        }

        return NextResponse.json({
          status: ep.status || dbStatus,
          txHash: ep.tx_hash || dbTxHash,
          amountCrypto: ep.crypto_amount || dbAmountCrypto,
          amountUsd: dbAmountUsd,
          cryptoCurrency: dbCryptoCurrency || ep.blockchain,
          blockchain: dbBlockchain || ep.blockchain,
          paymentAddress: ep.payment_address || dbPaymentAddress,
          plan: dbPlan,
          createdAt: dbCreatedAt,
          completedAt: dbCompletedAt,
        });
      }
    } catch (pollErr) {
      console.error('[PaymentStatus] Failed to poll CoinPayPortal:', pollErr);
      // Fall through to return DB state
    }

    // Return what we have from DB
    return NextResponse.json({
      status: dbStatus,
      txHash: dbTxHash,
      amountCrypto: dbAmountCrypto,
      amountUsd: dbAmountUsd,
      cryptoCurrency: dbCryptoCurrency,
      blockchain: dbBlockchain,
      paymentAddress: dbPaymentAddress,
      plan: dbPlan,
      createdAt: dbCreatedAt,
      completedAt: dbCompletedAt,
    });
  } catch (error) {
    console.error('[PaymentStatus] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment status' },
      { status: 500 }
    );
  }
}
