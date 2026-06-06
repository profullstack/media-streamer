'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import {
  CheckIcon,
  DownloadIcon,
  EditIcon,
  ExternalLinkIcon,
  FolderIcon,
  LoadingSpinner,
  PlusIcon,
  RefreshIcon,
  RssIcon,
  TrashIcon,
} from '@/components/ui/icons';

interface RssFeedSummary {
  id: string;
  title: string;
  feedUrl: string;
  siteUrl: string | null;
  imageUrl: string | null;
}

interface RssSubscription {
  id: string;
  profileId: string;
  feedId: string;
  customTitle: string | null;
  folder: string | null;
  notifyNewItems: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  feed: RssFeedSummary & {
    description: string | null;
    lastFetchedAt: string | null;
    lastFetchError: string | null;
  };
}

interface RssItem {
  id: string;
  feedId: string;
  title: string;
  link: string | null;
  author: string | null;
  summary: string | null;
  content: string | null;
  publishedAt: string | null;
  feed: RssFeedSummary;
  isRead: boolean;
  isSaved: boolean;
}

interface RssResponse {
  subscriptions: RssSubscription[];
  items: RssItem[];
}

interface ImportResponse {
  total: number;
  imported: Array<{ feedUrl: string; feedId: string; title: string; folder: string | null }>;
  failed: Array<{ feedUrl: string; title: string | null; error: string }>;
}

function stripHtml(value: string | null | undefined): string {
  return (value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function displayDate(value: string | null): string {
  if (!value) return 'No date';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RssContent(): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [subscriptions, setSubscriptions] = useState<RssSubscription[]>([]);
  const [items, setItems] = useState<RssItem[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFolder, setEditFolder] = useState('');

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? items[0] ?? null,
    [items, selectedItemId]
  );

  const folders = useMemo(() => {
    const names = new Set(subscriptions.map((sub) => sub.folder).filter((folder): folder is string => Boolean(folder)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [subscriptions]);

  const loadReader = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (selectedFeedId !== 'all') params.set('feedId', selectedFeedId);
    if (showUnreadOnly) params.set('unread', 'true');
    if (showSavedOnly) params.set('saved', 'true');

    try {
      const response = await fetch(`/api/rss?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load RSS reader');
      const data = await response.json() as RssResponse;
      setSubscriptions(data.subscriptions);
      setItems(data.items);
      setSelectedItemId((current) => current && data.items.some((item) => item.id === current) ? current : data.items[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RSS reader');
    } finally {
      setIsLoading(false);
    }
  }, [selectedFeedId, showSavedOnly, showUnreadOnly]);

  useEffect(() => {
    void loadReader();
  }, [loadReader]);

  const addFeed = async (): Promise<void> => {
    if (!feedUrl.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedUrl: feedUrl.trim(),
          folder: newFolder.trim() || null,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to add feed');
      setFeedUrl('');
      setNewFolder('');
      await loadReader();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed');
    } finally {
      setIsSaving(false);
    }
  };

  const importOpml = async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.set('file', file);
    setIsSaving(true);
    setImportMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/rss/import', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json() as ImportResponse | { error?: string };
      if (!response.ok) throw new Error('error' in data ? data.error : 'Failed to import OPML');
      const result = data as ImportResponse;
      setImportMessage(`Imported ${result.imported.length} of ${result.total} feeds${result.failed.length ? `; ${result.failed.length} failed` : ''}.`);
      await loadReader();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import OPML');
    } finally {
      setIsSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const exportOpml = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/rss/export');
      if (!response.ok) throw new Error('Failed to export OPML');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `bittorrented-rss-${date}.opml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setImportMessage('OPML export started.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export OPML');
    } finally {
      setIsSaving(false);
    }
  };

  const updateFeed = async (feedId: string): Promise<void> => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/rss?feedId=${encodeURIComponent(feedId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customTitle: editTitle.trim() || null,
          folder: editFolder.trim() || null,
        }),
      });
      if (!response.ok) throw new Error('Failed to update feed');
      setEditingFeedId(null);
      await loadReader();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feed');
    } finally {
      setIsSaving(false);
    }
  };

  const refreshFeed = async (feedId: string): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/rss/${feedId}/refresh`, { method: 'POST' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to refresh feed');
      await loadReader();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh feed');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFeed = async (feedId: string): Promise<void> => {
    if (!confirm('Delete this RSS feed subscription?')) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/rss?feedId=${encodeURIComponent(feedId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete feed');
      if (selectedFeedId === feedId) setSelectedFeedId('all');
      await loadReader();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete feed');
    } finally {
      setIsSaving(false);
    }
  };

  const updateItemState = async (item: RssItem, input: { isRead?: boolean; isSaved?: boolean }): Promise<void> => {
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, ...input } : candidate));
    await fetch(`/api/rss/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  };

  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <RssIcon size={28} className="text-accent-primary" />
            <div>
              <h1 className="text-2xl font-bold text-text-primary">RSS Reader</h1>
              <p className="text-sm text-text-muted">{subscriptions.length} feeds · {items.length} visible articles</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              aria-label="OPML file"
              accept=".opml,.xml,text/xml"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importOpml(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              Import OPML
            </button>
            <button
              type="button"
              onClick={() => void exportOpml()}
              disabled={isSaving || subscriptions.length === 0}
              className="flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <DownloadIcon size={16} />
              <span>Export OPML</span>
            </button>
            <button
              type="button"
              onClick={() => void loadReader()}
              className="flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <RefreshIcon size={16} />
              <span>Reload</span>
            </button>
          </div>
        </div>

        {error ? <div className="rounded-lg border border-status-error bg-status-error/10 p-3 text-sm text-status-error">{error}</div> : null}
        {importMessage ? <div className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 p-3 text-sm text-accent-secondary">{importMessage}</div> : null}

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(360px,0.95fr)_minmax(420px,1.25fr)]">
          <aside className="space-y-4 rounded-lg border border-border-subtle bg-bg-secondary p-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={feedUrl}
                  onChange={(event) => setFeedUrl(event.target.value)}
                  placeholder="https://example.com/feed.xml"
                  className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => void addFeed()}
                  disabled={isSaving || !feedUrl.trim()}
                  aria-label="Add RSS feed"
                  className="rounded-lg bg-accent-primary p-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? <LoadingSpinner size={18} /> : <PlusIcon size={18} />}
                </button>
              </div>
              <input
                value={newFolder}
                onChange={(event) => setNewFolder(event.target.value)}
                placeholder="Folder"
                className="w-full rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-hidden"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowUnreadOnly((value) => !value)}
                className={cn('rounded-lg px-3 py-2 text-xs font-medium', showUnreadOnly ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary')}
              >
                Unread
              </button>
              <button
                type="button"
                onClick={() => setShowSavedOnly((value) => !value)}
                className={cn('rounded-lg px-3 py-2 text-xs font-medium', showSavedOnly ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary')}
              >
                Saved
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedFeedId('all')}
                className={cn('w-full rounded-lg px-3 py-2 text-left text-sm', selectedFeedId === 'all' ? 'bg-bg-active text-text-primary' : 'text-text-secondary hover:bg-bg-hover')}
              >
                All feeds
              </button>

              {folders.map((folder) => (
                <div key={folder} className="space-y-1">
                  <div className="flex items-center gap-2 px-3 pt-2 text-xs font-semibold uppercase text-text-muted">
                    <FolderIcon size={14} />
                    <span>{folder}</span>
                  </div>
                  {subscriptions.filter((sub) => sub.folder === folder).map((sub) => (
                    <FeedRow
                      key={sub.id}
                      subscription={sub}
                      selectedFeedId={selectedFeedId}
                      editingFeedId={editingFeedId}
                      editTitle={editTitle}
                      editFolder={editFolder}
                      setSelectedFeedId={setSelectedFeedId}
                      setEditingFeedId={setEditingFeedId}
                      setEditTitle={setEditTitle}
                      setEditFolder={setEditFolder}
                      onUpdate={updateFeed}
                      onRefresh={refreshFeed}
                      onDelete={deleteFeed}
                    />
                  ))}
                </div>
              ))}

              {subscriptions.filter((sub) => !sub.folder).map((sub) => (
                <FeedRow
                  key={sub.id}
                  subscription={sub}
                  selectedFeedId={selectedFeedId}
                  editingFeedId={editingFeedId}
                  editTitle={editTitle}
                  editFolder={editFolder}
                  setSelectedFeedId={setSelectedFeedId}
                  setEditingFeedId={setEditingFeedId}
                  setEditTitle={setEditTitle}
                  setEditFolder={setEditFolder}
                  onUpdate={updateFeed}
                  onRefresh={refreshFeed}
                  onDelete={deleteFeed}
                />
              ))}
            </div>
          </aside>

          <section className="min-h-[520px] rounded-lg border border-border-subtle bg-bg-secondary">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-text-muted">
                <LoadingSpinner size={20} />
                <span>Loading articles...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-sm text-text-muted">No RSS articles match the current filters.</div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedItemId(item.id);
                      if (!item.isRead) void updateItemState(item, { isRead: true });
                    }}
                    className={cn(
                      'block w-full p-4 text-left transition-colors hover:bg-bg-hover',
                      selectedItem?.id === item.id ? 'bg-bg-active' : '',
                      item.isRead ? 'opacity-75' : ''
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-medium text-accent-primary">{item.feed.title}</span>
                      <span className="shrink-0 text-xs text-text-muted">{displayDate(item.publishedAt)}</span>
                    </div>
                    <h2 className="line-clamp-2 text-sm font-semibold text-text-primary">{item.title}</h2>
                    <p className="mt-2 line-clamp-2 text-xs text-text-muted">{stripHtml(item.summary ?? item.content)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <article className="min-h-[520px] rounded-lg border border-border-subtle bg-bg-secondary p-5">
            {selectedItem ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-accent-primary">{selectedItem.feed.title}</p>
                    <h2 className="mt-1 text-xl font-semibold text-text-primary">{selectedItem.title}</h2>
                    <p className="mt-2 text-sm text-text-muted">{displayDate(selectedItem.publishedAt)}{selectedItem.author ? ` · ${selectedItem.author}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void updateItemState(selectedItem, { isSaved: !selectedItem.isSaved })}
                    className={cn('rounded-lg px-3 py-2 text-sm font-medium', selectedItem.isSaved ? 'bg-accent-secondary/15 text-accent-secondary' : 'bg-bg-tertiary text-text-secondary')}
                  >
                    {selectedItem.isSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
                <p className="text-sm leading-6 text-text-secondary">{stripHtml(selectedItem.content ?? selectedItem.summary) || 'No article summary available.'}</p>
                {selectedItem.link ? (
                  <a
                    href={selectedItem.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
                  >
                    <ExternalLinkIcon size={16} />
                    <span>Open article</span>
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-muted">Select an article to preview it.</p>
            )}
          </article>
        </div>
      </div>
    </MainLayout>
  );
}

interface FeedRowProps {
  subscription: RssSubscription;
  selectedFeedId: string;
  editingFeedId: string | null;
  editTitle: string;
  editFolder: string;
  setSelectedFeedId: (feedId: string) => void;
  setEditingFeedId: (feedId: string | null) => void;
  setEditTitle: (title: string) => void;
  setEditFolder: (folder: string) => void;
  onUpdate: (feedId: string) => Promise<void>;
  onRefresh: (feedId: string) => Promise<void>;
  onDelete: (feedId: string) => Promise<void>;
}

function FeedRow({
  subscription,
  selectedFeedId,
  editingFeedId,
  editTitle,
  editFolder,
  setSelectedFeedId,
  setEditingFeedId,
  setEditTitle,
  setEditFolder,
  onUpdate,
  onRefresh,
  onDelete,
}: FeedRowProps): React.ReactElement {
  const title = subscription.customTitle ?? subscription.feed.title;

  if (editingFeedId === subscription.feedId) {
    return (
      <div className="space-y-2 rounded-lg border border-border-default bg-bg-tertiary p-2">
        <input
          value={editTitle}
          onChange={(event) => setEditTitle(event.target.value)}
          aria-label="Feed title"
          className="w-full rounded-md border border-border-default bg-bg-primary px-2 py-1 text-sm text-text-primary"
        />
        <input
          value={editFolder}
          onChange={(event) => setEditFolder(event.target.value)}
          aria-label="Feed folder"
          className="w-full rounded-md border border-border-default bg-bg-primary px-2 py-1 text-sm text-text-primary"
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => void onUpdate(subscription.feedId)} aria-label="Save feed changes" className="rounded-md bg-accent-primary p-2 text-white">
            <CheckIcon size={14} />
          </button>
          <button type="button" onClick={() => setEditingFeedId(null)} className="rounded-md px-2 text-xs text-text-muted hover:bg-bg-hover">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group rounded-lg', selectedFeedId === subscription.feedId ? 'bg-bg-active' : 'hover:bg-bg-hover')}>
      <button
        type="button"
        onClick={() => setSelectedFeedId(subscription.feedId)}
        className="w-full min-w-0 px-3 py-2 text-left"
      >
        <span className="block truncate text-sm font-medium text-text-primary">{title}</span>
        <span className="block truncate text-xs text-text-muted">{subscription.feed.lastFetchError ?? subscription.feed.feedUrl}</span>
      </button>
      <div className="flex gap-1 px-2 pb-2">
        <button
          type="button"
          onClick={() => {
            setEditingFeedId(subscription.feedId);
            setEditTitle(subscription.customTitle ?? subscription.feed.title);
            setEditFolder(subscription.folder ?? '');
          }}
          aria-label={`Edit ${title}`}
          className="rounded-md p-1.5 text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
        >
          <EditIcon size={14} />
        </button>
        <button type="button" onClick={() => void onRefresh(subscription.feedId)} aria-label={`Refresh ${title}`} className="rounded-md p-1.5 text-text-muted hover:bg-bg-tertiary hover:text-text-primary">
          <RefreshIcon size={14} />
        </button>
        <button type="button" onClick={() => void onDelete(subscription.feedId)} aria-label={`Delete ${title}`} className="rounded-md p-1.5 text-text-muted hover:bg-status-error/10 hover:text-status-error">
          <TrashIcon size={14} />
        </button>
      </div>
    </div>
  );
}
