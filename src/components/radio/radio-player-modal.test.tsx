/**
 * Radio Player Modal — volume independence
 *
 * Regression coverage for the stream restarting whenever the volume slider
 * moved: the stream-attach effect used to list `volume`/`isMuted` in its
 * dependencies, so each slider tick tore the stream down and the station
 * buffered from scratch.
 *
 * The assertions moved when the component stopped building its own hls.js and
 * started calling `attachSource`, but the thing being guarded did not: an
 * attach per station, never an attach per slider tick. Mocking the package
 * rather than hls.js also makes the test say what it means — this component's
 * job is to attach a source once and then leave it alone, and which engine
 * ends up carrying it is deliberately not its business any more.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RadioStream } from '@/hooks/use-radio';

const attachCalls: Array<{ src: string; live?: boolean; kind?: string }> = [];
const destroyed = vi.fn();

vi.mock('@profullstack/player', () => ({
  attachSource: vi.fn(async (media: HTMLMediaElement, options: { src: string }) => {
    attachCalls.push(options as { src: string });
    // The real native engine sets src; the tests below read it, so the double
    // has to as well or it would be checking nothing.
    media.src = options.src;
    return Promise.resolve({ destroy: destroyed, engine: 'native', kind: 'audio', levels: () => [] });
  }),
}));

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

const audioEl = (): HTMLAudioElement => document.querySelector('audio') as HTMLAudioElement;

beforeEach(() => {
  attachCalls.length = 0;
  destroyed.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

describe('RadioPlayerModal volume', () => {
  it('changes element volume without re-attaching a direct stream', () => {
    mockStream = { url: 'https://cdn.example.com/stream.mp3', mediaType: 'mp3', isDirect: true };

    const slider = renderPlayer();
    expect(attachCalls).toHaveLength(1);

    fireEvent.change(slider, { target: { value: '0.3' } });

    expect(audioEl().volume).toBeCloseTo(0.3);
    expect(attachCalls).toHaveLength(1);
    expect(destroyed).not.toHaveBeenCalled();
  });

  it('does not re-attach an HLS stream when the volume changes', () => {
    mockStream = { url: 'https://cdn.example.com/live.m3u8', mediaType: 'hls', isDirect: false };

    const slider = renderPlayer();
    expect(attachCalls).toHaveLength(1);

    fireEvent.change(slider, { target: { value: '0.5' } });
    fireEvent.change(slider, { target: { value: '0.2' } });

    expect(attachCalls).toHaveLength(1);
    expect(destroyed).not.toHaveBeenCalled();
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

    expect(attachCalls).toHaveLength(1);
    expect(destroyed).not.toHaveBeenCalled();
  });

  it('tells the engine a station is live, so a drop is not read as the end', () => {
    mockStream = { url: 'https://cdn.example.com/live.m3u8', mediaType: 'hls', isDirect: false };
    renderPlayer();
    expect(attachCalls[0]?.live).toBe(true);
    expect(attachCalls[0]?.kind).toBe('hls');
  });
});
