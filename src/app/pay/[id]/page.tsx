'use client';

/**
 * Custom Payment Page
 *
 * Shows crypto payment details with copy buttons and polls for status updates.
 * Replaces the external CoinPayPortal hosted payment page.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

/** Crypto display names and symbols */
const cryptoInfo: Record<string, { name: string; symbol: string }> = {
  BTC: { name: 'Bitcoin', symbol: '₿' },
  ETH: { name: 'Ethereum', symbol: 'Ξ' },
  LTC: { name: 'Litecoin', symbol: 'Ł' },
  SOL: { name: 'Solana', symbol: '◎' },
  POL: { name: 'Polygon', symbol: '⬡' },
  MATIC: { name: 'Polygon', symbol: '⬡' },
  USDT: { name: 'Tether', symbol: '₮' },
  USDC: { name: 'USD Coin', symbol: '$' },
  USDC_ETH: { name: 'USDC (Ethereum)', symbol: '$' },
  USDC_POL: { name: 'USDC (Polygon)', symbol: '$' },
  USDC_SOL: { name: 'USDC (Solana)', symbol: '$' },
};

interface PaymentStatus {
  status: string;
  txHash: string | null;
  amountCrypto: string | null;
  amountUsd: number;
  cryptoCurrency: string | null;
  blockchain: string | null;
  paymentAddress: string | null;
  plan: string;
  createdAt: string;
  completedAt: string | null;
}

/** Status step config */
const statusSteps = [
  { key: 'pending', label: 'Waiting for payment' },
  { key: 'detected', label: 'Payment detected' },
  { key: 'confirmed', label: 'Payment confirmed' },
  { key: 'forwarded', label: 'Complete' },
];

function getStepIndex(status: string): number {
  const idx = statusSteps.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function CopyButton({ text, label }: { text: string; label?: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
        copied
          ? 'border-status-success bg-status-success/10 text-status-success'
          : 'border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      )}
      title={`Copy ${label || 'to clipboard'}`}
    >
      {copied ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function StatusStepper({ currentStatus }: { currentStatus: string }): React.ReactElement {
  const currentIdx = getStepIndex(currentStatus);
  const isFailed = currentStatus === 'failed';
  const isExpired = currentStatus === 'expired';

  return (
    <div className="flex items-center justify-between w-full">
      {statusSteps.map((step, idx) => {
        const isComplete = idx < currentIdx || currentStatus === 'forwarded';
        const isCurrent = idx === currentIdx && !isFailed && !isExpired;
        const isActive = isComplete || isCurrent;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                  isComplete
                    ? 'border-status-success bg-status-success text-white'
                    : isCurrent
                      ? 'border-accent-primary bg-accent-primary/20 text-accent-primary animate-pulse'
                      : 'border-border-default bg-bg-tertiary text-text-muted'
                )}
              >
                {isComplete ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span className={cn(
                'mt-1.5 text-[10px] font-medium text-center max-w-[80px]',
                isActive ? 'text-text-primary' : 'text-text-muted'
              )}>
                {step.label}
              </span>
            </div>
            {idx < statusSteps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-2 mt-[-18px]',
                  idx < currentIdx ? 'bg-status-success' : 'bg-border-default'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PaymentPage(): React.ReactElement {
  const router = useRouter();
  const { id: paymentId } = useParams<{ id: string }>();
  const [paymentData, setPaymentData] = useState<PaymentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTerminal = paymentData?.status
    ? ['confirmed', 'forwarded', 'failed', 'expired'].includes(paymentData.status)
    : false;

  const isSuccess = paymentData?.status === 'confirmed' || paymentData?.status === 'forwarded';

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/payments/${paymentId}/status`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Failed to fetch payment status');
      }
      const data = (await response.json()) as PaymentStatus;
      setPaymentData(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch payment status');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [paymentId]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll every 5 seconds while not terminal
  useEffect(() => {
    if (isTerminal) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isTerminal, fetchStatus]);

  // Redirect countdown on success
  useEffect(() => {
    if (isSuccess && redirectCountdown === null) {
      setRedirectCountdown(5);
    }
  }, [isSuccess, redirectCountdown]);

  useEffect(() => {
    if (redirectCountdown === null || redirectCountdown <= 0) {
      if (redirectCountdown === 0) {
        router.push('/account?payment=success');
      }
      return;
    }

    redirectRef.current = setInterval(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (redirectRef.current) {
        clearInterval(redirectRef.current);
        redirectRef.current = null;
      }
    };
  }, [redirectCountdown, router]);

  const chain = paymentData?.blockchain || paymentData?.cryptoCurrency || '';
  const info = cryptoInfo[chain.toUpperCase()] || { name: chain, symbol: '●' };

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" />
            <p className="text-text-muted text-sm">Loading payment details...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error && !paymentData) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="rounded-xl border border-status-error bg-status-error/10 p-8 text-center max-w-md">
            <p className="text-status-error font-medium mb-2">Payment Not Found</p>
            <p className="text-sm text-text-muted mb-4">{error}</p>
            <button
              onClick={() => router.push('/pricing')}
              className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
            >
              Back to Pricing
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex justify-center py-8 px-4">
        <div className="w-full max-w-lg space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-accent-primary/10 mb-4">
              <span className="text-3xl">{info.symbol}</span>
            </div>
            <h1 className="text-xl font-bold text-text-primary">
              {isSuccess ? 'Payment Complete!' : isTerminal ? 'Payment ' + paymentData?.status : 'Complete Your Payment'}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              {paymentData?.plan
                ? `${paymentData.plan.charAt(0).toUpperCase() + paymentData.plan.slice(1)} Plan`
                : 'Subscription'}
              {' • '}
              {info.name}
            </p>
          </div>

          {/* Success State */}
          {isSuccess ? <div className="rounded-xl border border-status-success bg-status-success/10 p-6 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-status-success mb-3">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p className="font-medium text-status-success text-lg">Payment Confirmed!</p>
              <p className="text-sm text-status-success/80 mt-1">
                Your subscription is being activated.
              </p>
              {redirectCountdown !== null && redirectCountdown > 0 && (
                <p className="text-xs text-text-muted mt-3">
                  Redirecting in {redirectCountdown}s...{' '}
                  <button
                    onClick={() => router.push('/account?payment=success')}
                    className="text-accent-primary hover:underline"
                  >
                    Go now
                  </button>
                </p>
              )}
            </div> : null}

          {/* Failed/Expired State */}
          {(paymentData?.status === 'failed' || paymentData?.status === 'expired') && (
            <div className="rounded-xl border border-status-error bg-status-error/10 p-6 text-center">
              <p className="font-medium text-status-error text-lg">
                {paymentData.status === 'expired' ? 'Payment Expired' : 'Payment Failed'}
              </p>
              <p className="text-sm text-text-muted mt-2">
                {paymentData.status === 'expired'
                  ? 'This payment has expired. Please start a new payment.'
                  : 'Something went wrong with this payment. Please try again.'}
              </p>
              <button
                onClick={() => router.push('/pricing')}
                className="mt-4 rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Status Stepper */}
          {!isTerminal && (
            <div className="rounded-xl border border-border-subtle bg-bg-secondary p-5">
              <StatusStepper currentStatus={paymentData?.status || 'pending'} />
            </div>
          )}

          {/* Payment Details (only show when waiting/detected) */}
          {!isTerminal && paymentData ? <div className="rounded-xl border border-border-subtle bg-bg-secondary p-5 space-y-5">
              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">
                  Send Exactly
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 rounded-lg border border-border-default bg-bg-tertiary px-4 py-3">
                    <span className="text-xl font-bold text-text-primary font-mono">
                      {paymentData.amountCrypto || '—'}
                    </span>
                    <span className="text-sm text-text-muted ml-2">
                      {chain.toUpperCase()}
                    </span>
                  </div>
                  {paymentData.amountCrypto ? <CopyButton text={paymentData.amountCrypto} label="amount" /> : null}
                </div>
                <p className="text-xs text-text-muted mt-1.5">
                  ≈ {formatCurrency(paymentData.amountUsd)}
                </p>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">
                  To Address
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 rounded-lg border border-border-default bg-bg-tertiary px-4 py-3 min-w-0">
                    <p className="text-sm text-text-primary font-mono break-all leading-relaxed">
                      {paymentData.paymentAddress || '—'}
                    </p>
                  </div>
                  {paymentData.paymentAddress ? <CopyButton text={paymentData.paymentAddress} label="address" /> : null}
                </div>
              </div>

              {/* Warning */}
              <div className="rounded-lg bg-status-warning/10 border border-status-warning/20 p-3">
                <p className="text-xs text-status-warning">
                  ⚠️ Send the exact amount to the exact address above. Sending the wrong amount or to the wrong address may result in lost funds.
                </p>
              </div>
            </div> : null}

          {/* Polling indicator */}
          {!isTerminal && (
            <div className="flex items-center justify-center gap-2 text-text-muted">
              <div className="h-2 w-2 rounded-full bg-accent-primary animate-pulse" />
              <span className="text-xs">Listening for payment...</span>
            </div>
          )}

          {/* TX Hash if available */}
          {paymentData?.txHash ? <div className="rounded-xl border border-border-subtle bg-bg-secondary p-4">
              <label className="block text-xs font-medium text-text-muted mb-1 uppercase tracking-wider">
                Transaction Hash
              </label>
              <div className="flex items-center gap-3">
                <p className="text-xs text-text-primary font-mono break-all flex-1">
                  {paymentData.txHash}
                </p>
                <CopyButton text={paymentData.txHash} label="tx hash" />
              </div>
            </div> : null}
        </div>
      </div>
    </MainLayout>
  );
}
