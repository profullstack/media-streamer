import { describe, expect, it, vi } from 'vitest';
import {
  buildPrivateSenderFeedUrl,
  extractEmailAddress,
  signPrivateSenderFeed,
  verifyPrivateSenderFeed,
} from './private-sender-feed';

describe('private sender feed helpers', () => {
  it('extracts email addresses from display names', () => {
    expect(extractEmailAddress('Alice Example <Alice@Example.com>')).toBe('alice@example.com');
    expect(extractEmailAddress('not an address')).toBeNull();
  });

  it('signs feed URLs for a specific user, account, and sender', () => {
    vi.stubEnv('EMAIL_FEED_SECRET', 'test-secret');
    const input = {
      userId: 'user-1',
      accountId: 'account-1',
      senderEmail: 'sender@example.com',
    };

    const token = signPrivateSenderFeed(input);

    expect(verifyPrivateSenderFeed(input, token)).toBe(true);
    expect(verifyPrivateSenderFeed({ ...input, senderEmail: 'other@example.com' }, token)).toBe(false);
  });

  it('builds a private feed URL with a verifiable token', () => {
    vi.stubEnv('EMAIL_FEED_SECRET', 'test-secret');

    const feedUrl = buildPrivateSenderFeedUrl('https://app.example.com', {
      userId: 'user-1',
      accountId: 'account-1',
      senderEmail: 'sender@example.com',
    });
    const url = new URL(feedUrl);

    expect(url.pathname).toBe('/api/email/sender-feed');
    expect(url.searchParams.get('sender')).toBe('sender@example.com');
    expect(url.searchParams.get('token')).toBeTruthy();
  });
});
