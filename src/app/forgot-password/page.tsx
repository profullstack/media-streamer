'use client';

/**
 * Forgot Password Page
 * 
 * Allows users to request a password reset email.
 */

import { useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { MagnetIcon, LoadingSpinner, CheckIcon } from '@/components/ui/icons';

export default function ForgotPasswordPage(): React.ReactElement {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send reset email');
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="w-full max-w-md text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 mb-6">
              <CheckIcon className="text-status-success" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">Check your email</h1>
            <p className="text-text-secondary mb-6">
              We&apos;ve sent a password reset link to <strong className="text-text-primary">{email}</strong>
            </p>
            <p className="text-sm text-text-muted mb-6">
              Didn&apos;t receive the email? Check your spam folder or{' '}
              <button
                onClick={() => setIsSuccess(false)}
                className="text-accent-primary hover:text-accent-primary/80"
              >
                try again
              </button>
            </p>
            <Link
              href="/login"
              className="text-accent-primary hover:text-accent-primary/80 font-medium"
            >
              ← Back to login
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-accent mb-4">
              <MagnetIcon className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">Forgot password?</h1>
            <p className="text-text-secondary mt-1">
              No worries, we&apos;ll send you reset instructions.
            </p>
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
                  <span>Sending...</span>
                </>
              ) : (
                <span>Reset password</span>
              )}
            </button>
          </form>

          {/* Back to login */}
          <p className="mt-6 text-center text-sm text-text-secondary">
            <Link href="/login" className="text-accent-primary hover:text-accent-primary/80 font-medium">
              ← Back to login
            </Link>
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
