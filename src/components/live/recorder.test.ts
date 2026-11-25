import { describe, expect, it } from 'vitest';
import { AUDIO_BPS, CHUNK_MS, VIDEO_BPS, endedMessage, formatElapsed, pickRecorderMime } from './recorder';
import { MAX_CHUNK_BYTES } from '@/lib/c0mpute-live/sessions';

describe('recorder', () => {
  it('picks the first supported format, h264 first', () => {
    expect(pickRecorderMime(() => true)).toBe('video/webm;codecs=h264,opus');
    expect(pickRecorderMime((m) => m.includes('vp8'))).toBe('video/webm;codecs=vp8,opus');
    expect(pickRecorderMime((m) => m === 'video/mp4')).toBe('video/mp4');
    expect(pickRecorderMime(() => false)).toBeNull();
    expect(
      pickRecorderMime(() => {
        throw new Error('no');
      })
    ).toBeNull();
  });

  it('keeps a chunk under what the server takes', () => {
    const bytes = ((VIDEO_BPS + AUDIO_BPS) / 8) * (CHUNK_MS / 1000);
    expect(bytes).toBeLessThan(MAX_CHUNK_BYTES * 0.75);
  });

  it('formats the timer', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(75)).toBe('01:15');
    expect(formatElapsed(3725)).toBe('1:02:05');
  });

  it('says why a stream stopped, and nothing for a plain stop', () => {
    expect(endedMessage('idle')).toMatch(/20 seconds/);
    expect(endedMessage('stopped')).toBeNull();
    expect(endedMessage(null)).toBeNull();
  });
});
