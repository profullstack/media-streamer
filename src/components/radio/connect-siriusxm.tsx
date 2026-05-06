'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/icons';
import { useSiriusXmAuth } from '@/hooks/use-siriusxm-auth';

type Step = 'email' | 'otp';

interface ConnectSiriusXmProps {
  onConnectionChange?: () => void;
}

export function ConnectSiriusXm({ onConnectionChange }: ConnectSiriusXmProps): React.ReactElement {
  const { status, isLoading, refetch } = useSiriusXmAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClose = (): void => {
    setIsModalOpen(false);
  };

  const handleSuccess = async (): Promise<void> => {
    setIsModalOpen(false);
    await refetch();
    onConnectionChange?.();
  };

  const handleDisconnect = async (): Promise<void> => {
    const res = await fetch('/api/radio/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return;
    await refetch();
    onConnectionChange?.();
  };

  if (isLoading && !status) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-text-muted">
        <LoadingSpinner size={16} />
        <span>Checking SiriusXM...</span>
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="inline-flex items-center gap-3 rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-sm">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        <span className="text-text-primary">{status.email ?? 'SiriusXM connected'}</span>
        <button
          type="button"
          onClick={handleDisconnect}
          className="text-text-muted hover:text-text-primary"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
      >
        Connect SiriusXM
      </button>
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title="Connect your SiriusXM account"
        size="md"
      >
        <ConnectFlow onSuccess={handleSuccess} />
      </Modal>
    </>
  );
}

interface ConnectFlowProps {
  onSuccess: () => Promise<void>;
}

function ConnectFlow({ onSuccess }: ConnectFlowProps): React.ReactElement {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStartLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/radio/auth/login/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    // Strip all whitespace — pasted OTPs often arrive as "1 2 3 4 5 6" or
    // wrapped onto two lines from an email; SXM rejects anything non-digit.
    const cleanOtp = otp.replace(/\s+/g, '');
    if (!cleanOtp) {
      setError('Enter the code from your email');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/radio/auth/login/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: cleanOtp }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'email') {
    return (
      <form onSubmit={handleStartLogin} className="space-y-4">
        <p className="text-sm text-text-secondary">
          Enter the email on your SiriusXM account. We&apos;ll send you a sign-in code.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm text-text-secondary">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            disabled={isSubmitting}
            className="w-full rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            placeholder="you@example.com"
          />
        </label>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-2 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-60"
        >
          {isSubmitting ? <LoadingSpinner size={16} /> : null}
          Send sign-in code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleVerifyOtp} className="space-y-4">
      <p className="text-sm text-text-secondary">
        Check <span className="text-text-primary">{email}</span> for a code from SiriusXM and enter
        it below.
      </p>
      <label className="block">
        <span className="mb-1 block text-sm text-text-secondary">Sign-in code</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          autoFocus
          disabled={isSubmitting}
          className="w-full rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-2xl tracking-[0.4em] text-text-primary placeholder-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          placeholder="000000"
        />
      </label>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setOtp('');
            setError(null);
          }}
          disabled={isSubmitting}
          className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-primary hover:bg-bg-tertiary disabled:opacity-60"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-2 font-medium text-white hover:bg-accent-primary/90 disabled:opacity-60"
        >
          {isSubmitting ? <LoadingSpinner size={16} /> : null}
          Verify
        </button>
      </div>
    </form>
  );
}
