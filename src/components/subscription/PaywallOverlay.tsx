'use client';

/**
 * PaywallOverlay Component
 * 
 * Full-screen overlay shown when a user's trial/subscription has expired.
 * Prompts them to subscribe to continue using the service.
 */

interface PaywallOverlayProps {
  onClose?: () => void;
}

export function PaywallOverlay({ onClose }: PaywallOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative mx-4 max-w-md w-full rounded-xl bg-bg-secondary p-8 shadow-2xl text-center">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-text-secondary hover:text-text-primary"
            aria-label="Close"
          >
            ✕
          </button>
        )}

        <div className="text-5xl mb-4">🔒</div>

        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Your Free Trial Has Expired
        </h2>

        <p className="text-text-secondary mb-6">
          Subscribe to continue streaming movies, TV shows, music, and more.
        </p>

        <div className="space-y-3 mb-6">
          <div className="rounded-lg border border-accent-primary/30 bg-bg-primary p-4">
            <div className="font-semibold text-text-primary">Premium</div>
            <div className="text-accent-primary text-2xl font-bold">$4.99<span className="text-sm text-text-secondary">/year</span></div>
            <div className="text-text-secondary text-sm">Unlimited streaming for one device</div>
          </div>

          <div className="rounded-lg border border-accent-primary/30 bg-bg-primary p-4">
            <div className="font-semibold text-text-primary">Family</div>
            <div className="text-accent-primary text-2xl font-bold">$9.99<span className="text-sm text-text-secondary">/year</span></div>
            <div className="text-text-secondary text-sm">Unlimited streaming for up to 5 devices</div>
          </div>
        </div>

        <a
          href="/pricing"
          className="inline-block w-full rounded-lg bg-accent-primary px-6 py-3 font-semibold text-white hover:bg-accent-primary/90 transition-colors"
        >
          View Plans & Subscribe
        </a>
      </div>
    </div>
  );
}
