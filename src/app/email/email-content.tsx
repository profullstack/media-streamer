'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  ExternalLinkIcon,
  LoadingSpinner,
  MailIcon,
  RefreshIcon,
  SettingsIcon,
} from '@/components/ui/icons';

interface EmailAccountOption {
  id: string;
  label: string;
  fromEmail: string;
  isDefault: boolean;
  readable: boolean;
}

interface EmailMessageSummary {
  uid: number;
  subject: string;
  from: string;
  to: string[];
  date: string | null;
  isRead: boolean;
}

interface EmailMessage extends EmailMessageSummary {
  text: string;
  html: string | null;
}

interface MessagesResponse {
  selectedAccountId?: string;
  accounts?: EmailAccountOption[];
  messages?: EmailMessageSummary[];
  error?: string;
}

interface MessageResponse {
  message?: EmailMessage;
  error?: string;
}

function displayDate(value: string | null): string {
  if (!value) return 'No date';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function previewText(message: EmailMessage | null): string {
  if (!message) return '';
  return message.text.replace(/\s+/g, ' ').trim();
}

export function EmailContent(): React.ReactElement {
  const [accounts, setAccounts] = useState<EmailAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [messages, setMessages] = useState<EmailMessageSummary[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readableAccounts = useMemo(() => accounts.filter((account) => account.readable), [accounts]);

  const loadMessages = useCallback(async (accountId = selectedAccountId): Promise<void> => {
    setIsLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (accountId) params.set('accountId', accountId);
      const response = await fetch(`/api/email/messages?${params.toString()}`);
      const data = await response.json() as MessagesResponse;
      if (!response.ok) throw new Error(data.error ?? 'Failed to load inbox');

      const nextAccounts = data.accounts ?? [];
      const nextMessages = data.messages ?? [];
      const nextAccountId = data.selectedAccountId ?? accountId;
      setAccounts(nextAccounts);
      setMessages(nextMessages);
      setSelectedAccountId(nextAccountId);
      setSelectedUid((current) => current && nextMessages.some((message) => message.uid === current) ? current : nextMessages[0]?.uid ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load inbox';
      setError(message);
      setMessages([]);
      setSelectedUid(null);
      setSelectedMessage(null);
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedAccountId]);

  const loadMessage = useCallback(async (uid: number, accountId: string): Promise<void> => {
    setIsLoadingMessage(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set('accountId', accountId);
      const response = await fetch(`/api/email/messages/${uid}?${params.toString()}`);
      const data = await response.json() as MessageResponse;
      if (!response.ok || !data.message) throw new Error(data.error ?? 'Failed to load message');
      setSelectedMessage(data.message);
    } catch (err) {
      setSelectedMessage(null);
      setError(err instanceof Error ? err.message : 'Failed to load message');
    } finally {
      setIsLoadingMessage(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadMessages('');
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadMessages]);

  useEffect(() => {
    if (!selectedUid || !selectedAccountId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadMessage(selectedUid, selectedAccountId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadMessage, selectedAccountId, selectedUid]);

  const selectAccount = (accountId: string): void => {
    setSelectedAccountId(accountId);
    setSelectedMessage(null);
    setSelectedUid(null);
    void loadMessages(accountId);
  };

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const visibleMessage = selectedUid ? selectedMessage : null;
  const bodyText = previewText(visibleMessage);

  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <MailIcon size={28} className="text-accent-primary" />
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Email</h1>
              <p className="text-sm text-text-muted">{selectedAccount ? `${selectedAccount.label} · ${messages.length} recent messages` : 'Connected mailboxes'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/settings?tab=email"
              className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <SettingsIcon size={16} />
              <span>Accounts</span>
            </Link>
            <button
              type="button"
              onClick={() => void loadMessages()}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <RefreshIcon size={16} />
              <span>Reload</span>
            </button>
          </div>
        </div>

        {error ? <div className="rounded-lg border border-status-error bg-status-error/10 p-3 text-sm text-status-error">{error}</div> : null}

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(340px,0.95fr)_minmax(440px,1.25fr)]">
          <aside className="min-h-[520px] rounded-lg border border-border-subtle bg-bg-secondary p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase text-text-muted">Accounts</h2>
            {accounts.length === 0 && !isLoadingList ? (
              <div className="space-y-3 text-sm text-text-muted">
                <p>No email accounts are configured.</p>
                <Link href="/settings?tab=email" className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-3 py-2 font-medium text-white">
                  <SettingsIcon size={16} />
                  <span>Add account</span>
                </Link>
              </div>
            ) : readableAccounts.length === 0 && !isLoadingList ? (
              <div className="space-y-3 text-sm text-text-muted">
                <p>No configured account can be read yet. Gmail accounts use IMAP automatically; custom SMTP accounts need IMAP support added.</p>
                <Link href="/settings?tab=email" className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-3 py-2 font-medium text-white">
                  <SettingsIcon size={16} />
                  <span>Manage accounts</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    disabled={!account.readable}
                    onClick={() => selectAccount(account.id)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left transition-colors',
                      selectedAccountId === account.id ? 'bg-bg-active text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
                      !account.readable ? 'cursor-not-allowed opacity-50' : ''
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{account.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-text-muted">{account.fromEmail}</span>
                    {account.isDefault ? <span className="mt-1 inline-block rounded-full bg-accent-primary/15 px-2 py-0.5 text-xs text-accent-primary">Default</span> : null}
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="min-h-[520px] rounded-lg border border-border-subtle bg-bg-secondary">
            {isLoadingList ? (
              <div className="flex h-40 items-center justify-center gap-2 text-text-muted">
                <LoadingSpinner size={20} />
                <span>Loading inbox...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="p-6 text-sm text-text-muted">No recent messages found.</div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {messages.map((message) => (
                  <button
                    key={message.uid}
                    type="button"
                    onClick={() => setSelectedUid(message.uid)}
                    className={cn(
                      'block w-full p-4 text-left transition-colors hover:bg-bg-hover',
                      selectedUid === message.uid ? 'bg-bg-active' : '',
                      message.isRead ? 'opacity-75' : ''
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-medium text-accent-primary">{message.from || 'Unknown sender'}</span>
                      <span className="shrink-0 text-xs text-text-muted">{displayDate(message.date)}</span>
                    </div>
                    <h2 className="line-clamp-2 text-sm font-semibold text-text-primary">{message.subject}</h2>
                    {!message.isRead ? <span className="mt-2 inline-block rounded-full bg-accent-secondary/15 px-2 py-0.5 text-xs text-accent-secondary">Unread</span> : null}
                  </button>
                ))}
              </div>
            )}
          </section>

          <article className="min-h-[520px] rounded-lg border border-border-subtle bg-bg-secondary p-5">
            {isLoadingMessage ? (
              <div className="flex h-40 items-center justify-center gap-2 text-text-muted">
                <LoadingSpinner size={20} />
                <span>Loading message...</span>
              </div>
            ) : visibleMessage ? (
              <div className="space-y-4">
                <div className="border-b border-border-subtle pb-4">
                  <h2 className="text-xl font-semibold text-text-primary">{visibleMessage.subject}</h2>
                  <dl className="mt-3 space-y-1 text-sm text-text-muted">
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-text-secondary">From</dt>
                      <dd className="min-w-0 truncate">{visibleMessage.from || 'Unknown sender'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-text-secondary">To</dt>
                      <dd className="min-w-0 truncate">{visibleMessage.to.join(', ') || selectedAccount?.fromEmail || 'Unknown recipient'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-text-secondary">Date</dt>
                      <dd>{displayDate(visibleMessage.date)}</dd>
                    </div>
                  </dl>
                </div>
                {bodyText ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-text-secondary">{visibleMessage.text.trim()}</pre>
                ) : visibleMessage.html ? (
                  <div className="space-y-3 text-sm text-text-muted">
                    <p>This message only has HTML content. Open it in your mail client to view the formatted version.</p>
                    <a href={`mailto:${visibleMessage.from}`} className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-3 py-2 font-medium text-white">
                      <ExternalLinkIcon size={16} />
                      <span>Open mail client</span>
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">This message has no readable body.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-muted">Select a message to read it.</p>
            )}
          </article>
        </div>
      </div>
    </MainLayout>
  );
}
