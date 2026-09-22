'use client';

import { useState, useTransition } from 'react';
import { upgradeUserByEmail } from '@/app/actions/admin';

export function UpgradeForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(initialEmail);
  const [tier, setTier] = useState('premium');
  const [months, setMonths] = useState(12);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    start(async () => {
      const result = await upgradeUserByEmail({ email, tier, months });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`${result.email} is now ${result.tier} until ${result.expiresAt.slice(0, 10)}.`);
      setEmail('');
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Upgrade account</h2>
        <p className="mt-1 text-sm text-text-muted">
          Find an account by email and grant a paid subscription without a payment.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_130px_110px_auto]">
        <input
          className="rounded border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="user@example.com"
          required
        />
        <select
          className="rounded border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
          value={tier}
          onChange={(event) => setTier(event.target.value)}
        >
          <option value="premium">Premium</option>
          <option value="family">Family</option>
        </select>
        <input
          className="rounded border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
          type="number"
          min={1}
          max={60}
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50"
        >
          {pending ? 'Saving' : 'Upgrade'}
        </button>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-green-400">{message}</p> : null}
    </form>
  );
}
