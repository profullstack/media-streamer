/**
 * Seedbox Player Modal — source attachment
 *
 * Every seedbox file streams from /api/seedbox/stream?path=..., so the URL
 * carries no format. The modal names the kind from the file instead and hands
 * the element to @profullstack/player; these tests pin that, and that an
 * engine failure still lands on the "play from swarm" fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { TorrentFile } from '@/types';

interface Call {
  media: HTMLMediaElement;
  options: { src: string; kind?: string; onError?: (message: string) => void };
}

const { calls, destroyed } = vi.hoisted(() => ({ calls: [] as Call[], destroyed: vi.fn() }));

vi.mock('@profullstack/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@profullstack/player')>();
  return {
    detectKind: actual.detectKind,
    attachSource: vi.fn(async (media: HTMLMediaElement, options: Call['options']) => {
      calls.push({ media, options });
      return Promise.resolve({ destroy: destroyed, engine: 'native', kind: options.kind, levels: () => [] });
    }),
  };
});

vi.mock('@/components/cast/cast-button', () => ({ CastButton: () => null }));

const { SeedboxPlayerModal } = await import('./seedbox-player-modal');

const file = (name: string, mediaCategory: TorrentFile['mediaCategory']): TorrentFile =>
  ({ id: 'f1', path: `dir/${name}`, name, mediaCategory }) as TorrentFile;

beforeEach(() => {
  calls.length = 0;
  destroyed.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

describe('SeedboxPlayerModal', () => {
  it('attaches an MP4 natively through the stream proxy', async () => {
    render(<SeedboxPlayerModal isOpen onClose={vi.fn()} file={file('movie.mp4', 'video')} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options).toMatchObject({
      src: '/api/seedbox/stream?path=dir%2Fmovie.mp4',
      kind: 'mp4',
    });
    expect(calls[0]?.media.tagName).toBe('VIDEO');
  });

  it('names a transport stream from the file, not the URL', async () => {
    render(<SeedboxPlayerModal isOpen onClose={vi.fn()} file={file('match.ts', 'video')} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options.kind).toBe('mpegts');
  });

  it('falls back to the category when the name has no known extension', async () => {
    render(<SeedboxPlayerModal isOpen onClose={vi.fn()} file={file('track.alac', 'audio')} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options.kind).toBe('audio');
    expect(calls[0]?.media.tagName).toBe('AUDIO');
  });

  it('offers the swarm when the engine gives up', async () => {
    const onPlayFromSwarm = vi.fn();
    render(
      <SeedboxPlayerModal
        isOpen
        onClose={vi.fn()}
        file={file('movie.mp4', 'video')}
        onPlayFromSwarm={onPlayFromSwarm}
      />
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    act(() => calls[0]?.options.onError?.('This stream could not be played.'));
    expect(await screen.findByText('Play from swarm instead')).toBeInTheDocument();
    await waitFor(() => expect(destroyed).toHaveBeenCalled());
  });

  it('attaches nothing for a file that cannot play inline', () => {
    render(<SeedboxPlayerModal isOpen onClose={vi.fn()} file={file('notes.pdf', 'document')} />);
    expect(calls).toHaveLength(0);
  });
});
