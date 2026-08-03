export interface ParsedRssFeed {
  feedUrl: string;
  title: string;
  description: string | null;
  siteUrl: string | null;
  imageUrl: string | null;
  language: string | null;
  items: ParsedRssItem[];
}

export interface ParsedRssItem {
  guid: string;
  title: string;
  link: string | null;
  author: string | null;
  summary: string | null;
  content: string | null;
  imageUrl: string | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  publishedAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface RssFeed {
  id: string;
  feedUrl: string;
  siteUrl: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  language: string | null;
  lastFetchedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  lastFetchError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RssSubscription {
  id: string;
  profileId: string;
  feedId: string;
  customTitle: string | null;
  folder: string | null;
  notifyNewItems: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  feed: RssFeed;
}

/**
 * What the reader sidebar needs. The full RssSubscription carries the feed
 * description and language, which nothing in the sidebar renders and which turn
 * a 47k-feed subscription list into a 19 MB response.
 */
export interface RssSubscriptionSummary {
  id: string;
  feedId: string;
  customTitle: string | null;
  folder: string | null;
  notifyNewItems: boolean;
  createdAt: string;
  updatedAt: string;
  feed: Pick<RssFeed, 'id' | 'title' | 'feedUrl' | 'siteUrl' | 'imageUrl' | 'lastFetchedAt' | 'lastFetchError'>;
}

export interface RssSubscriptionPage {
  subscriptions: RssSubscriptionSummary[];
  /** Active subscriptions matching the search, not just the ones on this page. */
  total: number;
}

export interface RssSubscriptionListOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface RssFolderSummary {
  folder: string;
  feedCount: number;
}

export interface RssSubscriptionUpdate {
  customTitle?: string | null;
  folder?: string | null;
  notifyNewItems?: boolean;
  isActive?: boolean;
}

export interface OpmlFeedOutline {
  title: string | null;
  feedUrl: string;
  siteUrl: string | null;
  folder: string | null;
}

export interface RssItem {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  link: string | null;
  author: string | null;
  summary: string | null;
  content: string | null;
  imageUrl: string | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  publishedAt: string | null;
  sourceUpdatedAt: string | null;
  createdAt: string;
}

export interface RssItemWithState extends RssItem {
  feed: Pick<RssFeed, 'id' | 'title' | 'feedUrl' | 'siteUrl' | 'imageUrl'>;
  isRead: boolean;
  isSaved: boolean;
  readAt: string | null;
  savedAt: string | null;
}

export interface RssItemStateInput {
  isRead?: boolean;
  isSaved?: boolean;
}

export interface RssBulkReadStateInput {
  feedId?: string | null;
  isRead: boolean;
}

export interface RssListOptions {
  feedId?: string;
  unreadOnly?: boolean;
  savedOnly?: boolean;
  limit?: number;
  offset?: number;
  /** Newest articles considered per feed, so one busy feed cannot fill the list. */
  perFeedLimit?: number;
}
