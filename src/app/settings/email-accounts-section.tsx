'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckIcon,
  EditIcon,
  KeyIcon,
  LoadingSpinner,
  MailIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/ui/icons';

interface EmailAccount {
  id: string;
  label: string;
  provider: string | null;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: 'none' | 'starttls' | 'tls';
  smtpUsername: string | null;
  isDefault: boolean;
  lastCheckedAt: string | null;
  lastCheckStatus: 'unchecked' | 'success' | 'failed';
  lastCheckError: string | null;
}

interface AccountsResponse {
  accounts: EmailAccount[];
}

interface AccountResponse {
  account: EmailAccount;
  error?: string;
}

interface FormState {
  label: string;
  provider: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: 'none' | 'starttls' | 'tls';
  smtpUsername: string;
  smtpPassword: string;
  isDefault: boolean;
}

type ProviderPresetKey = 'custom' | 'gmail' | 'protonmail' | 'resend' | 'forwardemail';

interface ProviderPreset {
  key: Exclude<ProviderPresetKey, 'custom'>;
  label: string;
  provider: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: FormState['smtpSecurity'];
  username: 'fromEmail' | 'resend';
}

const emptyForm: FormState = {
  label: '',
  provider: '',
  fromEmail: '',
  fromName: '',
  replyToEmail: '',
  smtpHost: '',
  smtpPort: '587',
  smtpSecurity: 'starttls',
  smtpUsername: '',
  smtpPassword: '',
  isDefault: false,
};

const providerPresets: ProviderPreset[] = [
  {
    key: 'gmail',
    label: 'Gmail',
    provider: 'gmail',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpSecurity: 'starttls',
    username: 'fromEmail',
  },
  {
    key: 'protonmail',
    label: 'Proton Mail',
    provider: 'protonmail',
    smtpHost: 'smtp.protonmail.ch',
    smtpPort: '587',
    smtpSecurity: 'starttls',
    username: 'fromEmail',
  },
  {
    key: 'resend',
    label: 'Resend',
    provider: 'resend',
    smtpHost: 'smtp.resend.com',
    smtpPort: '587',
    smtpSecurity: 'starttls',
    username: 'resend',
  },
  {
    key: 'forwardemail',
    label: 'ForwardEmail.net',
    provider: 'forwardemail',
    smtpHost: 'smtp.forwardemail.net',
    smtpPort: '465',
    smtpSecurity: 'tls',
    username: 'fromEmail',
  },
];

function presetForProvider(provider: string): ProviderPreset | null {
  return providerPresets.find((preset) => preset.provider === provider) ?? null;
}

function providerPresetKey(provider: string): ProviderPresetKey {
  return presetForProvider(provider)?.key ?? 'custom';
}

function usernameForPreset(preset: ProviderPreset, fromEmail: string): string {
  return preset.username === 'resend' ? 'resend' : fromEmail;
}

function statusLabel(account: EmailAccount): string {
  if (account.lastCheckStatus === 'success') return 'Connected';
  if (account.lastCheckStatus === 'failed') return 'Failed';
  return 'Unchecked';
}

export function EmailAccountsSection(): React.ReactElement {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAccounts = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/email/accounts');
      if (!response.ok) throw new Error('Failed to load email accounts');
      const data = await response.json() as AccountsResponse;
      setAccounts(data.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email accounts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const resetForm = (): void => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const applyProviderPreset = (key: ProviderPresetKey): void => {
    if (key === 'custom') {
      setForm((prev) => ({ ...prev, provider: '' }));
      return;
    }

    const preset = providerPresets.find((item) => item.key === key);
    if (!preset) return;

    setForm((prev) => ({
      ...prev,
      label: prev.label || preset.label,
      provider: preset.provider,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      smtpSecurity: preset.smtpSecurity,
      smtpUsername: usernameForPreset(preset, prev.fromEmail),
    }));
  };

  const updateFromEmail = (value: string): void => {
    setForm((prev) => {
      const preset = presetForProvider(prev.provider);
      const shouldSyncUsername = preset && prev.smtpUsername === usernameForPreset(preset, prev.fromEmail);

      return {
        ...prev,
        fromEmail: value,
        smtpUsername: shouldSyncUsername ? usernameForPreset(preset, value) : prev.smtpUsername,
      };
    });
  };

  const startEdit = (account: EmailAccount): void => {
    setEditingId(account.id);
    setForm({
      label: account.label,
      provider: account.provider ?? '',
      fromEmail: account.fromEmail,
      fromName: account.fromName ?? '',
      replyToEmail: account.replyToEmail ?? '',
      smtpHost: account.smtpHost,
      smtpPort: String(account.smtpPort),
      smtpSecurity: account.smtpSecurity,
      smtpUsername: account.smtpUsername ?? '',
      smtpPassword: '',
      isDefault: account.isDefault,
    });
  };

  const saveAccount = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      label: form.label,
      provider: form.provider || null,
      fromEmail: form.fromEmail,
      fromName: form.fromName || null,
      replyToEmail: form.replyToEmail || null,
      smtpHost: form.smtpHost,
      smtpPort: Number(form.smtpPort),
      smtpSecurity: form.smtpSecurity,
      smtpUsername: form.smtpUsername || null,
      ...(form.smtpPassword ? { smtpPassword: form.smtpPassword } : {}),
      isDefault: form.isDefault,
    };

    try {
      const response = await fetch(editingId ? `/api/email/accounts/${editingId}` : '/api/email/accounts', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as AccountResponse;
      if (!response.ok) throw new Error(data.error ?? 'Failed to save email account');
      setMessage(editingId ? 'Email account updated.' : 'Email account added.');
      resetForm();
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save email account');
    } finally {
      setIsSaving(false);
    }
  };

  const checkAccount = async (accountId: string): Promise<void> => {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/email/accounts/${accountId}/check`, { method: 'POST' });
      const data = await response.json() as AccountResponse;
      if (!response.ok) throw new Error(data.error ?? 'SMTP check failed');
      setMessage('SMTP check succeeded.');
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SMTP check failed');
      await loadAccounts();
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAccount = async (accountId: string): Promise<void> => {
    if (!confirm('Delete this SMTP account?')) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/email/accounts/${accountId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete email account');
      setMessage('Email account deleted.');
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete email account');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MailIcon size={22} className="text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">SMTP Accounts</h2>
      </div>

      {error ? <div className="rounded-lg border border-status-error bg-status-error/10 p-3 text-sm text-status-error">{error}</div> : null}
      {message ? <div className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 p-3 text-sm text-accent-secondary">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <form
          className="space-y-3 rounded-lg border border-border-subtle bg-bg-tertiary p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAccount();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label" value={form.label} onChange={(value) => setForm((prev) => ({ ...prev, label: value }))} required />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-text-primary">Provider type</span>
              <select
                value={providerPresetKey(form.provider)}
                onChange={(event) => applyProviderPreset(event.target.value as ProviderPresetKey)}
                className="w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-hidden"
              >
                <option value="custom">Custom SMTP</option>
                {providerPresets.map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.label}</option>
                ))}
              </select>
            </label>
          </div>
          {providerPresetKey(form.provider) === 'custom' ? (
            <Field label="Provider name" value={form.provider} onChange={(value) => setForm((prev) => ({ ...prev, provider: value }))} />
          ) : null}
          <Field label="From email" type="email" value={form.fromEmail} onChange={updateFromEmail} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From name" value={form.fromName} onChange={(value) => setForm((prev) => ({ ...prev, fromName: value }))} />
            <Field label="Reply-to" type="email" value={form.replyToEmail} onChange={(value) => setForm((prev) => ({ ...prev, replyToEmail: value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
            <Field label="SMTP host" value={form.smtpHost} onChange={(value) => setForm((prev) => ({ ...prev, smtpHost: value }))} required />
            <Field label="Port" type="number" value={form.smtpPort} onChange={(value) => setForm((prev) => ({ ...prev, smtpPort: value }))} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-text-primary">Security</span>
              <select
                value={form.smtpSecurity}
                onChange={(event) => setForm((prev) => ({ ...prev, smtpSecurity: event.target.value as FormState['smtpSecurity'] }))}
                className="w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-hidden"
              >
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS</option>
                <option value="none">None</option>
              </select>
            </label>
            <Field label="Username" value={form.smtpUsername} onChange={(value) => setForm((prev) => ({ ...prev, smtpUsername: value }))} />
          </div>
          <Field
            label={editingId ? 'New password' : 'Password'}
            type="password"
            value={form.smtpPassword}
            onChange={(value) => setForm((prev) => ({ ...prev, smtpPassword: value }))}
            required={!editingId}
          />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => setForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
              className="h-4 w-4 rounded border-border-default bg-bg-primary"
            />
            <span>Use as default sender</span>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSaving ? <LoadingSpinner size={16} /> : editingId ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
              <span>{editingId ? 'Save changes' : 'Add account'}</span>
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-lg border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover">
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-tertiary p-4 text-sm text-text-muted">
              <LoadingSpinner size={18} />
              <span>Loading SMTP accounts...</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-bg-tertiary p-4 text-sm text-text-muted">No SMTP accounts configured.</div>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-border-subtle bg-bg-tertiary p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-text-primary">{account.label}</h3>
                      {account.isDefault ? <span className="rounded-full bg-accent-primary/15 px-2 py-0.5 text-xs font-medium text-accent-primary">Default</span> : null}
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        account.lastCheckStatus === 'success' ? 'bg-accent-secondary/15 text-accent-secondary' :
                          account.lastCheckStatus === 'failed' ? 'bg-status-error/10 text-status-error' :
                            'bg-bg-primary text-text-muted'
                      )}>
                        {statusLabel(account)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">{account.fromName ? `${account.fromName} ` : ''}&lt;{account.fromEmail}&gt;</p>
                    <p className="mt-1 text-xs text-text-muted">{account.smtpHost}:{account.smtpPort} · {account.smtpSecurity.toUpperCase()}</p>
                    {account.lastCheckError ? <p className="mt-2 text-xs text-status-error">{account.lastCheckError}</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void checkAccount(account.id)} aria-label={`Check ${account.label}`} className="rounded-lg p-2 text-text-muted hover:bg-bg-hover hover:text-text-primary">
                      <KeyIcon size={17} />
                    </button>
                    <button type="button" onClick={() => startEdit(account)} aria-label={`Edit ${account.label}`} className="rounded-lg p-2 text-text-muted hover:bg-bg-hover hover:text-text-primary">
                      <EditIcon size={17} />
                    </button>
                    <button type="button" onClick={() => void deleteAccount(account.id)} aria-label={`Delete ${account.label}`} className="rounded-lg p-2 text-text-muted hover:bg-status-error/10 hover:text-status-error">
                      <TrashIcon size={17} />
                    </button>
                    {!account.isDefault ? (
                      <button type="button" onClick={() => void startDefault(account.id)} className="rounded-lg border border-border-default px-3 py-2 text-xs font-medium text-text-secondary hover:bg-bg-hover">
                        Make default
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  async function startDefault(accountId: string): Promise<void> {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/email/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!response.ok) throw new Error('Failed to set default account');
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default account');
    } finally {
      setIsSaving(false);
    }
  }
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}

function Field({ label, value, onChange, type = 'text', required = false }: FieldProps): React.ReactElement {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-text-primary">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-text-primary focus:border-accent-primary focus:outline-hidden"
      />
    </label>
  );
}
