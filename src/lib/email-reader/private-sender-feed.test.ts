import { describe, expect, it } from 'vitest';
import {
  buildPrivateSenderFeedUrl,
  extractEmailAddress,
} from './private-sender-feed';

describe('private sender feed helpers', () => {
  it('extracts email addresses from display names', () => {
    expect(extractEmailAddress('Alice Example <Alice@Example.com>')).toBe('alice@example.com');
    expect(extractEmailAddress('not an address')).toBeNull();
  });

  it('builds a private feed URL without credentials in the query string', () => {
    const feedUrl = buildPrivateSenderFeedUrl('https://app.example.com', {
      profileId: 'profile-1',
      accountId: 'account-1',
      senderEmail: 'sender@example.com',
    });
    const url = new URL(feedUrl);

    expect(url.pathname).toBe('/api/email/sender-feed');
    expect(url.searchParams.get('profileId')).toBe('profile-1');
    expect(url.searchParams.get('accountId')).toBe('account-1');
    expect(url.searchParams.get('sender')).toBe('sender@example.com');
    expect(url.searchParams.get('userId')).toBeNull();
    expect(url.searchParams.get('token')).toBeNull();
  });
});
