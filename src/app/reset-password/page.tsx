'use client';

/**
 * Reset Password Page
 *
 * Allows users to set a new password after clicking the reset link.
 */

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { LoadingSpinner, CheckIcon, KeyIcon } from '@/components/ui/icons';

function ResetPasswordForm(): React.ReactElement {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if we have the necessary tokens from Supabase
    const accessToken = searchParams.get('access_token');
    const type = searchParams.get('type');
    
    if (accessToken && type === 'recovery') {
      setHasToken(true);
    }
    setIsChecking(false);
  }, [searchParams]);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsLoading(true);

    try {
      const accessToken = searchParams.get('access_token');
      
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password,
          accessToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset password');
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size={32} className="text-accent-primary" />
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 mb-6">
            <CheckIcon className="text-status-success" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Password reset successful</h1>
          <p className="text-text-secondary mb-6">
            Your password has been updated. You can now sign in with your new password.
          </p>
          <Link
            href="/login"
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3',
              'bg-accent-primary text-white font-medium',
              'hover:bg-accent-primary/90 transition-colors'
            )}
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-status-error/10 mb-6">
            <KeyIcon className="text-status-error" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Invalid or expired link</h1>
          <p className="text-text-secondary mb-6">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3',
              'bg-accent-primary text-white font-medium',
              'hover:bg-accent-primary/90 transition-colors'
            )}
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  return (
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
          <h1 className="text-2xl font-bold text-text-primary">Set new password</h1>
          <p className="text-text-secondary mt-1">
            Enter your new password below.
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
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
              New Password
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
            <p className="mt-1 text-xs text-text-muted">
              At least 8 characters with uppercase, lowercase, and number
            </p>
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
                <span>Resetting...</span>
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
  );
}

function ResetPasswordLoading(): React.ReactElement {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoadingSpinner size={32} className="text-accent-primary" />
    </div>
  );
}

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <MainLayout>
      <Suspense fallback={<ResetPasswordLoading />}>
        <ResetPasswordForm />
      </Suspense>
    </MainLayout>
  );
}
