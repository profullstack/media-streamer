/**
 * Radio Player Modal — volume independence
 *
 * Regression coverage for the stream restarting whenever the volume slider
 * moved: the stream-attach effect used to list `volume`/`isMuted` in its
 * dependencies, so each slider tick destroyed the HLS instance (or reset
 * `audio.src`) and the station buffered from scratch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RadioStream } from '@/hooks/use-radio';

const hlsInstances: Array<{ loadSource: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];

vi.mock('hls.js', () => {
  class MockHls {
    static Events = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError' };
    static isSupported = (): boolean => true;

    loadSource = vi.fn();
    attachMedia = vi.fn();
    on = vi.fn();
    destroy = vi.fn();

    constructor() {
      hlsInstances.push(this);
    }
  }
  return { default: MockHls };
});

let mockStream: RadioStream | null = null;

vi.mock('@/hooks/use-radio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-radio')>();
  return {
    ...actual,
    useRadioStream: (): {
      preferredStream: RadioStream | null;
      isLoading: boolean;
      error: string | null;
      getStream: () => Promise<void>;
    } => ({
      preferredStream: mockStream,
      isLoading: false,
      error: null,
      getStream: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

vi.mock('@/lib/media-session', () => ({
  setMediaSessionMetadata: vi.fn(),
  updateMediaSessionPlaybackState: vi.fn(),
  setMediaSessionActionHandlers: vi.fn(),
  clearMediaSession: vi.fn(),
}));

const { RadioPlayerModal } = await import('./radio-player-modal');

const station = { id: 'st-1', name: 'Test FM' };

const renderPlayer = (): HTMLInputElement => {
  render(<RadioPlayerModal station={station} isOpen onClose={vi.fn()} />);
  return screen.getByLabelText('Volume') as HTMLInputElement;
};

const audioEl = (): HTMLAudioElement =>
  document.querySelector('audio') as HTMLAudioElement;

beforeEach(() => {
  hlsInstances.length = 0;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

describe('RadioPlayerModal volume', () => {
  it('changes element volume without re-attaching a direct stream', () => {
    mockStream = { url: 'https://cdn.example.com/stream.mp3', mediaType: 'mp3', isDirect: true };

    const slider = renderPlayer();
    const audio = audioEl();
    expect(audio.src).toContain('stream.mp3');

    const loadCallsBefore = (HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>).mock
      .calls.length;

    fireEvent.change(slider, { target: { value: '0.3' } });

    expect(audio.volume).toBeCloseTo(0.3);
    expect(audio.src).toContain('stream.mp3');
    // A re-attach would tear the src down and call load() in the cleanup.
    expect(
      (HTMLMediaElement.prototype.load as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(loadCallsBefore);
  });

  it('does not rebuild the HLS instance when the volume changes', () => {
    mockStream = { url: 'https://cdn.example.com/live.m3u8', mediaType: 'hls', isDirect: false };

    const slider = renderPlayer();
    expect(hlsInstances).toHaveLength(1);

    fireEvent.change(slider, { target: { value: '0.5' } });
    fireEvent.change(slider, { target: { value: '0.2' } });

    expect(hlsInstances).toHaveLength(1);
    expect(hlsInstances[0]?.destroy).not.toHaveBeenCalled();
    expect(audioEl().volume).toBeCloseTo(0.2);
  });

  it('mutes and unmutes without re-attaching the stream', () => {
    mockStream = { url: 'https://cdn.example.com/live.m3u8', mediaType: 'hls', isDirect: false };

    renderPlayer();
    const audio = audioEl();

    fireEvent.click(screen.getByLabelText('Mute'));
    expect(audio.volume).toBe(0);

    fireEvent.click(screen.getByLabelText('Unmute'));
    expect(audio.volume).toBeCloseTo(0.8);

    expect(hlsInstances).toHaveLength(1);
    expect(hlsInstances[0]?.destroy).not.toHaveBeenCalled();
  });
});
