/**
 * The process manager's pure parts: the ffmpeg command librespot will split
 * with shell-words, the pairing-line parser, the event hook, and the
 * filename gate on the stream route. If the hook's merge breaks, the page
 * still plays audio but the now-playing card goes blank, which nobody would
 * report as a bug; if the filename gate loosens, the route serves files
 * outside the HLS directory.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ONEVENT_SCRIPT,
  buildFfmpegCommand,
  buildLibrespotArgs,
  isSafeHlsFile,
  parsePairingLine,
  playbackStateFromEvent,
  shellQuote,
} from './librespot';

describe('shellQuote', () => {
  it('leaves plain tokens alone', () => {
    expect(shellQuote('ffmpeg')).toBe('ffmpeg');
    expect(shellQuote('/home/a/tmp/seg_%05d.ts')).toBe('/home/a/tmp/seg_%05d.ts');
  });

  it('single-quotes anything with spaces or quotes', () => {
    expect(shellQuote('/home/my user/x')).toBe("'/home/my user/x'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe('buildFfmpegCommand', () => {
  it('reads S16LE stereo PCM from stdin and writes a live rolling playlist', () => {
    const cmd = buildFfmpegCommand('/state/hls');
    expect(cmd.startsWith('ffmpeg ')).toBe(true);
    expect(cmd).toContain('-f s16le -ar 44100 -ac 2 -i pipe:0');
    expect(cmd).toContain('-c:a aac');
    expect(cmd).toContain('append_list');
    expect(cmd).toContain('omit_endlist');
    expect(cmd).toContain('temp_file');
    expect(cmd).toContain('/state/hls/seg_%05d.ts');
    expect(cmd.endsWith('/state/hls/index.m3u8')).toBe(true);
  });

  it('quotes a directory with spaces so shell-words keeps it as one argument', () => {
    const cmd = buildFfmpegCommand('/my state/hls');
    expect(cmd).toContain("'/my state/hls/index.m3u8'");
  });
});

describe('buildLibrespotArgs', () => {
  const base = {
    deviceName: 'BitTorrented',
    cacheDir: '/state/cache',
    ffmpegCommand: 'ffmpeg -i pipe:0 out.m3u8',
    oneventCommand: 'node /state/onevent.cjs',
  };

  it('uses the subprocess backend with fixed volume and no discovery', () => {
    const args = buildLibrespotArgs({ ...base, deviceAuth: false });
    const pairs = new Map<string, string>();
    for (let i = 0; i < args.length; i += 1) {
      if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
        pairs.set(args[i], args[i + 1]);
      }
    }
    expect(pairs.get('--backend')).toBe('subprocess');
    expect(pairs.get('--device')).toBe(base.ffmpegCommand);
    expect(pairs.get('--volume-ctrl')).toBe('fixed');
    expect(pairs.get('--format')).toBe('S16');
    expect(pairs.get('--onevent')).toBe(base.oneventCommand);
    expect(args).toContain('--disable-discovery');
    expect(args).not.toContain('--enable-device-auth');
  });

  it('adds device auth only when pairing', () => {
    expect(buildLibrespotArgs({ ...base, deviceAuth: true })).toContain('--enable-device-auth');
  });
});

describe('parsePairingLine', () => {
  it('reads the URL and the code from librespot stdout', () => {
    expect(parsePairingLine('Browse to: https://spotify.com/pair?code=SAN88F')).toEqual({
      url: 'https://spotify.com/pair?code=SAN88F',
    });
    expect(parsePairingLine('If prompted, enter code: SAN88F')).toEqual({ code: 'SAN88F' });
  });

  it('ignores everything else', () => {
    expect(parsePairingLine('[INFO librespot] librespot 0.8.0')).toBeNull();
    expect(parsePairingLine('')).toBeNull();
  });
});

describe('playbackStateFromEvent', () => {
  it('maps hook events onto the coarse states the page shows', () => {
    expect(playbackStateFromEvent(undefined)).toBe('connecting');
    expect(playbackStateFromEvent('session_disconnected')).toBe('connecting');
    expect(playbackStateFromEvent('session_connected')).toBe('online');
    expect(playbackStateFromEvent('stopped')).toBe('online');
    expect(playbackStateFromEvent('track_changed')).toBe('playing');
    expect(playbackStateFromEvent('playing')).toBe('playing');
    expect(playbackStateFromEvent('paused')).toBe('paused');
  });
});

describe('isSafeHlsFile', () => {
  it('accepts only what ffmpeg writes', () => {
    expect(isSafeHlsFile('index.m3u8')).toBe(true);
    expect(isSafeHlsFile('seg_00042.ts')).toBe(true);
  });

  it('rejects traversal and anything else', () => {
    for (const bad of ['../credentials.json', 'index.m3u8.tmp', 'seg_1.ts', 'cache/credentials.json', '', 'seg_00042.ts/..']) {
      expect(isSafeHlsFile(bad)).toBe(false);
    }
  });
});

describe('onevent hook', () => {
  let dir: string;
  let script: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spotify-onevent-'));
    script = join(dir, 'onevent.cjs');
    file = join(dir, 'events.json');
    writeFileSync(script, ONEVENT_SCRIPT);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function fire(env: Record<string, string>): Record<string, unknown> {
    execFileSync(process.execPath, [script], {
      env: { ...process.env, SPOTIFY_EVENT_FILE: file, ...env },
    });
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  }

  it('keeps track metadata across the playback events that carry none', () => {
    fire({
      PLAYER_EVENT: 'track_changed',
      TRACK_ID: 'abc',
      URI: 'spotify:track:abc',
      NAME: 'Song',
      ARTISTS: 'One\nTwo',
      ALBUM: 'Album',
      DURATION_MS: '180000',
    });
    const after = fire({ PLAYER_EVENT: 'playing', TRACK_ID: 'abc', POSITION_MS: '5000' });
    expect(after.event).toBe('playing');
    expect(after.name).toBe('Song');
    expect(after.artists).toEqual(['One', 'Two']);
    expect(after.album).toBe('Album');
    expect(after.durationMs).toBe(180000);
    expect(after.positionMs).toBe(5000);
  });

  it('replaces metadata on the next track', () => {
    fire({ PLAYER_EVENT: 'track_changed', TRACK_ID: 'a', NAME: 'First', ARTISTS: 'X', DURATION_MS: '1000' });
    const next = fire({ PLAYER_EVENT: 'track_changed', TRACK_ID: 'b', NAME: 'Second', ARTISTS: 'Y' });
    expect(next.name).toBe('Second');
    expect(next.artists).toEqual(['Y']);
    expect(next.durationMs).toBeNull();
    expect(next.positionMs).toBe(0);
  });

  it('does nothing without a target file', () => {
    execFileSync(process.execPath, [script], { env: { ...process.env, SPOTIFY_EVENT_FILE: '', PLAYER_EVENT: 'playing' } });
    expect(() => readFileSync(file)).toThrow();
  });
});
