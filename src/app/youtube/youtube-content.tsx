'use client';

/**
 * YouTube home: search bar + results grid + inline IFrame player.
 * Uses the user's default connected account automatically.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout';
import { LoadingSpinner, SearchIcon } from '@/components/ui/icons';

interface PublicYouTubeAccount {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  hasSearchAccess: boolean;
  hasSubscriptionManageAccess: boolean;
  hasCommentWriteAccess: boolean;
  createdAt: string;
}

interface SearchItem {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  thumbnailUrl: string | null;
}

interface SubscriptionChannel {
  subscriptionId: string;
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  newItemCount: number | null;
  totalItemCount: number | null;
}

interface VideoDetails {
  videoId: string;
  description: string;
}

interface VideoComment {
  commentId: string;
  authorDisplayName: string;
  authorProfileImageUrl: string | null;
  authorChannelUrl: string | null;
  publishedAt: string;
  updatedAt: string | null;
  body: string;
  likeCount: number;
  totalReplyCount: number;
}

function formatPublishedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(parsed);
}

export function YouTubeContent(): React.ReactElement {
  const [accounts, setAccounts] = useState<PublicYouTubeAccount[] | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<SearchItem | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [channels, setChannels] = useState<SubscriptionChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channelVideos, setChannelVideos] = useState<SearchItem[]>([]);
  const [loadingChannelVideos, setLoadingChannelVideos] = useState(false);
  const [channelVideosError, setChannelVideosError] = useState<string | null>(null);
  const [subscriptionActionChannelId, setSubscriptionActionChannelId] = useState<string | null>(null);
  const [subscriptionActionError, setSubscriptionActionError] = useState<string | null>(null);
  const [subscriptionActionMessage, setSubscriptionActionMessage] = useState<string | null>(null);
  const [videoDetails, setVideoDetails] = useState<VideoDetails | null>(null);
  const [loadingVideoDetails, setLoadingVideoDetails] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentPostError, setCommentPostError] = useState<string | null>(null);
  const [commentPostMessage, setCommentPostMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/youtube/accounts');
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = (await res.json()) as { accounts: PublicYouTubeAccount[] };
        setAccounts(data.accounts);
        const def = data.accounts.find((a) => a.isDefault) ?? data.accounts[0];
        if (def) setActiveAccountId(def.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts');
      }
    })();
  }, []);

  const noAccounts = accounts !== null && accounts.length === 0;
  const activeAccount = accounts?.find((account) => account.id === activeAccountId) ?? null;
  const needsReconnect = Boolean(activeAccount && !activeAccount.hasSearchAccess);
  const needsSubscriptionReconnect = Boolean(activeAccount && !activeAccount.hasSubscriptionManageAccess);
  const canWriteComments = Boolean(activeAccount?.hasCommentWriteAccess);

  const loadSubscribedChannels = useCallback(
    async (options?: { preserveActive?: boolean; isCancelled?: () => boolean }) => {
      if (!activeAccountId || noAccounts || needsReconnect) return;

      setLoadingChannels(true);
      setChannelsError(null);
      setChannels([]);
      if (!options?.preserveActive) {
        setActiveChannelId(null);
        setChannelVideos([]);
      }

      try {
        const params = new URLSearchParams({ accountId: activeAccountId });
        const res = await fetch(`/api/youtube/subscriptions?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(body.message ?? body.error ?? `Failed to load subscriptions: ${res.status}`);
        }
        const data = (await res.json()) as { items: SubscriptionChannel[] };
        if (options?.isCancelled?.()) return;
        setChannels(data.items);
        setActiveChannelId((current) => {
          if (options?.preserveActive && current && data.items.some((item) => item.channelId === current)) {
            return current;
          }
          return data.items[0]?.channelId ?? null;
        });
      } catch (err) {
        if (!options?.isCancelled?.()) {
          setChannelsError(err instanceof Error ? err.message : 'Failed to load subscriptions');
        }
      } finally {
        if (!options?.isCancelled?.()) setLoadingChannels(false);
      }
    },
    [activeAccountId, noAccounts, needsReconnect]
  );

  useEffect(() => {
    let cancelled = false;

    if (!activeAccountId || noAccounts || needsReconnect) {
      return;
    }

    void loadSubscribedChannels({ isCancelled: () => cancelled });

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, loadSubscribedChannels, noAccounts, needsReconnect]);

  useEffect(() => {
    let cancelled = false;

    if (!activeAccountId || !activeChannelId || needsReconnect) {
      return;
    }

    void (async () => {
      setLoadingChannelVideos(true);
      setChannelVideosError(null);
      setChannelVideos([]);
      try {
        const params = new URLSearchParams({
          accountId: activeAccountId,
          channelId: activeChannelId,
        });
        const res = await fetch(`/api/youtube/subscriptions/videos?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(body.message ?? body.error ?? `Failed to load videos: ${res.status}`);
        }
        const data = (await res.json()) as { items: SearchItem[] };
        if (!cancelled) setChannelVideos(data.items);
      } catch (err) {
        if (!cancelled) {
          setChannelVideosError(err instanceof Error ? err.message : 'Failed to load videos');
        }
      } finally {
        if (!cancelled) setLoadingChannelVideos(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, activeChannelId, needsReconnect]);

  useEffect(() => {
    let cancelled = false;

    if (!activeVideo || !activeAccountId || needsReconnect) {
      return;
    }

    void (async () => {
      setLoadingVideoDetails(true);
      try {
        const params = new URLSearchParams({
          accountId: activeAccountId,
          videoId: activeVideo.videoId,
        });
        const res = await fetch(`/api/youtube/videos?${params.toString()}`);
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as { video?: VideoDetails };
        if (!cancelled) setVideoDetails(data.video ?? null);
      } finally {
        if (!cancelled) setLoadingVideoDetails(false);
      }
    })();

    void (async () => {
      setLoadingComments(true);
      try {
        const params = new URLSearchParams({
          accountId: activeAccountId,
          videoId: activeVideo.videoId,
        });
        const res = await fetch(`/api/youtube/comments?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(body.message ?? body.error ?? `Failed to load comments: ${res.status}`);
        }
        const data = (await res.json()) as { items?: VideoComment[] };
        if (!cancelled) setComments(data.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setCommentsError(err instanceof Error ? err.message : 'Failed to load comments');
        }
      } finally {
        if (!cancelled) setLoadingComments(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, activeVideo, needsReconnect]);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;
      setSearching(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (activeAccountId) params.set('accountId', activeAccountId);
        const res = await fetch(`/api/youtube/search?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(body.message ?? body.error ?? `Search failed: ${res.status}`);
        }
        const data = (await res.json()) as { items: SearchItem[] };
        setResults(data.items);
        setActiveVideo((current) =>
          data.items.find((item) => item.videoId === current?.videoId) ?? current
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    },
    [query, activeAccountId]
  );

  const activeChannel = channels.find((channel) => channel.channelId === activeChannelId) ?? null;
  const subscriptionByChannelId = new Map(channels.map((channel) => [channel.channelId, channel]));

  const resetActiveVideoMetadata = () => {
    setDescriptionExpanded(false);
    setVideoDetails(null);
    setLoadingVideoDetails(false);
    setComments([]);
    setLoadingComments(false);
    setCommentsError(null);
    setCommentBody('');
    setCommentPostError(null);
    setCommentPostMessage(null);
  };

  const selectVideo = (item: SearchItem) => {
    resetActiveVideoMetadata();
    setActiveVideo(item);
  };

  const handleSubscriptionAction = async (channelId: string, subscriptionId?: string) => {
    if (!activeAccountId) return;
    if (needsSubscriptionReconnect) {
      setSubscriptionActionError('Reconnect this YouTube account before managing subscriptions.');
      return;
    }

    setSubscriptionActionChannelId(channelId);
    setSubscriptionActionError(null);
    setSubscriptionActionMessage(null);

    try {
      const res = await fetch('/api/youtube/subscriptions', {
        method: subscriptionId ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: activeAccountId,
          channelId,
          subscriptionId,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? `Subscription update failed: ${res.status}`);
      }

      await loadSubscribedChannels({ preserveActive: true });
      setSubscriptionActionMessage(subscriptionId ? 'Unsubscribed.' : 'Subscribed.');
    } catch (err) {
      setSubscriptionActionError(err instanceof Error ? err.message : 'Failed to update subscription');
    } finally {
      setSubscriptionActionChannelId(null);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVideo || !activeAccountId || !commentBody.trim() || !canWriteComments) return;

    setPostingComment(true);
    setCommentPostError(null);
    setCommentPostMessage(null);

    try {
      const res = await fetch('/api/youtube/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: activeAccountId,
          videoId: activeVideo.videoId,
          body: commentBody.trim(),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.message ?? body.error ?? `Failed to post comment: ${res.status}`);
      }

      const data = (await res.json()) as { comment: VideoComment };
      setComments((current) => [data.comment, ...current.filter((item) => item.commentId !== data.comment.commentId)]);
      setCommentBody('');
      setCommentPostMessage('Comment posted.');
    } catch (err) {
      setCommentPostError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  const handleAccountChange = (accountId: string) => {
    setActiveAccountId(accountId);
    setResults([]);
    setActiveVideo(null);
    resetActiveVideoMetadata();
    setError(null);
    setChannels([]);
    setActiveChannelId(null);
    setChannelVideos([]);
    setSubscriptionActionError(null);
    setSubscriptionActionMessage(null);
  };

  const activeVideoSubscription = activeVideo ? subscriptionByChannelId.get(activeVideo.channelId) : null;
  const activeDescription = videoDetails?.description ?? activeVideo?.description ?? '';
  const hasLongDescription = activeDescription.length > 280 || activeDescription.includes('\n');
  const visibleDescription =
    descriptionExpanded || !hasLongDescription ? activeDescription : `${activeDescription.slice(0, 280).trimEnd()}...`;
  const commentComposerDisabled = !activeVideo || !activeAccountId || !canWriteComments || postingComment;

  const activeVideoPanel = activeVideo ? <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-video w-full overflow-hidden bg-black">
        <iframe
          key={activeVideo.videoId}
          src={`https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
      <div className="border-t border-border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight">{activeVideo.title}</h2>
            <dl className="mt-3 grid gap-x-3 gap-y-2 text-sm text-muted-foreground sm:grid-cols-[auto_1fr]">
              <dt className="font-medium text-foreground">Channel</dt>
              <dd>
                <a
                  href={`https://www.youtube.com/channel/${activeVideo.channelId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground hover:underline"
                >
                  {activeVideo.channelTitle}
                </a>
              </dd>
              <dt className="font-medium text-foreground">Published</dt>
              <dd>{formatPublishedAt(activeVideo.publishedAt)}</dd>
            </dl>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              disabled={subscriptionActionChannelId === activeVideo.channelId || needsSubscriptionReconnect}
              onClick={() => handleSubscriptionAction(activeVideo.channelId, activeVideoSubscription?.subscriptionId)}
              className="inline-flex items-center rounded-sm border border-border px-3 py-2 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {subscriptionActionChannelId === activeVideo.channelId
                ? 'Updating...'
                : activeVideoSubscription
                  ? 'Unsubscribe'
                  : 'Subscribe'}
            </button>
            <a
              href={`https://www.youtube.com/watch?v=${activeVideo.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-sm border border-border px-3 py-2 text-sm hover:bg-accent"
            >
              Open on YouTube
            </a>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Description</h3>
            {loadingVideoDetails ? <span className="text-xs text-muted-foreground">Loading full description...</span> : null}
          </div>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
            {visibleDescription || 'No description available.'}
          </p>
          {hasLongDescription ? <button
              type="button"
              onClick={() => setDescriptionExpanded((value) => !value)}
              className="mt-2 text-sm font-medium text-accent-primary hover:underline"
            >
              {descriptionExpanded ? 'Show less' : 'Read more'}
            </button> : null}
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="text-base font-semibold">Comments</h3>
            {loadingComments ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoadingSpinner size={16} />
                <span>Loading comments...</span>
              </div> : null}
          </div>

          <form onSubmit={handleCommentSubmit} className="mb-5">
            <label htmlFor="youtube-comment" className="sr-only">
              Add a comment
            </label>
            <textarea
              id="youtube-comment"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder={
                canWriteComments
                  ? 'Add a comment...'
                  : 'Reconnect this YouTube account to enable comment posting.'
              }
              disabled={!activeAccountId || !canWriteComments || postingComment}
              rows={3}
              maxLength={10000}
              className="w-full resize-y rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {canWriteComments
                  ? 'Posting uses your connected YouTube account.'
                  : 'Comment posting is disabled until this account has YouTube comment access.'}
              </p>
              <button
                type="submit"
                disabled={commentComposerDisabled || !commentBody.trim()}
                className="inline-flex items-center justify-center rounded-sm bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {postingComment ? 'Posting...' : 'Comment'}
              </button>
            </div>
            {commentPostError ? <div className="mt-2 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {commentPostError}
              </div> : null}
            {commentPostMessage ? <div className="mt-2 rounded-sm border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                {commentPostMessage}
              </div> : null}
          </form>

          {commentsError ? <div className="rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {commentsError}
            </div> : null}

          {!loadingComments && !commentsError && comments.length === 0 ? <div className="rounded-sm border border-border bg-background p-4 text-sm text-muted-foreground">
              No comments found for this video.
            </div> : null}

          {comments.length > 0 ? <div className="space-y-4">
              {comments.map((comment) => (
                <article key={comment.commentId} className="flex min-w-0 gap-3">
                  {comment.authorProfileImageUrl ? <div
                      aria-hidden="true"
                      className="h-9 w-9 shrink-0 rounded-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${comment.authorProfileImageUrl})` }}
                    /> : <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {comment.authorChannelUrl ? <a
                          href={comment.authorChannelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-words text-sm font-medium hover:underline"
                        >
                          {comment.authorDisplayName}
                        </a> : <span className="break-words text-sm font-medium">{comment.authorDisplayName}</span>}
                      <time dateTime={comment.publishedAt} className="text-xs text-muted-foreground">
                        {formatTimestamp(comment.publishedAt)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
                      {comment.body}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{comment.likeCount} likes</span>
                      {comment.totalReplyCount > 0 ? <span>{comment.totalReplyCount} replies</span> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div> : null}
        </div>
      </div>
    </div> : null;

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">YouTube</h1>
          <div className="flex items-center gap-2">
            {accounts && accounts.length > 1 ? <select
                value={activeAccountId ?? ''}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName ?? a.email ?? a.id}
                    {a.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select> : null}
            <Link
              href="/youtube/accounts"
              className="rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-hover"
            >
              Manage accounts
            </Link>
          </div>
        </div>

        {noAccounts ? <div className="mb-4 rounded-sm border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
            No YouTube account connected yet.{' '}
            <Link href="/youtube/accounts" className="text-blue-400 hover:underline">
              Connect one
            </Link>{' '}
            to start searching and watching.
          </div> : null}
        {needsReconnect ? <div className="mb-4 rounded-sm border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            This account was connected without YouTube search access.{' '}
            <Link href="/youtube/accounts" className="text-blue-400 hover:underline">
              Reconnect it from Manage accounts
            </Link>{' '}
            and accept the YouTube permission prompt.
          </div> : null}
        {!needsReconnect && needsSubscriptionReconnect ? <div className="mb-4 rounded-sm border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            This account was connected without YouTube subscription management access.{' '}
            <Link href="/youtube/accounts" className="text-blue-400 hover:underline">
              Reconnect it from Manage accounts
            </Link>{' '}
            and accept the YouTube permission prompt.
          </div> : null}
        {subscriptionActionError ? <div className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {subscriptionActionError}
          </div> : null}
        {subscriptionActionMessage ? <div className="mb-4 rounded-sm border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm text-green-400">
            {subscriptionActionMessage}
          </div> : null}

        {activeVideoPanel}

        {!noAccounts && !needsReconnect ? <section className="mb-8">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Subscribed channels</h2>
                <p className="text-sm text-muted-foreground">
                  {activeChannel ? `Recent videos from ${activeChannel.title}` : 'Pick a channel to browse recent videos.'}
                </p>
              </div>
              {loadingChannels ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoadingSpinner size={16} />
                  <span>Loading channels…</span>
                </div> : null}
            </div>

            {channelsError ? <div className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                {channelsError}
              </div> : null}

            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="max-h-[520px] overflow-y-auto rounded-sm border border-border bg-card">
                {channels.length === 0 && !loadingChannels ? <div className="p-4 text-sm text-muted-foreground">
                    No subscribed channels found for this account.
                  </div> : null}
                {channels.map((channel) => {
                  const isActive = channel.channelId === activeChannelId;
                  return (
                    <div
                      key={channel.subscriptionId}
                      className={`flex items-center gap-2 border-b border-border px-3 py-3 transition-colors last:border-b-0 hover:bg-accent ${isActive ? 'bg-accent' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveChannelId(channel.channelId)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        {channel.thumbnailUrl ? <img
                            src={channel.thumbnailUrl}
                            alt=""
                            className="h-11 w-11 shrink-0 rounded-full object-cover"
                          /> : <div className="h-11 w-11 shrink-0 rounded-full bg-muted" />}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{channel.title}</div>
                          {channel.newItemCount !== null && channel.newItemCount > 0 ? <div className="text-xs text-muted-foreground">
                              {channel.newItemCount} new
                            </div> : <div className="text-xs text-muted-foreground">
                              {channel.totalItemCount !== null ? `${channel.totalItemCount} videos` : 'Subscribed'}
                            </div>}
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={subscriptionActionChannelId === channel.channelId || needsSubscriptionReconnect}
                        onClick={() => handleSubscriptionAction(channel.channelId, channel.subscriptionId)}
                        className="shrink-0 rounded-sm border border-border px-2 py-1 text-xs hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {subscriptionActionChannelId === channel.channelId ? '...' : 'Unsubscribe'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="min-h-[240px]">
                {channelVideosError ? <div className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                    {channelVideosError}
                  </div> : null}

                {loadingChannelVideos ? <div className="flex min-h-[240px] items-center justify-center rounded-sm border border-border bg-card text-sm text-muted-foreground">
                    <LoadingSpinner size={18} />
                    <span className="ml-2">Loading videos…</span>
                  </div> : null}

                {!loadingChannelVideos && activeChannel && channelVideos.length === 0 ? <div className="flex min-h-[240px] items-center justify-center rounded-sm border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    No recent videos found for this channel.
                  </div> : null}

                {!loadingChannelVideos && channelVideos.length > 0 ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {channelVideos.map((item) => (
                      <button
                        type="button"
                        key={item.videoId}
                        onClick={() => selectVideo(item)}
                        className="group text-left"
                      >
                        <div className="aspect-video w-full overflow-hidden rounded-sm bg-muted">
                          {item.thumbnailUrl ? <img
                              src={item.thumbnailUrl}
                              alt={item.title}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            /> : null}
                        </div>
                        <div className="mt-2 line-clamp-2 text-sm font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{formatPublishedAt(item.publishedAt)}</div>
                      </button>
                    ))}
                  </div> : null}
              </div>
            </div>
          </section> : null}

        <div className="mb-3">
          <h2 className="text-lg font-semibold">Search YouTube</h2>
        </div>
        <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <SearchIcon className="text-text-muted" size={18} />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search YouTube…"
              className="w-full rounded-lg border border-border-default bg-bg-secondary py-3 pl-11 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-hidden focus:ring-1 focus:ring-accent-primary"
              disabled={noAccounts || needsReconnect}
            />
          </div>
          <button
            type="submit"
            disabled={searching || noAccounts || needsReconnect}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50 md:min-w-[140px]"
          >
            {searching ? <>
                <LoadingSpinner className="text-white" size={18} />
                <span>Searching…</span>
              </> : <>
                <SearchIcon className="text-white" size={18} />
                <span>Search</span>
              </>}
          </button>
        </form>

        {error ? <div className="mb-4 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {results.map((item) => (
            <button
              type="button"
              key={item.videoId}
              onClick={() => selectVideo(item)}
              className="text-left group"
            >
              <div className="aspect-video w-full overflow-hidden rounded-sm bg-muted">
                {item.thumbnailUrl ? <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  /> : null}
              </div>
              <div
                className="mt-2 line-clamp-2 text-sm font-medium"
                dangerouslySetInnerHTML={{ __html: item.title }}
              />
              <div className="text-xs text-muted-foreground">{item.channelTitle}</div>
            </button>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
