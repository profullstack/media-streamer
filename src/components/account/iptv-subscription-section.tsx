'use client';

/**
 * IPTV Subscription Section Component
 *
 * Manages IPTV subscription display and purchase/extension in account settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useSupportedCoins } from '@/hooks/use-supported-coins';

/**
 * IPTV Package pricing info
 */
interface IPTVPackage {
  packageKey: string;
  packageId: number;
  durationDays: number;
  priceUsd: number;
  displayName: string;
}

/**
 * IPTV Subscription from API
 */
interface IPTVSubscription {
  id: string;
  argontv_line_id: number;
  username: string;
  password: string;
  m3u_download_link: string;
  package_key: string;
  status: string;
  created_at: string;
  expires_at: string;
  updated_at: string;
}

/**
 * IPTV Subscription response from API
 */
interface IPTVSubscriptionResponse {
  subscription: IPTVSubscription | null;
  isActive: boolean;
  daysRemaining: number;
  packages: IPTVPackage[];
}

/**
 * Payment response from API
 */
interface PaymentResponse {
  success: boolean;
  paymentUrl?: string;
  error?: string;
}

export function IPTVSubscriptionSection(): React.ReactElement {
  const { coins, isLoading: isLoadingCoins, error: coinsError } = useSupportedCoins();
  const [subscriptionData, setSubscriptionData] = useState<IPTVSubscriptionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string>('1_month');
  const [selectedCrypto, setSelectedCrypto] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);

  // Set default selected crypto when coins are loaded
  useEffect(() => {
    if (coins.length > 0 && !selectedCrypto) {
      setSelectedCrypto(coins[0].symbol);
    }
  }, [coins, selectedCrypto]);

  // Fetch IPTV subscription data
  const fetchSubscription = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/iptv/subscription');
      if (!response.ok) {
        throw new Error('Failed to fetch IPTV subscription');
      }
      const data = await response.json() as IPTVSubscriptionResponse;
      setSubscriptionData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load IPTV subscription');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Handle new subscription purchase
  const handlePurchase = async (): Promise<void> => {
    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch('/api/iptv/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageKey: selectedPackage,
          cryptoType: selectedCrypto,
        }),
      });

      const data = await response.json() as PaymentResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment');
      }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process payment');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle subscription extension
  const handleExtend = async (): Promise<void> => {
    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch('/api/iptv/subscription/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageKey: selectedPackage,
          cryptoType: selectedCrypto,
        }),
      });

      const data = await response.json() as PaymentResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create extension payment');
      }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process payment');
    } finally {
      setIsProcessing(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
        <span className="text-sm text-text-muted">Loading IPTV subscription...</span>
      </div>
    );
  }

  const hasSubscription = subscriptionData?.subscription !== null;
  const isActive = subscriptionData?.isActive ?? false;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">IPTV Subscription</h2>
      <p className="text-sm text-text-muted">
        Get access to live TV channels with our IPTV service powered by ArgonTV.
      </p>

      {error && (
        <div className="rounded-lg border border-status-error bg-status-error/10 p-4 text-sm text-status-error">
          {error}
        </div>
      )}

      {/* Current Subscription Status */}
      {hasSubscription && subscriptionData?.subscription && (
        <div className="rounded-lg border border-border-default bg-bg-tertiary p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-text-primary">Current IPTV Subscription</h3>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded',
              isActive
                ? 'bg-status-success/10 text-status-success'
                : 'bg-status-error/10 text-status-error'
            )}>
              {isActive ? 'Active' : 'Expired'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-text-muted">Package</p>
              <p className="text-text-primary font-medium">
                {subscriptionData.subscription.package_key.replace('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Expires</p>
              <p className="text-text-primary font-medium">
                {formatDate(subscriptionData.subscription.expires_at)}
              </p>
            </div>
            {subscriptionData.daysRemaining > 0 && (
              <div>
                <p className="text-text-muted">Days Remaining</p>
                <p className="text-text-primary font-medium">
                  {subscriptionData.daysRemaining} days
                </p>
              </div>
            )}
          </div>

          {/* Credentials Section */}
          <div className="border-t border-border-subtle pt-4">
            <button
              onClick={() => setShowCredentials(!showCredentials)}
              className="text-sm text-accent-primary hover:underline"
            >
              {showCredentials ? 'Hide Credentials' : 'Show Credentials'}
            </button>

            {showCredentials && (
              <div className="mt-3 space-y-3 rounded-lg bg-bg-secondary p-3">
                <div>
                  <p className="text-xs text-text-muted">Username</p>
                  <p className="text-sm text-text-primary font-mono">
                    {subscriptionData.subscription.username}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Password</p>
                  <p className="text-sm text-text-primary font-mono">
                    {subscriptionData.subscription.password}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">M3U Playlist URL</p>
                  <p className="text-xs text-text-primary font-mono break-all">
                    {subscriptionData.subscription.m3u_download_link}
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(subscriptionData.subscription!.m3u_download_link)}
                    className="mt-1 text-xs text-accent-primary hover:underline"
                  >
                    Copy URL
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Purchase/Extend Section */}
      <div className="rounded-lg border border-border-default bg-bg-tertiary p-4 space-y-4">
        <h3 className="font-medium text-text-primary">
          {hasSubscription ? 'Extend Subscription' : 'Purchase IPTV Subscription'}
        </h3>

        {/* Package Selection */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Select Package
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {subscriptionData?.packages.map((pkg) => (
              <button
                key={pkg.packageKey}
                onClick={() => setSelectedPackage(pkg.packageKey)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  selectedPackage === pkg.packageKey
                    ? 'border-accent-primary bg-accent-primary/10'
                    : 'border-border-default hover:border-border-hover'
                )}
              >
                <p className="text-sm font-medium text-text-primary">{pkg.displayName}</p>
                <p className="text-lg font-bold text-accent-primary">{formatCurrency(pkg.priceUsd)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Crypto Selection */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Payment Method
          </label>
          {isLoadingCoins ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              <span className="text-sm text-text-muted">Loading payment methods...</span>
            </div>
          ) : coinsError ? (
            <p className="text-sm text-status-error py-2">{coinsError}</p>
          ) : coins.length === 0 ? (
            <p className="text-sm text-text-muted py-2">No payment methods available</p>
          ) : (
            <select
              value={selectedCrypto}
              onChange={(e) => setSelectedCrypto(e.target.value)}
              className={cn(
                'w-full max-w-xs rounded-lg border border-border-default bg-bg-secondary px-4 py-2',
                'text-text-primary focus:border-accent-primary focus:outline-none'
              )}
            >
              {coins.map((coin) => (
                <option key={coin.symbol} value={coin.symbol}>
                  {coin.name} ({coin.symbol})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Purchase/Extend Button */}
        <button
          onClick={hasSubscription ? handleExtend : handlePurchase}
          disabled={isProcessing || !selectedCrypto || coins.length === 0}
          className={cn(
            'rounded-lg bg-accent-primary px-6 py-3',
            'text-sm font-medium text-white',
            'hover:bg-accent-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isProcessing
            ? 'Processing...'
            : !selectedCrypto
              ? 'Select payment method'
              : hasSubscription
                ? 'Extend Subscription'
                : 'Purchase Subscription'
          }
        </button>
      </div>

      {/* Features */}
      <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
        <h4 className="font-medium text-text-primary mb-2">IPTV Features</h4>
        <ul className="text-sm text-text-muted space-y-1">
          <li>✓ 10,000+ Live TV Channels</li>
          <li>✓ Movies & TV Shows on Demand</li>
          <li>✓ Sports Channels</li>
          <li>✓ HD & 4K Quality</li>
          <li>✓ Works with any IPTV player</li>
          <li>✓ 24/7 Support</li>
        </ul>
      </div>
    </div>
  );
}
