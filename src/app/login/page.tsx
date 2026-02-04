'use client';

/**
 * Login Page
 *
 * User authentication with email/password.
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/icons';

export default function LoginPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                  'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
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
                  'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
                )}
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border-default bg-bg-secondary text-accent-primary focus:ring-accent-primary"
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
