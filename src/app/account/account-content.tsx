'use client';

/**
 * Account Settings Page
 *
 * User account settings and preferences.
 * Includes account info, subscription management, IPTV, and security settings.
 */

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { UserIcon, CreditCardIcon, KeyIcon, SettingsIcon, TvIcon } from '@/components/ui/icons';
import { IPTVSubscriptionSection } from '@/components/account';

type AccountTab = 'account' | 'subscription' | 'iptv' | 'security';

/**
 * Payment history item from API
 */
interface PaymentHistoryItem {
  id: string;
  plan: string;
  amountUsd: number;
  amountCrypto: string | null;
  cryptoCurrency: string | null;
  blockchain: string | null;
  txHash: string | null;
  merchantTxHash: string | null;
  platformTxHash: string | null;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Subscription status from API
 */
interface SubscriptionStatus {
  tier: string;
  status: string;
  expiresAt: string | null;
  isActive: boolean;
  daysRemaining: number | null;
}

function AccountPageContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, isLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>('account');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  
  // Subscription management state
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Handle payment success redirect
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setPaymentSuccess(true);
      setActiveTab('subscription');
      // Clean up the URL
      router.replace('/account', { scroll: false });
    }
  }, [searchParams, router]);

  // Fetch subscription status
  const fetchSubscriptionStatus = useCallback(async () => {
    setIsLoadingSubscription(true);
    setSubscriptionError(null);
    try {
      const response = await fetch('/api/subscription');
      if (!response.ok) {
        throw new Error('Failed to fetch subscription status');
      }
      const data = await response.json() as SubscriptionStatus;
      setSubscriptionStatus(data);
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : 'Failed to load subscription');
    } finally {
      setIsLoadingSubscription(false);
    }
  }, []);

  // Fetch payment history
  const fetchPaymentHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await fetch('/api/subscription/history');
      if (!response.ok) {
        throw new Error('Failed to fetch payment history');
      }
      const data = await response.json() as { payments: PaymentHistoryItem[]; total: number };
      console.log('[DEBUG fetchPaymentHistory] API Response:', JSON.stringify(data, null, 2));
      setPaymentHistory(data.payments);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to load payment history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Load subscription data when tab changes to subscription
  useEffect(() => {
    if (activeTab === 'subscription' && isLoggedIn) {
      fetchSubscriptionStatus();
      fetchPaymentHistory();
    }
  }, [activeTab, isLoggedIn, fetchSubscriptionStatus, fetchPaymentHistory]);

  // Handle subscription upgrade
  const handleUpgrade = async (targetTier: 'premium' | 'family'): Promise<void> => {
    setIsUpgrading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const response = await fetch('/api/subscription/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upgrade', targetTier }),
      });
      
      const data = await response.json() as { success?: boolean; redirectUrl?: string; error?: string; message?: string };
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upgrade subscription');
      }
      
      if (data.redirectUrl) {
        router.push(data.redirectUrl);
      } else {
        setActionSuccess(data.message || 'Upgrade initiated');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to upgrade');
    } finally {
      setIsUpgrading(false);
    }
  };

  // Handle subscription downgrade
  const handleDowngrade = async (targetTier: 'premium'): Promise<void> => {
    setIsUpgrading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const response = await fetch('/api/subscription/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'downgrade', targetTier }),
      });
      
      const data = await response.json() as { success?: boolean; error?: string; message?: string; effectiveDate?: string };
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to downgrade subscription');
      }
      
      setActionSuccess(data.message || 'Downgrade scheduled');
      // Refresh subscription status
      await fetchSubscriptionStatus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to downgrade');
    } finally {
      setIsUpgrading(false);
    }
  };

  // Handle subscription cancellation
  const handleCancel = async (): Promise<void> => {
    setIsCancelling(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const response = await fetch('/api/subscription/manage', {
        method: 'DELETE',
      });
      
      const data = await response.json() as { success?: boolean; error?: string; message?: string };
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }
      
      setActionSuccess(data.message || 'Subscription cancelled');
      setShowCancelConfirm(false);
      // Refresh subscription status
      await fetchSubscriptionStatus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to cancel');
    } finally {
      setIsCancelling(false);
    }
  };

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: UserIcon },
    { id: 'subscription' as const, label: 'Subscription', icon: CreditCardIcon },
    { id: 'iptv' as const, label: 'IPTV', icon: TvIcon },
    { id: 'security' as const, label: 'Security', icon: KeyIcon },
  ];

  // Show loading state
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <div 
            data-testid="loading-spinner"
            className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" 
          />
        </div>
      </MainLayout>
    );
  }

  // Don't render content if not logged in (will redirect)
  if (!isLoggedIn || !user) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <div 
            data-testid="loading-spinner"
            className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent" 
          />
        </div>
      </MainLayout>
    );
  }

  const subscriptionLabel = user.subscription_tier === 'premium' 
    ? 'Premium' 
    : user.subscription_tier === 'family' 
      ? 'Family' 
      : user.subscription_tier === 'trial'
        ? 'Trial'
        : 'Free Plan';

  const currentTier = subscriptionStatus?.tier || user.subscription_tier;
  const isPremium = currentTier === 'premium';
  const isFamily = currentTier === 'family';
  const isTrial = currentTier === 'trial';
  const canUpgradeToPremium = isTrial;
  const canUpgradeToFamily = isTrial || isPremium;
  const canDowngradeToPremium = isFamily;
  const canCancel = isPremium || isFamily;

  // Format date for display
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
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

  // Get blockchain explorer URL for a transaction
  const getExplorerUrl = (
    txHash: string | null,
    blockchain: string | null,
    cryptoCurrency: string | null
  ): string | null => {
    console.log('[DEBUG getExplorerUrl]', { txHash, blockchain, cryptoCurrency });
    if (!txHash) {
      console.log('[DEBUG getExplorerUrl] No txHash, returning null');
      return null;
    }

    // Use blockchain first, then fall back to cryptoCurrency
    const chain = blockchain || cryptoCurrency;
    if (!chain) {
      console.log('[DEBUG getExplorerUrl] No chain, returning null');
      return null;
    }

    const chainUpper = chain.toUpperCase();
    console.log('[DEBUG getExplorerUrl] chainUpper:', chainUpper);

    // Map various chain names/codes to explorer URLs
    const explorers: Record<string, string> = {
      // Ethereum
      'ETH': `https://etherscan.io/tx/${txHash}`,
      'ETHEREUM': `https://etherscan.io/tx/${txHash}`,
      // Bitcoin
      'BTC': `https://mempool.space/tx/${txHash}`,
      'BITCOIN': `https://mempool.space/tx/${txHash}`,
      // USDC variants
      'USDC_ETH': `https://etherscan.io/tx/${txHash}`,
      'USDC_POL': `https://polygonscan.com/tx/${txHash}`,
      'USDC_SOL': `https://solscan.io/tx/${txHash}`,
      'USDC': `https://etherscan.io/tx/${txHash}`,
      // Solana
      'SOL': `https://solscan.io/tx/${txHash}`,
      'SOLANA': `https://solscan.io/tx/${txHash}`,
      // Polygon
      'MATIC': `https://polygonscan.com/tx/${txHash}`,
      'POL': `https://polygonscan.com/tx/${txHash}`,
      'POLYGON': `https://polygonscan.com/tx/${txHash}`,
      'POLYGON-POS': `https://polygonscan.com/tx/${txHash}`,
    };

    const result = explorers[chainUpper] || null;
    console.log('[DEBUG getExplorerUrl] Result:', result ? 'URL found' : 'No match for chain');
    return result;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <SettingsIcon size={28} className="text-text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Account Settings</h1>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Tabs */}
          <nav className="flex lg:flex-col gap-2 lg:w-48">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  )}
                >
                  <Icon size={20} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 rounded-xl border border-border-subtle bg-bg-secondary p-6">
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary mb-4">Account Information</h2>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        disabled
                        value={user.email}
                        className={cn(
                          'w-full max-w-md rounded-lg border border-border-default bg-bg-tertiary px-4 py-2',
                          'text-text-muted cursor-not-allowed'
                        )}
                      />
                      <p className="mt-1 text-xs text-text-muted">
                        Email cannot be changed
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Subscription
                      </label>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'rounded-full px-3 py-1 text-sm font-medium',
                          user.subscription_tier === 'premium' || user.subscription_tier === 'family'
                            ? 'bg-accent-secondary/10 text-accent-secondary'
                            : 'bg-accent-primary/10 text-accent-primary'
                        )}>
                          {subscriptionLabel}
                        </span>
                        {(user.subscription_tier === 'free' || user.subscription_tier === 'trial') && (
                          <Link href="/pricing" className="text-sm text-accent-primary hover:underline">
                            Upgrade
                          </Link>
                        )}
                      </div>
                    </div>
                    {user.display_name ? <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">
                          Display Name
                        </label>
                        <p className="text-text-secondary">{user.display_name}</p>
                      </div> : null}
                  </div>
                </div>

                <div className="border-t border-border-subtle pt-6">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Danger Zone</h3>
                  <button
                    className={cn(
                      'rounded-lg border border-status-error px-4 py-2',
                      'text-sm font-medium text-status-error',
                      'hover:bg-status-error/10 transition-colors'
                    )}
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">Subscription Management</h2>

                {/* Payment Success Message */}
                {paymentSuccess ? <div className="rounded-lg border border-status-success bg-status-success/10 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-status-success">Payment successful!</p>
                        <p className="text-sm text-status-success/80 mt-1">
                          Your subscription is being activated. This may take a few moments.
                        </p>
                      </div>
                      <button
                        onClick={() => setPaymentSuccess(false)}
                        className="text-status-success/60 hover:text-status-success"
                        aria-label="Dismiss"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div> : null}

                {/* Action Messages */}
                {actionError ? <div className="rounded-lg border border-status-error bg-status-error/10 p-4 text-sm text-status-error">
                    {actionError}
                  </div> : null}
                {actionSuccess ? <div className="rounded-lg border border-status-success bg-status-success/10 p-4 text-sm text-status-success">
                    {actionSuccess}
                  </div> : null}

                <div className="space-y-4">
                  {/* Current Plan */}
                  <div>
                    <h3 className="text-sm font-medium text-text-primary mb-2">Current Plan</h3>
                    {isLoadingSubscription ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                        <span className="text-sm text-text-muted">Loading...</span>
                      </div>
                    ) : subscriptionError ? (
                      <p className="text-sm text-status-error">{subscriptionError}</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'rounded-full px-3 py-1 text-sm font-medium',
                            isPremium || isFamily
                              ? 'bg-accent-secondary/10 text-accent-secondary'
                              : 'bg-accent-primary/10 text-accent-primary'
                          )}>
                            {subscriptionLabel}
                          </span>
                          {subscriptionStatus?.status ? <span className={cn(
                              'text-xs px-2 py-0.5 rounded',
                              subscriptionStatus.status === 'active' 
                                ? 'bg-status-success/10 text-status-success'
                                : subscriptionStatus.status === 'cancelled'
                                  ? 'bg-status-error/10 text-status-error'
                                  : 'bg-status-warning/10 text-status-warning'
                            )}>
                              {subscriptionStatus.status}
                            </span> : null}
                        </div>
                        {subscriptionStatus?.expiresAt ? <p className="text-sm text-text-muted">
                            {subscriptionStatus.status === 'cancelled' 
                              ? `Access until: ${formatDate(subscriptionStatus.expiresAt)}`
                              : `Renews: ${formatDate(subscriptionStatus.expiresAt)}`
                            }
                          </p> : null}
                        {subscriptionStatus?.daysRemaining !== null && subscriptionStatus?.daysRemaining !== undefined && (
                          <p className="text-sm text-text-muted">
                            {subscriptionStatus.daysRemaining} days remaining
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Upgrade Options */}
                  {(canUpgradeToPremium || canUpgradeToFamily) ? <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                      <h4 className="font-medium text-text-primary mb-3">Upgrade Your Plan</h4>
                      <div className="space-y-3">
                        {canUpgradeToPremium ? <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-text-primary">Premium</p>
                              <p className="text-sm text-text-muted">$4.99/year - Unlimited streaming, high quality</p>
                            </div>
                            <button
                              onClick={() => handleUpgrade('premium')}
                              disabled={isUpgrading}
                              className={cn(
                                'rounded-lg bg-accent-primary px-4 py-2',
                                'text-sm font-medium text-white',
                                'hover:bg-accent-primary/90 transition-colors',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                            >
                              {isUpgrading ? 'Processing...' : 'Upgrade'}
                            </button>
                          </div> : null}
                        {canUpgradeToFamily ? <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-text-primary">Family</p>
                              <p className="text-sm text-text-muted">$9.99/year - Up to 10 family members, all premium features</p>
                            </div>
                            <button
                              onClick={() => handleUpgrade('family')}
                              disabled={isUpgrading}
                              className={cn(
                                'rounded-lg bg-accent-primary px-4 py-2',
                                'text-sm font-medium text-white',
                                'hover:bg-accent-primary/90 transition-colors',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                            >
                              {isUpgrading ? 'Processing...' : 'Upgrade'}
                            </button>
                          </div> : null}
                      </div>
                    </div> : null}

                  {/* Downgrade Option */}
                  {canDowngradeToPremium ? <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                      <h4 className="font-medium text-text-primary mb-3">Downgrade Plan</h4>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-text-primary">Premium</p>
                          <p className="text-sm text-text-muted">$4.99/year - Downgrade takes effect at end of billing period</p>
                        </div>
                        <button
                          onClick={() => handleDowngrade('premium')}
                          disabled={isUpgrading}
                          className={cn(
                            'rounded-lg border border-border-default px-4 py-2',
                            'text-sm font-medium text-text-secondary',
                            'hover:bg-bg-hover hover:text-text-primary transition-colors',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                        >
                          {isUpgrading ? 'Processing...' : 'Downgrade'}
                        </button>
                      </div>
                    </div> : null}

                  {/* Premium Features */}
                  {(isPremium || isFamily) ? <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                      <h4 className="font-medium text-text-primary mb-2">Your Features</h4>
                      <ul className="text-sm text-text-muted space-y-1">
                        <li>✓ Unlimited streaming</li>
                        <li>✓ High quality audio/video</li>
                        <li>✓ Priority support</li>
                        <li>✓ No ads</li>
                        {isFamily ? <li>✓ Up to 5 family members</li> : null}
                      </ul>
                    </div> : null}

                  {/* Trial Info */}
                  {isTrial ? <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                      <h4 className="font-medium text-text-primary mb-2">Trial Features</h4>
                      <p className="text-sm text-text-muted mb-3">
                        You&apos;re on a trial plan with full access to premium features.
                      </p>
                      <ul className="text-sm text-text-muted space-y-1">
                        <li>✓ Unlimited streaming</li>
                        <li>✓ High quality audio/video</li>
                        <li>✓ Watch parties</li>
                      </ul>
                      <p className="text-sm text-text-muted mt-3">
                        <Link href="/pricing" className="text-accent-primary hover:underline">
                          Upgrade now
                        </Link>
                        {' '}to keep your access after the trial ends.
                      </p>
                    </div> : null}

                  {/* Cancel Subscription */}
                  {canCancel && subscriptionStatus?.status !== 'cancelled' ? <div className="border-t border-border-subtle pt-4">
                      <h3 className="text-sm font-medium text-text-primary mb-2">Cancel Subscription</h3>
                      {!showCancelConfirm ? (
                        <button
                          onClick={() => setShowCancelConfirm(true)}
                          className={cn(
                            'rounded-lg border border-status-error px-4 py-2',
                            'text-sm font-medium text-status-error',
                            'hover:bg-status-error/10 transition-colors'
                          )}
                        >
                          Cancel Subscription
                        </button>
                      ) : (
                        <div className="rounded-lg border border-status-error bg-status-error/5 p-4">
                          <p className="text-sm text-text-primary mb-3">
                            Are you sure you want to cancel your subscription? You will lose access to premium features.
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={handleCancel}
                              disabled={isCancelling}
                              className={cn(
                                'rounded-lg bg-status-error px-4 py-2',
                                'text-sm font-medium text-white',
                                'hover:bg-status-error/90 transition-colors',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                            >
                              {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
                            </button>
                            <button
                              onClick={() => setShowCancelConfirm(false)}
                              disabled={isCancelling}
                              className={cn(
                                'rounded-lg border border-border-default px-4 py-2',
                                'text-sm font-medium text-text-secondary',
                                'hover:bg-bg-hover hover:text-text-primary transition-colors',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                              )}
                            >
                              Keep Subscription
                            </button>
                          </div>
                        </div>
                      )}
                    </div> : null}

                  {/* Billing History */}
                  <div className="border-t border-border-subtle pt-4">
                    <h3 className="text-sm font-medium text-text-primary mb-3">Billing History</h3>
                    {isLoadingHistory ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                        <span className="text-sm text-text-muted">Loading...</span>
                      </div>
                    ) : historyError ? (
                      <p className="text-sm text-status-error">{historyError}</p>
                    ) : paymentHistory.length === 0 ? (
                      <p className="text-sm text-text-muted">No payment history yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {paymentHistory.map((payment) => {
                          console.log('[DEBUG Payment Item]', {
                            id: payment.id,
                            txHash: payment.txHash,
                            blockchain: payment.blockchain,
                            cryptoCurrency: payment.cryptoCurrency,
                            merchantTxHash: payment.merchantTxHash,
                            platformTxHash: payment.platformTxHash,
                          });
                          const incomingTxUrl = getExplorerUrl(payment.txHash, payment.blockchain, payment.cryptoCurrency);
                          const merchantTxUrl = getExplorerUrl(payment.merchantTxHash, payment.blockchain, payment.cryptoCurrency);
                          const platformTxUrl = getExplorerUrl(payment.platformTxHash, payment.blockchain, payment.cryptoCurrency);
                          return (
                            <div
                              key={payment.id}
                              className="flex items-center justify-between rounded-lg border border-border-default bg-bg-tertiary p-3"
                            >
                              <div>
                                <p className="text-sm font-medium text-text-primary">
                                  {payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1)} Plan
                                </p>
                                <p className="text-xs text-text-muted">
                                  {formatDate(payment.createdAt)}
                                </p>
                                {/* DEBUG: Show raw values */}
                                <p className="text-xs text-yellow-500">
                                  DEBUG: txHash={payment.txHash || 'null'}, blockchain={payment.blockchain || 'null'}, crypto={payment.cryptoCurrency || 'null'}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {incomingTxUrl ? <a
                                      href={incomingTxUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-accent-primary hover:underline"
                                    >
                                      Incoming TX ↗
                                    </a> : null}
                                  {merchantTxUrl ? <a
                                      href={merchantTxUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-accent-primary hover:underline"
                                    >
                                      Merchant TX ↗
                                    </a> : null}
                                  {platformTxUrl ? <a
                                      href={platformTxUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-accent-primary hover:underline"
                                    >
                                      Platform TX ↗
                                    </a> : null}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium text-text-primary">
                                  {formatCurrency(payment.amountUsd)}
                                </p>
                                <span className={cn(
                                  'text-xs px-2 py-0.5 rounded',
                                  payment.status === 'confirmed' || payment.status === 'forwarded'
                                    ? 'bg-status-success/10 text-status-success'
                                    : payment.status === 'pending' || payment.status === 'detected'
                                      ? 'bg-status-warning/10 text-status-warning'
                                      : 'bg-status-error/10 text-status-error'
                                )}>
                                  {payment.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'iptv' && (
              <IPTVSubscriptionSection />
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">Security Settings</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-text-primary mb-2">Password</h3>
                    <p className="text-sm text-text-muted mb-3">
                      Change your password to keep your account secure.
                    </p>
                    <button
                      className={cn(
                        'rounded-lg bg-accent-primary px-4 py-2',
                        'text-sm font-medium text-white',
                        'hover:bg-accent-primary/90 transition-colors'
                      )}
                    >
                      Change Password
                    </button>
                  </div>

                  <div className="border-t border-border-subtle pt-4">
                    <h3 className="text-sm font-medium text-text-primary mb-2">Sessions</h3>
                    <p className="text-sm text-text-muted mb-3">
                      Manage your active sessions and sign out from other devices.
                    </p>
                    <button
                      className={cn(
                        'rounded-lg border border-border-default px-4 py-2',
                        'text-sm font-medium text-text-secondary',
                        'hover:bg-bg-hover hover:text-text-primary transition-colors'
                      )}
                    >
                      View Active Sessions
                    </button>
                  </div>

                  <div className="border-t border-border-subtle pt-4">
                    <h3 className="text-sm font-medium text-text-primary mb-2">Two-Factor Authentication</h3>
                    <p className="text-sm text-text-muted mb-3">
                      Add an extra layer of security to your account.
                    </p>
                    <button
                      className={cn(
                        'rounded-lg border border-border-default px-4 py-2',
                        'text-sm font-medium text-text-secondary',
                        'hover:bg-bg-hover hover:text-text-primary transition-colors'
                      )}
                    >
                      Enable 2FA
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export function AccountContent(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <MainLayout>
          <div className="flex items-center justify-center py-12">
            <div
              data-testid="loading-spinner"
              className="h-8 w-8 animate-spin rounded-full border-4 border-accent-primary border-t-transparent"
            />
          </div>
        </MainLayout>
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}
