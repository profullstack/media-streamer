'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { htmlToPlainText, renderRichContentHtml } from '@/lib/rich-content';
import {
  LinkIcon,
  LoadingSpinner,
  MailIcon,
  ReplyIcon,
  RefreshIcon,
  RssIcon,
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
  fromEmail: string | null;
  to: string[];
  date: string | null;
  isRead: boolean;
}

interface EmailMessage extends EmailMessageSummary {
  replyTo: string[];
  messageId: string | null;
  references: string[];
  text: string;
  html: string | null;
}

interface MessagesResponse {
  selectedAccountId?: string;
  accounts?: EmailAccountOption[];
  messages?: EmailMessageSummary[];
  error?: string;
  details?: string;
  solution?: string;
  docsUrl?: string;
}

interface MessageResponse {
  message?: EmailMessage;
  error?: string;
  details?: string;
  solution?: string;
  docsUrl?: string;
}

interface SenderFeedResponse {
  feedUrl?: string;
  subscription?: unknown;
  error?: string;
}

interface ErrorInfo {
  message: string;
  details?: string;
  solution?: string;
  docsUrl?: string;
}

function errorInfoFromResponse(data: { error?: string; details?: string; solution?: string; docsUrl?: string }, fallback: string): ErrorInfo {
  return {
    message: data.error ?? fallback,
    details: data.details,
    solution: data.solution,
    docsUrl: data.docsUrl,
  };
}

function errorInfoFromUnknown(error: unknown, fallback: string): ErrorInfo {
  return {
    message: error instanceof Error ? error.message : fallback,
  };
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
  return htmlToPlainText(message.text || message.html).replace(/\s+/g, ' ').trim();
}

export function EmailContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const { profiles, activeProfileId } = useAuth();
  const requestedAccountId = searchParams.get('accountId') ?? '';
  const requestedUid = Number(searchParams.get('uid'));
  const [accounts, setAccounts] = useState<EmailAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [messages, setMessages] = useState<EmailMessageSummary[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isCreatingFeed, setIsCreatingFeed] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [feedProfileId, setFeedProfileId] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const readableAccounts = useMemo(() => accounts.filter((account) => account.readable), [accounts]);

  const loadMessages = useCallback(async (accountId: string): Promise<void> => {
    setIsLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (accountId) params.set('accountId', accountId);
      const response = await fetch(`/api/email/messages?${params.toString()}`);
      const data = await response.json() as MessagesResponse;

      const nextAccounts = data.accounts ?? [];
      const nextMessages = data.messages ?? [];
      const nextAccountId = data.selectedAccountId ?? accountId;
      setAccounts(nextAccounts);
      setMessages(nextMessages);
      setSelectedAccountId(nextAccountId);

      if (!response.ok) {
        setError(errorInfoFromResponse(data, 'Failed to load inbox'));
        setSelectedUid(null);
        setSelectedMessage(null);
        setShowReply(false);
        setReplyBody('');
        return;
      }

      setSelectedUid((current) => {
        if (current && nextMessages.some((message) => message.uid === current)) return current;
        if (Number.isSafeInteger(requestedUid) && nextMessages.some((message) => message.uid === requestedUid)) return requestedUid;
        return nextMessages[0]?.uid ?? null;
      });
    } catch (err) {
      setError(errorInfoFromUnknown(err, 'Failed to load inbox'));
      setMessages([]);
      setSelectedUid(null);
      setSelectedMessage(null);
      setShowReply(false);
      setReplyBody('');
    } finally {
      setIsLoadingList(false);
    }
    // Intentionally NOT keyed on selectedAccountId: the caller always passes the
    // account explicitly. Keeping selectedAccountId out of the deps means
    // clicking a different account doesn't change this callback's identity,
    // which would otherwise re-fire the mount effect with the (empty) URL param
    // and snap the view back to the default inbox.
  }, [requestedUid]);

  const loadMessage = useCallback(async (uid: number, accountId: string): Promise<void> => {
    setIsLoadingMessage(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set('accountId', accountId);
      const response = await fetch(`/api/email/messages/${uid}?${params.toString()}`);
      const data = await response.json() as MessageResponse;
      if (!response.ok || !data.message) {
        setError(errorInfoFromResponse(data, 'Failed to load message'));
        setSelectedMessage(null);
        return;
      }
      setSelectedMessage(data.message);
      setShowReply(false);
      setReplyBody('');
    } catch (err) {
      setSelectedMessage(null);
      setError(errorInfoFromUnknown(err, 'Failed to load message'));
    } finally {
      setIsLoadingMessage(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadMessages(requestedAccountId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadMessages, requestedAccountId]);

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
    setActionMessage(null);
    void loadMessages(accountId);
  };

  const sendReply = async (): Promise<void> => {
    if (!visibleMessage || !selectedAccountId || !replyBody.trim()) return;
    setIsSendingReply(true);
    setError(null);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/email/messages/${visibleMessage.uid}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          body: replyBody,
        }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Failed to send reply');
      setReplyBody('');
      setShowReply(false);
      setActionMessage('Reply sent.');
    } catch (err) {
      setError(errorInfoFromUnknown(err, 'Failed to send reply'));
    } finally {
      setIsSendingReply(false);
    }
  };

  const createSenderFeed = async (): Promise<void> => {
    if (!visibleMessage || !selectedAccountId || !visibleMessage.fromEmail || !selectedFeedProfileId) return;
    setIsCreatingFeed(true);
    setError(null);
    setActionMessage(null);

    try {
      const response = await fetch('/api/email/sender-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          sender: visibleMessage.fromEmail,
          profileId: selectedFeedProfileId,
          subscribe: true,
        }),
      });
      const data = await response.json() as SenderFeedResponse;
      if (!response.ok || !data.feedUrl) throw new Error(data.error ?? 'Failed to create sender RSS feed');

      await navigator.clipboard?.writeText(data.feedUrl).catch(() => undefined);
      setActionMessage('Sender feed added to RSS Reader for the selected profile. Private feed URL copied.');
    } catch (err) {
      setError(errorInfoFromUnknown(err, 'Failed to create sender RSS feed'));
    } finally {
      setIsCreatingFeed(false);
    }
  };

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const visibleMessage = selectedUid ? selectedMessage : null;
  const bodyText = previewText(visibleMessage);
  const messageBodyHtml = visibleMessage
    ? renderRichContentHtml(visibleMessage.html || visibleMessage.text, { allowImages: false })
    : '';
  const defaultFeedProfileId = activeProfileId && profiles.some((profile) => profile.id === activeProfileId)
    ? activeProfileId
    : profiles[0]?.id ?? '';
  const selectedFeedProfileId = feedProfileId && profiles.some((profile) => profile.id === feedProfileId)
    ? feedProfileId
    : defaultFeedProfileId;

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
              onClick={() => void loadMessages(selectedAccountId)}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <RefreshIcon size={16} />
              <span>Reload</span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="space-y-2 rounded-lg border border-status-error bg-status-error/10 p-3 text-sm text-status-error">
            <p className="font-medium">{error.message}</p>
            {error.details ? <p className="text-xs opacity-90">Details: {error.details}</p> : null}
            {error.solution ? <p className="text-xs opacity-90">Fix: {error.solution}</p> : null}
            {error.docsUrl ? (
              <a href={error.docsUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs font-medium underline">
                Provider setup docs
              </a>
            ) : null}
          </div>
        ) : null}
        {actionMessage ? <div className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 p-3 text-sm text-accent-secondary">{actionMessage}</div> : null}

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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h2 className="min-w-0 text-xl font-semibold text-text-primary">{visibleMessage.subject}</h2>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {profiles.length > 1 ? (
                        <select
                          value={selectedFeedProfileId}
                          onChange={(event) => setFeedProfileId(event.target.value)}
                          aria-label="RSS feed profile"
                          className="rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm font-medium text-text-secondary focus:border-accent-primary focus:outline-hidden"
                        >
                          {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>{profile.name}</option>
                          ))}
                        </select>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setShowReply((value) => !value)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <ReplyIcon size={16} />
                        <span>Reply</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void createSenderFeed()}
                        disabled={isCreatingFeed || !visibleMessage.fromEmail || !selectedFeedProfileId}
                        title="Create a private RSS feed for this sender"
                        className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isCreatingFeed ? <LoadingSpinner size={16} /> : <RssIcon size={16} />}
                        <span>Sender RSS</span>
                      </button>
                    </div>
                  </div>
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
                {showReply ? (
                  <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-tertiary p-3">
                    <textarea
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      rows={6}
                      placeholder={`Reply to ${visibleMessage.replyTo[0] ?? visibleMessage.from}`}
                      className="w-full resize-y rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm leading-6 text-text-primary focus:border-accent-primary focus:outline-hidden"
                    />
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="inline-flex items-center gap-1 text-xs text-text-muted">
                        <LinkIcon size={13} />
                        <span>Sent through {selectedAccount?.fromEmail}</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowReply(false);
                            setReplyBody('');
                          }}
                          className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-bg-hover"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void sendReply()}
                          disabled={isSendingReply || !replyBody.trim()}
                          className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSendingReply ? <LoadingSpinner size={16} /> : <ReplyIcon size={16} />}
                          <span>Send reply</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {bodyText || messageBodyHtml ? (
                  <div
                    className="rich-content rich-content-compact text-sm"
                    dangerouslySetInnerHTML={{ __html: messageBodyHtml }}
                  />
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
