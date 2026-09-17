'use client';

/**
 * Login Page
 *
 * User authentication with email/password.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/icons';

/** What went wrong on the way back from nixamp, in words. */
const NIXAMP_REFUSALS: Record<string, string> = {
  access_denied: 'You did not allow it on nixamp, so nothing was signed in.',
  no_email: 'nixamp did not share an email address, and one is needed to know which account here is yours.',
  state_mismatch: 'That nixamp sign-in took too long or was reused. Try it again.',
  exchange_failed: 'nixamp did not finish the sign-in. Try it again.',
};

/** Sign in with nixamp, landing wherever the visit was going. */
function nixampSignInHref(redirect: string): string {
  return `/api/v1/nixamp/oauth/start?redirect=${encodeURIComponent(redirect)}`;
}

export default function LoginPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const [redirect, setRedirect] = useState('/');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReason(params.get('reason'));
    setRedirect(params.get('redirect') || '/');
    const refused = params.get('nixamp_error');
    if (refused) setError(NIXAMP_REFUSALS[refused] ?? `nixamp sign-in did not finish (${refused}).`);
  }, []);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Invalid email or password');
        return;
      }

      // Redirect to the originally requested page, or home
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirect') || '/';
      window.location.href = redirectTo;
    } catch {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md">
          {/* Reason message for redirects */}
          {reason === 'members' && (
            <div className="mb-4 rounded-lg border border-accent-primary/30 bg-accent-primary/10 px-4 py-3 text-center text-sm text-text-primary">
              BitTorrented is members only. Sign in, or{' '}
              <Link href="/signup" className="underline">create an account</Link>, to continue.
            </div>
          )}
          {reason === 'live-tv' && (
            <div className="mb-4 rounded-lg border border-accent-primary/30 bg-accent-primary/10 px-4 py-3 text-center text-sm text-text-primary">
              Sign in to access Live TV — add your IPTV playlists and stream live channels.
            </div>
          )}
          {/* Logo */}
          <div className="mb-8 text-center">
            <Link href="/" className="inline-block mb-4">
              <Image
                src="/logo.svg"
                alt="BitTorrented"
                width={256}
                height={64}
                className="w-64 h-auto mx-auto"
                style={{ margin: '0.8rem' }}
                priority
              />
            </Link>
            <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
            <p className="text-text-secondary mt-1">Sign in to your account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <div className="rounded-lg bg-status-error/10 border border-status-error/20 p-3 text-sm text-status-error">
                {error}
              </div> : null}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-secondary px-4 py-3',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary'
                )}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-secondary px-4 py-3',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary'
                )}
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-sm border-border-default bg-bg-secondary text-accent-primary focus:ring-accent-primary"
                />
                <span className="text-sm text-text-secondary">Remember me</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-accent-primary hover:text-accent-primary/80"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
                'bg-accent-primary text-white font-medium',
                'hover:bg-accent-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size={20} />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Sign in with nixamp: the same person, as nixamp.com knows them */}
          <div className="mt-6">
            <div className="relative text-center text-xs text-text-muted mb-4">
              <span className="bg-bg-secondary px-2 relative z-10">or</span>
              <span className="absolute inset-x-0 top-1/2 border-t border-border-subtle" aria-hidden="true" />
            </div>
            <a
              href={nixampSignInHref(redirect)}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
                'border border-border-default bg-bg-tertiary text-text-primary font-medium',
                'hover:border-accent-primary transition-colors'
              )}
            >
              <span aria-hidden="true">⣿</span>
              <span>Sign in with nixamp</span>
            </a>
            <p className="mt-2 text-center text-xs text-text-muted">
              OAuth 2.1 with nixamp.com. A watch party here is a room there.
            </p>
          </div>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm text-text-secondary">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-accent-primary hover:text-accent-primary/80 font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
