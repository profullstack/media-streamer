'use client';

/**
 * Contact details: the shared @profullstack/profile fields (name, company
 * domain, job title, LinkedIn), read and saved through /api/v1/me/profile.
 * Private to the account owner; the account email is the contact email.
 */

import { useEffect, useState } from 'react';
import { ProfileFields } from '@profullstack/profile/react';
import type { ProfileField } from '@profullstack/profile';
import { cn } from '@/lib/utils';

type Values = Partial<Record<ProfileField, string | null>>;
const FIELDS: ProfileField[] = ['first_name', 'last_name', 'company_domain', 'job_title', 'linkedin_url'];

export function ContactDetailsSection(): React.ReactElement {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/me/profile', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { profile?: Values } | null) => {
        if (cancelled || !json?.profile) return;
        const p = json.profile;
        setValues(Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? ''])) as Values);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await fetch('/api/v1/me/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: Partial<Record<ProfileField, string>>;
        profile?: Values;
      };
      if (!res.ok) {
        setErrors(json.errors ?? {});
        setMessage({ ok: false, text: json.error ?? 'Could not save' });
        return;
      }
      const saved = json.profile;
      if (saved) setValues(Object.fromEntries(FIELDS.map((k) => [k, saved[k] ?? ''])) as Values);
      setMessage({ ok: true, text: 'Saved' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border-subtle pt-6">
      <h3 className="text-sm font-semibold text-text-primary mb-1">Contact details</h3>
      <p className="mb-4 text-xs text-text-muted">Private to you. Never shown on your public profile.</p>
      <form onSubmit={onSubmit} className="max-w-md space-y-4">
        <ProfileFields
          fields={FIELDS}
          idPrefix="account-"
          values={values}
          onChange={setValues}
          errors={errors}
          disabled={loading || busy}
        />
        {message ? (
          <p className={cn('text-sm', message.ok ? 'text-text-muted' : 'text-status-error')}>{message.text}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading || busy}
          className={cn(
            'rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white',
            'hover:bg-accent-primary/90 transition-colors disabled:opacity-50'
          )}
        >
          {busy ? 'Saving…' : 'Save contact details'}
        </button>
      </form>
    </div>
  );
}
