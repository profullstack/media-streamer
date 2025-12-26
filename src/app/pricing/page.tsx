'use client';

/**
 * Pricing Page
 * 
 * Subscription plans with crypto payment support.
 * No free tier - all users start with a 3-day trial.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: 'trial' | 'premium' | 'family';
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
  isTrial?: boolean;
}

type CryptoType = 'BTC' | 'ETH' | 'LTC' | 'USDT' | 'USDC';

const plans: Plan[] = [
  {
    id: 'trial',
    name: '3-Day Trial',
    price: '$0',
    period: 'for 3 days',
    description: 'Try all premium features free for 3 days',
    features: [
      { text: 'Stream any torrent', included: true },
      { text: 'Search torrents', included: true },
      { text: 'Advanced video player', included: true },
      { text: 'Download files', included: true },
      { text: 'Watch parties (host)', included: true },
      { text: 'Live TV (IPTV)', included: true },
      { text: 'Full access for 3 days', included: true },
    ],
    cta: 'Start Free Trial',
    isTrial: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$4.99',
    period: 'per year',
    description: 'Everything you need for personal use',
    features: [
      { text: 'Stream any torrent', included: true },
      { text: 'Search torrents', included: true },
      { text: 'Advanced video player', included: true },
      { text: 'Download files', included: true },
      { text: 'Watch parties (host)', included: true },
      { text: 'Live TV (IPTV)', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Subscribe Now',
    popular: true,
  },
  {
    id: 'family',
    name: 'Family',
    price: '$9.99',
    period: 'per year',
    description: 'Share with up to 10 family members',
    features: [
      { text: 'Everything in Premium', included: true },
      { text: 'Up to 10 family members', included: true },
      { text: 'Shared playlists', included: true },
      { text: 'Family watch parties', included: true },
      { text: 'Parental controls', included: true },
      { text: 'Individual profiles', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Subscribe Now',
  },
];

const cryptoOptions: { type: CryptoType; symbol: string; name: string }[] = [
  { type: 'BTC', symbol: '₿', name: 'Bitcoin' },
  { type: 'ETH', symbol: 'Ξ', name: 'Ethereum' },
  { type: 'LTC', symbol: 'Ł', name: 'Litecoin' },
  { type: 'USDT', symbol: '₮', name: 'USDT' },
  { type: 'USDC', symbol: '$', name: 'USDC' },
];

export default function PricingPage(): React.ReactElement {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedCrypto, setSelectedCrypto] = useState<CryptoType>('BTC');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePlanSelect = (plan: Plan): void => {
    if (plan.isTrial) {
      // Start trial - redirect to signup
      router.push('/signup?trial=true');
      return;
    }
    setSelectedPlan(plan);
    setError(null);
  };

  const handlePayment = async (): Promise<void> => {
    if (!selectedPlan || selectedPlan.isTrial) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan.id,
          cryptoType: selectedCrypto,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Payment failed');
      }

      // Redirect to CoinPayPortal hosted payment page
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = (): void => {
    setSelectedPlan(null);
    setError(null);
  };

  return (
    <MainLayout>
      <div className="space-y-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-3">
            Simple, Transparent Pricing
          </h1>
          <p className="text-text-secondary max-w-lg mx-auto">
            Start with a free 3-day trial. Pay with crypto for complete privacy.
            All paid plans include a 30-day money-back guarantee.
          </p>
        </div>

        {/* Plans */}
        <div className="grid gap-8 lg:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'relative rounded-2xl border p-6',
                plan.popular
                  ? 'border-accent-primary bg-accent-primary/5'
                  : plan.isTrial
                  ? 'border-status-success bg-status-success/5'
                  : 'border-border-subtle bg-bg-secondary'
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-accent-primary px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                </div>
              )}
              {plan.isTrial && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-status-success px-3 py-1 text-xs font-semibold text-white">
                    Free Trial
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-text-primary mb-2">{plan.name}</h2>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-text-primary">{plan.price}</span>
                  <span className="text-text-muted">/{plan.period}</span>
                </div>
                <p className="text-sm text-text-secondary mt-2">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                        feature.included
                          ? 'bg-status-success/20 text-status-success'
                          : 'bg-bg-tertiary text-text-muted'
                      )}
                    >
                      {feature.included ? '✓' : '×'}
                    </span>
                    <span
                      className={cn(
                        'text-sm',
                        feature.included ? 'text-text-primary' : 'text-text-muted'
                      )}
                    >
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePlanSelect(plan)}
                className={cn(
                  'w-full rounded-lg py-3 font-medium transition-colors',
                  plan.popular
                    ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
                    : plan.isTrial
                    ? 'bg-status-success text-white hover:bg-status-success/90'
                    : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
                )}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Payment Methods */}
        <div className="text-center">
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            Pay with Crypto
          </h3>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {cryptoOptions.map((crypto) => (
              <div key={crypto.type} className="flex items-center gap-2 text-text-secondary">
                <span className="text-2xl">{crypto.symbol}</span>
                <span>{crypto.name}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-text-muted mt-4">
            Powered by CoinPayPortal • Secure • Private • No credit card required
          </p>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold text-text-primary mb-6 text-center">
            Frequently Asked Questions
          </h3>
          <div className="space-y-4">
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <h4 className="font-medium text-text-primary mb-2">
                How does the free trial work?
              </h4>
              <p className="text-sm text-text-secondary">
                Sign up and get full access to all premium features for 3 days. No credit card required.
                After the trial ends, you&apos;ll need to subscribe to continue using the service.
              </p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <h4 className="font-medium text-text-primary mb-2">
                Can I cancel anytime?
              </h4>
              <p className="text-sm text-text-secondary">
                Yes! You can cancel your subscription at any time. Your access will continue until the end of your billing period.
              </p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <h4 className="font-medium text-text-primary mb-2">
                What payment methods do you accept?
              </h4>
              <p className="text-sm text-text-secondary">
                We accept Bitcoin, Ethereum, Litecoin, USDT, and USDC through our secure payment partner CoinPayPortal.
              </p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <h4 className="font-medium text-text-primary mb-2">
                How does the Family plan work?
              </h4>
              <p className="text-sm text-text-secondary">
                The Family plan allows you to invite up to 10 family members via email. Each member gets their own profile and can stream independently.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {selectedPlan && !selectedPlan.isTrial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-primary rounded-2xl border border-border-subtle max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-text-primary">
                Subscribe to {selectedPlan.name}
              </h3>
              <button
                onClick={closeModal}
                className="text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              <p className="text-text-secondary mb-4">
                {selectedPlan.price}/{selectedPlan.period}
              </p>

              <label className="block text-sm font-medium text-text-primary mb-2">
                Select Payment Method
              </label>
              <div className="grid grid-cols-5 gap-2">
                {cryptoOptions.map((crypto) => (
                  <button
                    key={crypto.type}
                    onClick={() => setSelectedCrypto(crypto.type)}
                    className={cn(
                      'flex flex-col items-center p-3 rounded-lg border transition-colors',
                      selectedCrypto === crypto.type
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-border-subtle hover:border-border-default'
                    )}
                  >
                    <span className="text-xl">{crypto.symbol}</span>
                    <span className="text-xs text-text-muted mt-1">{crypto.type}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error text-status-error text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handlePayment}
              disabled={isLoading}
              className={cn(
                'w-full rounded-lg py-3 font-medium transition-colors',
                'bg-accent-primary text-white hover:bg-accent-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isLoading ? 'Processing...' : `Pay with ${selectedCrypto}`}
            </button>

            <p className="text-xs text-text-muted text-center mt-4">
              You will be redirected to CoinPayPortal to complete your payment securely.
            </p>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
