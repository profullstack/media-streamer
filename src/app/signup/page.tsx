'use client';

/**
 * Signup Page
 *
 * User registration with email/password.
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/icons';

export default function SignupPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      // TODO: Implement actual signup via server action
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Redirect to home on success
      window.location.href = '/';
    } catch {
      setError('Failed to create account. Please try again.');
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
            <h1 className="text-2xl font-bold text-text-primary">Create an account</h1>
            <p className="text-text-secondary mt-1">Start streaming in seconds</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-status-error/10 border border-status-error/20 p-3 text-sm text-status-error">
                {error}
              </div>
            )}

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
                autoComplete="new-password"
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-secondary px-4 py-3',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
                )}
                placeholder="••••••••"
              />
              <p className="mt-1 text-xs text-text-muted">Must be at least 8 characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-secondary px-4 py-3',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
                )}
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                id="terms"
                type="checkbox"
                required
                className="mt-1 h-4 w-4 rounded border-border-default bg-bg-secondary text-accent-primary focus:ring-accent-primary"
              />
              <label htmlFor="terms" className="text-sm text-text-secondary">
                I agree to the{' '}
                <Link href="/terms" className="text-accent-primary hover:text-accent-primary/80">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-accent-primary hover:text-accent-primary/80">
                  Privacy Policy
                </Link>
              </label>
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
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Create Account</span>
              )}
            </button>
          </form>

          {/* Sign in link */}
          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="text-accent-primary hover:text-accent-primary/80 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
