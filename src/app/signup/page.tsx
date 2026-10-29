'use client';

/**
 * Signup Page
 *
 * User registration with email/password. Invite only: an unused invite code is
 * required (a member's link fills it in from ?invite=). Under the form, InviteLanding says
 * what BitTorrented is, for whoever opened the link.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/icons';
import { InviteLanding } from '@/components/home/invite-landing';
import { ProfileFields } from '@profullstack/profile/react';
import type { ProfileField } from '@profullstack/profile';

// Email has its own input; the shared package renders the other five.
const PROFILE_FIELDS: ProfileField[] = ['first_name', 'last_name', 'company_domain', 'job_title', 'linkedin_url'];
type ProfileValues = Partial<Record<ProfileField, string | null>>;

export default function SignupPage(): React.ReactElement {
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileValues>({});
  const [profileErrors, setProfileErrors] = useState<Partial<Record<ProfileField, string>>>({});

  const [success, setSuccess] = useState(false);

  // An invite link is /signup?invite=ABCDE-FGHJK.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('invite');
    if (fromLink) setInviteCode(fromLink);
  }, []);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setProfileErrors({});

    if (!inviteCode.trim()) {
      setError('An invite code is required to sign up');
      return;
    }

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
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          inviteCode,
          ...Object.fromEntries(PROFILE_FIELDS.map((k) => [k, profile[k] ?? ''])),
        }),
      });

      const data = await response.json() as {
        error?: string;
        message?: string;
        errors?: Partial<Record<ProfileField, string>>;
      };

      if (!response.ok) {
        setProfileErrors(data.errors ?? {});
        setError(data.error ?? 'Failed to create account');
        return;
      }

      // Show success message - user needs to confirm email
      setSuccess(true);
    } catch {
      setError('Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
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
            <p className="text-text-secondary mt-1">BitTorrented is invite only</p>
          </div>

          {/* Success Message */}
          {success ? (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-6 text-center">
              <svg
                className="mx-auto h-12 w-12 text-green-500 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="text-lg font-semibold text-text-primary mb-2">Check your email</h2>
              <p className="text-text-secondary mb-4">
                We&apos;ve sent a confirmation link to <strong>{email}</strong>.
                Please click the link to activate your account.
              </p>
              <Link
                href="/login"
                className="text-accent-primary hover:text-accent-primary/80 font-medium"
              >
                Go to login
              </Link>
            </div>
          ) : (
          <>
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <div className="rounded-lg bg-status-error/10 border border-status-error/20 p-3 text-sm text-status-error">
                {error}
              </div> : null}

            <div>
              <label htmlFor="inviteCode" className="block text-sm font-medium text-text-primary mb-1">
                Invite code
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className={cn(
                  'w-full rounded-lg border border-border-default bg-bg-secondary px-4 py-3 font-mono uppercase',
                  'text-text-primary placeholder:text-text-muted',
                  'focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary'
                )}
                placeholder="ABCDE-FGHJK"
              />
              <p className="mt-1 text-xs text-text-muted">From a member&apos;s invite link or message</p>
            </div>

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

            <ProfileFields
              fields={PROFILE_FIELDS}
              idPrefix="signup-"
              values={profile}
              onChange={setProfile}
              errors={profileErrors}
              disabled={isLoading}
            />

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
                  'focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary'
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
                  'focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary'
                )}
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                id="terms"
                type="checkbox"
                required
                className="mt-1 h-4 w-4 rounded-sm border-border-default bg-bg-secondary text-accent-primary focus:ring-accent-primary"
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

          {/* No "Continue with nixamp" here: it would make an account without an invite,
              and the database refuses that anyway. Linked accounts still sign in on /login.
              The same holds for CoinPay: it signs in an account that has connected it. */}
          <a
            href="/api/v1/coinpay/oauth/start"
            className={cn(
              'mt-6 w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3',
              'border border-border-default bg-bg-tertiary text-text-primary font-medium',
              'hover:border-accent-primary transition-colors'
            )}
          >
            <span>Sign in with CoinPay</span>
          </a>
          <p className="mt-2 text-center text-xs text-text-muted">
            Already a member with CoinPay connected? Sign in with it. New here? Create the account with your invite, then connect CoinPay in Settings.
          </p>

          {/* Sign in link */}
          <p className="mt-6 text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link href="/login" className="text-accent-primary hover:text-accent-primary/80 font-medium">
              Sign in
            </Link>
          </p>
          </>
          )}
        </div>

        {/* Someone opening an invite link may not know what it is for. */}
        {success ? null : <InviteLanding actions={false} className="mt-16 w-full max-w-3xl" />}
      </div>
    </MainLayout>
  );
}
