'use client';

/**
 * Account Settings Page
 * 
 * User account settings and preferences.
 * Includes account info, subscription management, and security settings.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { UserIcon, CreditCardIcon, KeyIcon, SettingsIcon } from '@/components/ui/icons';

type AccountTab = 'account' | 'subscription' | 'security';

export default function AccountPage(): React.ReactElement {
  const router = useRouter();
  const { isLoggedIn, isLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>('account');

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/login');
    }
  }, [isLoading, isLoggedIn, router]);

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: UserIcon },
    { id: 'subscription' as const, label: 'Subscription', icon: CreditCardIcon },
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
      : 'Free Plan';

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
                        {user.subscription_tier === 'free' && (
                          <Link href="/pricing" className="text-sm text-accent-primary hover:underline">
                            Upgrade
                          </Link>
                        )}
                      </div>
                    </div>
                    {user.display_name && (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">
                          Display Name
                        </label>
                        <p className="text-text-secondary">{user.display_name}</p>
                      </div>
                    )}
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
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-text-primary mb-2">Current Plan</h3>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'rounded-full px-3 py-1 text-sm font-medium',
                        user.subscription_tier === 'premium' || user.subscription_tier === 'family'
                          ? 'bg-accent-secondary/10 text-accent-secondary'
                          : 'bg-accent-primary/10 text-accent-primary'
                      )}>
                        {subscriptionLabel}
                      </span>
                    </div>
                  </div>

                  {user.subscription_tier === 'free' ? (
                    <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                      <h4 className="font-medium text-text-primary mb-2">Upgrade to Premium</h4>
                      <p className="text-sm text-text-muted mb-4">
                        Get unlimited streaming, higher quality, and more features.
                      </p>
                      <Link
                        href="/pricing"
                        className={cn(
                          'inline-block rounded-lg bg-accent-primary px-4 py-2',
                          'text-sm font-medium text-white',
                          'hover:bg-accent-primary/90 transition-colors'
                        )}
                      >
                        Upgrade
                      </Link>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
                      <h4 className="font-medium text-text-primary mb-2">Premium Features</h4>
                      <ul className="text-sm text-text-muted space-y-1">
                        <li>✓ Unlimited streaming</li>
                        <li>✓ High quality audio/video</li>
                        <li>✓ Priority support</li>
                        <li>✓ No ads</li>
                      </ul>
                    </div>
                  )}

                  <div className="border-t border-border-subtle pt-4">
                    <h3 className="text-sm font-medium text-text-primary mb-2">Billing History</h3>
                    <Link
                      href="/api/subscription/history"
                      className="text-sm text-accent-primary hover:underline"
                    >
                      View billing history
                    </Link>
                  </div>
                </div>
              </div>
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
