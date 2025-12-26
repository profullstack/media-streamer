'use client';

/**
 * Pricing Page
 * 
 * Subscription plans with crypto payment support.
 */

import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
}

const plans: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for trying out BitTorrented',
    features: [
      { text: 'Stream any torrent', included: true },
      { text: 'Search torrents', included: true },
      { text: 'Basic video player', included: true },
      { text: 'Download files', included: false },
      { text: 'Watch parties', included: false },
      { text: 'Live TV (IPTV)', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: 'Get Started',
  },
  {
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

export default function PricingPage(): React.ReactElement {
  return (
    <MainLayout>
      <div className="space-y-12">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary mb-3">
            Simple, Transparent Pricing
          </h1>
          <p className="text-text-secondary max-w-lg mx-auto">
            Choose the plan that works for you. Pay with crypto for complete privacy.
            All plans include a 30-day money-back guarantee.
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
                className={cn(
                  'w-full rounded-lg py-3 font-medium transition-colors',
                  plan.popular
                    ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
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
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="text-2xl">₿</span>
              <span>Bitcoin</span>
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="text-2xl">Ξ</span>
              <span>Ethereum</span>
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="text-2xl">Ł</span>
              <span>Litecoin</span>
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="text-2xl">₮</span>
              <span>USDT</span>
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span className="text-2xl">$</span>
              <span>USDC</span>
            </div>
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
    </MainLayout>
  );
}
