import { beforeEach, describe, expect, it, vi } from 'vitest';

import { publicChannels } from './service';
import type { Channel } from '@/lib/iptv';

describe('publicChannels', () => {
  const channels: Channel[] = [
    {
      id: 'c1',
      name: 'Sky Sports',
      // The whole reason resale needs its own stream path: this URL carries the
      // owner's provider credentials.
      url: 'http://line.example.com/live/owneruser/ownerpass/1234.m3u8',
      group: 'Sports',
    },
  ];

  it('strips the upstream url before anything reaches a buyer', () => {
    const [pub] = publicChannels(channels);
    expect(pub).not.toHaveProperty('url');
    expect(JSON.stringify(pub)).not.toContain('ownerpass');
    expect(JSON.stringify(pub)).not.toContain('owneruser');
  });

  it('keeps everything a buyer legitimately needs to choose a channel', () => {
    const [pub] = publicChannels(channels);
    expect(pub.id).toBe('c1');
    expect(pub.name).toBe('Sky Sports');
    expect(pub.group).toBe('Sports');
  });
});
