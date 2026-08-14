import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeAccount } from './types';

const { mockYtFetch, mockListSubscribedChannels, mockUnsubscribeFromChannel } = vi.hoisted(() => ({
  mockYtFetch: vi.fn(),
  mockListSubscribedChannels: vi.fn(),
  mockUnsubscribeFromChannel: vi.fn(),
}));

vi.mock('./client', () => ({
  ytFetch: mockYtFetch,
}));

vi.mock('./service', () => ({
  listSubscribedChannels: mockListSubscribedChannels,
  unsubscribeFromChannel: mockUnsubscribeFromChannel,
}));

import {
  DEFAULT_DAILY_QUOTA,
  SUBSCRIPTION_WRITE_COST,
  executeBulkSubscriptions,
  fetchAllSubscriptions,
  isQuotaExceededError,
  planBulkSubscriptions,
} from './bulk';

/**
 * Every YouTube call in this file is mocked, so the token fields are never
 * read. Kept out of a string literal because a credential-shaped literal here
 * is indistinguishable from a real leaked token to the secret scanner.
 */
const STUB_VALUE = 'unused-by-mocked-calls';

const account: YouTubeAccount = {
  id: 'account-1',
  userId: 'user-1',
  googleSub: 'google-sub',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
  accessToken: STUB_VALUE,
  refreshToken: STUB_VALUE,
  tokenExpiresAt: '2026-04-20T00:00:00.000Z',
  scopes: ['openid', 'https://www.googleapis.com/auth/youtube.force-ssl'],
  isDefault: true,
  createdAt: '2026-04-19T00:00:00.000Z',
  updatedAt: '2026-04-19T00:00:00.000Z',
};

function subscribedPage(
  items: Array<{ channelId: string; title?: string }>,
  nextPageToken: string | null = null
) {
  return {
    items: items.map((item) => ({
      subscriptionId: `sub-${item.channelId}`,
      channelId: item.channelId,
      title: item.title ?? item.channelId,
      description: '',
      thumbnailUrl: null,
      publishedAt: '2026-01-01T00:00:00Z',
      newItemCount: null,
      totalItemCount: null,
    })),
    nextPageToken,
    prevPageToken: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isQuotaExceededError', () => {
  it('recognises the quota family and ignores unrelated failures', () => {
    expect(isQuotaExceededError(new Error('YouTube API /subscriptions failed (403): quotaExceeded'))).toBe(
      true
    );
    expect(isQuotaExceededError(new Error('dailyLimitExceeded'))).toBe(true);
    expect(isQuotaExceededError(new Error('rateLimitExceeded'))).toBe(true);
    expect(isQuotaExceededError(new Error('channelNotFound'))).toBe(false);
    expect(isQuotaExceededError('nope')).toBe(false);
  });
});

describe('fetchAllSubscriptions', () => {
  it('paginates and charges one unit per page', async () => {
    mockListSubscribedChannels
      .mockResolvedValueOnce(subscribedPage([{ channelId: 'UC_a' }], 'page-2'))
      .mockResolvedValueOnce(subscribedPage([{ channelId: 'UC_b' }]));

    const result = await fetchAllSubscriptions(account);

    expect(result.map.get('UC_a')).toBe('sub-UC_a');
    expect(result.map.get('UC_b')).toBe('sub-UC_b');
    expect(result.quotaUnits).toBe(2);
    expect(mockListSubscribedChannels).toHaveBeenCalledTimes(2);
    expect(mockListSubscribedChannels).toHaveBeenLastCalledWith(account, 'page-2');
  });
});

describe('planBulkSubscriptions', () => {
  it('only queues channels that actually need a write when subscribing', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([{ channelId: 'UC_already' }]));

    const plan = await planBulkSubscriptions(account, 'subscribe', [
      { channelId: 'UC_already', title: 'Already' },
      { channelId: 'UC_new', title: 'New' },
    ]);

    expect(plan.pending).toEqual([{ channelId: 'UC_new', title: 'New' }]);
    expect(plan.skipped.map((s) => s.channelId)).toEqual(['UC_already']);
    expect(plan.estimatedQuotaUnits).toBe(SUBSCRIPTION_WRITE_COST);
    expect(plan.withinDailyQuota).toBe(true);
  });

  it('queues only subscribed channels when unsubscribing, carrying the subscription id', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([{ channelId: 'UC_have' }]));

    const plan = await planBulkSubscriptions(account, 'unsubscribe', [
      { channelId: 'UC_have' },
      { channelId: 'UC_absent' },
    ]);

    expect(plan.pending).toEqual([
      { channelId: 'UC_have', title: 'UC_have', subscriptionId: 'sub-UC_have' },
    ]);
    expect(plan.skipped.map((s) => s.channelId)).toEqual(['UC_absent']);
  });

  it('de-duplicates requested channels', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([]));

    const plan = await planBulkSubscriptions(account, 'subscribe', [
      { channelId: 'UC_dup' },
      { channelId: 'UC_dup' },
    ]);

    expect(plan.pending).toHaveLength(1);
  });

  it('flags a list that cannot fit in one day of quota', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([]));
    const channels = Array.from({ length: 257 }, (_, i) => ({ channelId: `UC_${i}` }));

    const plan = await planBulkSubscriptions(account, 'subscribe', channels);

    expect(plan.estimatedQuotaUnits).toBe(257 * SUBSCRIPTION_WRITE_COST);
    expect(plan.estimatedQuotaUnits).toBeGreaterThan(DEFAULT_DAILY_QUOTA);
    expect(plan.withinDailyQuota).toBe(false);
    expect(plan.dailyWriteCapacity).toBe(200);
  });
});

describe('executeBulkSubscriptions', () => {
  it('inserts each pending channel without a pre-flight probe', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([]));
    mockYtFetch.mockResolvedValue({ id: 'new-sub' });

    const plan = await planBulkSubscriptions(account, 'subscribe', [
      { channelId: 'UC_one', title: 'One' },
      { channelId: 'UC_two', title: 'Two' },
    ]);
    const result = await executeBulkSubscriptions(account, plan);

    expect(result.succeeded.map((s) => s.channelId)).toEqual(['UC_one', 'UC_two']);
    expect(result.failed).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(result.quotaUnitsSpent).toBe(2 * SUBSCRIPTION_WRITE_COST);
    expect(mockYtFetch).toHaveBeenCalledTimes(2);
    expect(mockYtFetch).toHaveBeenNthCalledWith(1, account, {
      path: '/subscriptions',
      method: 'POST',
      params: { part: 'snippet' },
      body: { snippet: { resourceId: { kind: 'youtube#channel', channelId: 'UC_one' } } },
    });
  });

  it('stops immediately on quota exhaustion and reports what is left', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([]));
    mockYtFetch
      .mockResolvedValueOnce({ id: 'sub-1' })
      .mockRejectedValueOnce(new Error('YouTube API /subscriptions failed (403): quotaExceeded'));

    const plan = await planBulkSubscriptions(account, 'subscribe', [
      { channelId: 'UC_one' },
      { channelId: 'UC_two' },
      { channelId: 'UC_three' },
    ]);
    const result = await executeBulkSubscriptions(account, plan);

    expect(result.quotaExceeded).toBe(true);
    expect(result.succeeded.map((s) => s.channelId)).toEqual(['UC_one']);
    expect(result.remaining.map((r) => r.channelId)).toEqual(['UC_two', 'UC_three']);
    // Third channel was never attempted.
    expect(mockYtFetch).toHaveBeenCalledTimes(2);
  });

  it('records a per-channel failure and keeps going', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([]));
    mockYtFetch
      .mockRejectedValueOnce(new Error('YouTube API /subscriptions failed (404): channelNotFound'))
      .mockResolvedValueOnce({ id: 'sub-2' });

    const plan = await planBulkSubscriptions(account, 'subscribe', [
      { channelId: 'UC_bad' },
      { channelId: 'UC_good' },
    ]);
    const result = await executeBulkSubscriptions(account, plan);

    expect(result.failed.map((f) => f.channelId)).toEqual(['UC_bad']);
    expect(result.succeeded.map((s) => s.channelId)).toEqual(['UC_good']);
    expect(result.quotaExceeded).toBe(false);
    expect(result.remaining).toEqual([]);
  });

  it('honours maxWrites so a run can be split across days', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([]));
    mockYtFetch.mockResolvedValue({ id: 'sub' });

    const plan = await planBulkSubscriptions(account, 'subscribe', [
      { channelId: 'UC_one' },
      { channelId: 'UC_two' },
      { channelId: 'UC_three' },
    ]);
    const result = await executeBulkSubscriptions(account, plan, { maxWrites: 2 });

    expect(result.succeeded).toHaveLength(2);
    expect(result.remaining.map((r) => r.channelId)).toEqual(['UC_three']);
    expect(mockYtFetch).toHaveBeenCalledTimes(2);
  });

  it('deletes by the subscription id resolved during planning', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([{ channelId: 'UC_have' }]));
    mockUnsubscribeFromChannel.mockResolvedValue({ subscriptionId: 'sub-UC_have', channelId: 'UC_have' });

    const plan = await planBulkSubscriptions(account, 'unsubscribe', [{ channelId: 'UC_have' }]);
    const result = await executeBulkSubscriptions(account, plan);

    expect(mockUnsubscribeFromChannel).toHaveBeenCalledWith(account, {
      subscriptionId: 'sub-UC_have',
      channelId: 'UC_have',
    });
    expect(result.succeeded).toHaveLength(1);
    expect(mockYtFetch).not.toHaveBeenCalled();
  });

  it('reports progress for each attempted write', async () => {
    mockListSubscribedChannels.mockResolvedValue(subscribedPage([]));
    mockYtFetch.mockResolvedValue({ id: 'sub' });
    const onProgress = vi.fn();

    const plan = await planBulkSubscriptions(account, 'subscribe', [
      { channelId: 'UC_one' },
      { channelId: 'UC_two' },
    ]);
    await executeBulkSubscriptions(account, plan, { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelId: 'UC_two', status: 'ok' }),
      1,
      2
    );
  });
});
