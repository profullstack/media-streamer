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
}
