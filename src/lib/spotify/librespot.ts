/**
 * librespot process manager.
 *
 * Spotify has no stream URL to proxy. The web player decrypts audio inside the
 * browser's DRM module, so the only way to get sound out of an account on a
 * server is the desktop client protocol, which the librespot project
 * implements. This module runs one `librespot` process per connected user:
 *
 *   librespot --backend subprocess --device "ffmpeg ... index.m3u8"
 *
 * librespot appears in the user's Spotify apps as a Connect device. When they
 * cast to it, librespot spawns the ffmpeg command, pipes 44.1 kHz stereo PCM
 * into its stdin, and ffmpeg writes a rolling HLS playlist into the user's
 * state directory. Pausing closes the sink, which ends that ffmpeg; resuming
 * starts a fresh one that appends to the same playlist. The Next process never
 * touches the audio path and never has to babysit ffmpeg.
 *
 * Login is Spotify's device-pairing flow: librespot prints a URL and a short
 * code, the user enters the code at spotify.com/pair from any device, and
 * librespot writes `credentials.json` into its cache directory. That file is
 * what we persist (encrypted) so restarts need no user action. Spotify removed
 * username/password login in 2024, so there is no other headless path.
 *
 * Track metadata comes from librespot's `--onevent` hook rather than the Web
 * API: the hook receives NAME/ARTISTS/ALBUM/URI as environment variables and
 * merges them into an events file the status route reads. No developer app,
 * no OAuth token, no quota.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTempDir } from '@/lib/config/temp-dir';

export type SpotifyPlayerState =
  | 'stopped'
  | 'pairing'
  | 'connecting'
  | 'online'
  | 'playing'
  | 'paused'
  | 'error';

export interface SpotifyPairing {
  url: string;
  code: string;
}

export interface SpotifyNowPlaying {
  event: string;
  trackId: string | null;
  uri: string | null;
  name: string | null;
  artists: string[];
  album: string | null;
  durationMs: number | null;
  positionMs: number | null;
  updatedAt: string;
}

export interface SpotifyPlayerStatus {
  state: SpotifyPlayerState;
  deviceName: string;
  pairing: SpotifyPairing | null;
  nowPlaying: SpotifyNowPlaying | null;
  /** True once ffmpeg has written a playlist, i.e. there is something to play. */
  hasStream: boolean;
  error: string | null;
}

export interface LibrespotArgsOptions {
  deviceName: string;
  cacheDir: string;
  ffmpegCommand: string;
  oneventCommand: string;
  deviceAuth: boolean;
  bitrate?: 96 | 160 | 320;
}

/** Filenames ffmpeg writes into the HLS directory. Anything else is not served. */
const HLS_FILE_RE = /^(index\.m3u8|seg_\d{5}\.ts)$/;

export function isSafeHlsFile(name: string): boolean {
  return HLS_FILE_RE.test(name);
}

/** Default Connect device name. Each user only ever sees their own device. */
export function defaultDeviceName(): string {
  return process.env.SPOTIFY_DEVICE_NAME?.trim() || 'BitTorrented';
}

/**
 * Quote one argument for librespot's `--device` command string. librespot
 * splits it with the `shell_words` crate (POSIX shell rules, no shell), so
 * single quotes with the usual '\'' escape are exact.
 */
export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:%=+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * The ffmpeg invocation librespot runs each time the sink opens. Reads raw
 * S16LE PCM on stdin and keeps a short rolling HLS window.
 *
 * `append_list` continues the segment numbering across sink restarts so a
 * paused-then-resumed stream does not reset the media sequence under hls.js;
 * `omit_endlist` keeps the playlist live when ffmpeg exits on pause;
 * `temp_file` makes each playlist write atomic so a reader never sees a
 * half-written manifest.
 */
export function buildFfmpegCommand(hlsDir: string, ffmpegBinary = 'ffmpeg'): string {
  const args = [
    ffmpegBinary,
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-f', 's16le',
    '-ar', '44100',
    '-ac', '2',
    '-i', 'pipe:0',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '8',
    '-hls_flags', 'delete_segments+append_list+omit_endlist+temp_file',
    '-hls_segment_filename', join(hlsDir, 'seg_%05d.ts'),
    join(hlsDir, 'index.m3u8'),
  ];
  return args.map(shellQuote).join(' ');
}

export function buildLibrespotArgs(opts: LibrespotArgsOptions): string[] {
  const args = [
    '--name', opts.deviceName,
    '--device-type', 'speaker',
    '--backend', 'subprocess',
    '--device', opts.ffmpegCommand,
    '--format', 'S16',
    '--bitrate', String(opts.bitrate ?? 320),
    // The user's phone volume slider must not scale the stream we serve.
    '--volume-ctrl', 'fixed',
    '--initial-volume', '100',
    '--cache', opts.cacheDir,
    '--disable-audio-cache',
    // No zeroconf: the device is registered through the account, not the LAN.
    '--disable-discovery',
    '--onevent', opts.oneventCommand,
  ];
  if (opts.deviceAuth) args.push('--enable-device-auth');
  return args;
}

/**
 * Parse one line of librespot's stdout during device pairing. It prints:
 *   Browse to: https://spotify.com/pair?code=ABC123
 *   If prompted, enter code: ABC123
 */
export function parsePairingLine(line: string): Partial<SpotifyPairing> | null {
  const url = /^\s*Browse to:\s*(\S+)/i.exec(line);
  if (url) return { url: url[1] };
  const code = /enter code:\s*([A-Z0-9-]+)/i.exec(line);
  if (code) return { code: code[1] };
  return null;
}

/**
 * The `--onevent` hook, written into the state directory at spawn time so the
 * runtime image needs nothing beyond node. It merges each event into one JSON
 * file: `track_changed` carries the metadata, the playback events carry only
 * the track id and position, so the file is the union of the latest of each.
 * Written via rename so a status read never sees a partial file.
 */
export const ONEVENT_SCRIPT = `'use strict';
const fs = require('fs');
const file = process.env.SPOTIFY_EVENT_FILE;
if (!file) process.exit(0);
const e = process.env;
const ev = e.PLAYER_EVENT || '';
let prev = {};
try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const next = Object.assign({}, prev, { event: ev, updatedAt: new Date().toISOString() });
if (ev === 'track_changed') {
  next.trackId = e.TRACK_ID || null;
  next.uri = e.URI || null;
  next.name = e.NAME || null;
  next.artists = String(e.ARTISTS || '').split('\\n').map((s) => s.trim()).filter(Boolean);
  next.album = e.ALBUM || null;
  next.durationMs = e.DURATION_MS ? Number(e.DURATION_MS) : null;
  next.positionMs = 0;
} else if (ev === 'playing' || ev === 'paused' || ev === 'seeked' || ev === 'position_correction') {
  if (e.POSITION_MS) next.positionMs = Number(e.POSITION_MS);
  if (e.TRACK_ID) next.trackId = e.TRACK_ID;
} else if (ev === 'stopped' || ev === 'session_disconnected') {
  next.positionMs = null;
}
const tmp = file + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(next));
fs.renameSync(tmp, file);
`;

const PLAYING_EVENTS = new Set([
  'playing',
  'track_changed',
  'loading',
  'preloading',
  'seeked',
  'position_correction',
  'play_request_id_changed',
]);

/** Map the last hook event onto a coarse player state. */
export function playbackStateFromEvent(event: string | null | undefined): SpotifyPlayerState {
  if (!event) return 'connecting';
  if (event === 'session_disconnected') return 'connecting';
  if (event === 'paused') return 'paused';
  if (PLAYING_EVENTS.has(event)) return 'playing';
  return 'online';
}

/** How long to wait for the pairing code to appear on stdout. */
const PAIRING_CODE_TIMEOUT_MS = 10_000;
const CREDENTIALS_POLL_MS = 1_000;
const MAX_RESTARTS = 5;
const STDERR_TAIL_LINES = 20;

export interface StartOptions {
  deviceName?: string;
  /** Called once librespot writes credentials.json during pairing. */
  onCredentials?: (credentialsJson: string) => Promise<void>;
}

export function spotifyStateDir(userId: string): string {
  return join(getTempDir(), 'spotify', userId);
}

class LibrespotPlayer {
  private child: ChildProcess | null = null;
  private pairing: SpotifyPairing | null = null;
  private deviceAuth = false;
  private stopping = false;
  private credentialsCaptured = false;
  private credentialsPoll: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private restarts = 0;
  private lastError: string | null = null;
  private stderrTail: string[] = [];
  private pairingWaiters: Array<() => void> = [];
  private onCredentials: StartOptions['onCredentials'];
  readonly deviceName: string;

  constructor(
    readonly userId: string,
    deviceName: string,
  ) {
    this.deviceName = deviceName;
  }

  get stateDir(): string {
    return spotifyStateDir(this.userId);
  }
  get cacheDir(): string {
    return join(this.stateDir, 'cache');
  }
  get hlsDir(): string {
    return join(this.stateDir, 'hls');
  }
  get eventFile(): string {
    return join(this.stateDir, 'events.json');
  }
  get credentialsFile(): string {
    return join(this.cacheDir, 'credentials.json');
  }

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed;
  }

  /** Fresh directories for a run. The HLS dir is swept so stale segments never mix. */
  private prepareDirs(): void {
    mkdirSync(this.cacheDir, { recursive: true });
    rmSync(this.hlsDir, { recursive: true, force: true });
    mkdirSync(this.hlsDir, { recursive: true });
    rmSync(this.eventFile, { force: true });
    writeFileSync(join(this.stateDir, 'onevent.cjs'), ONEVENT_SCRIPT, { mode: 0o644 });
  }

  /** Start a device-pairing run. Any cached credentials are discarded first. */
  startPairing(opts: StartOptions): void {
    this.stopProcess();
    rmSync(this.credentialsFile, { force: true });
    this.credentialsCaptured = false;
    this.onCredentials = opts.onCredentials;
    this.deviceAuth = true;
    this.restarts = 0;
    this.spawnProcess();
  }

  /** Start (or keep) a run from persisted credentials. */
  ensureRunning(credentialsJson: string): void {
    if (this.running) return;
    if (this.restartTimer) return; // a restart is already scheduled
    this.deviceAuth = false;
    this.credentialsCaptured = true;
    this.prepareDirs();
    writeFileSync(this.credentialsFile, credentialsJson, { mode: 0o600 });
    this.spawnProcess({ dirsReady: true });
  }

  private spawnProcess(options: { dirsReady?: boolean } = {}): void {
    if (!options.dirsReady) this.prepareDirs();
    this.stopping = false;
    this.pairing = null;
    this.lastError = null;
    this.stderrTail = [];

    const binary = process.env.LIBRESPOT_PATH?.trim() || 'librespot';
    const args = buildLibrespotArgs({
      deviceName: this.deviceName,
      cacheDir: this.cacheDir,
      ffmpegCommand: buildFfmpegCommand(this.hlsDir, process.env.FFMPEG_PATH?.trim() || 'ffmpeg'),
      oneventCommand: `${shellQuote(process.execPath)} ${shellQuote(join(this.stateDir, 'onevent.cjs'))}`,
      deviceAuth: this.deviceAuth,
    });

    let child: ChildProcess;
    try {
      child = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, SPOTIFY_EVENT_FILE: this.eventFile },
      });
    } catch (err) {
      this.lastError = `Could not start librespot: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    this.child = child;

    child.on('error', (err: NodeJS.ErrnoException) => {
      this.lastError =
        err.code === 'ENOENT'
          ? `librespot binary not found (${binary}). Set LIBRESPOT_PATH.`
          : `librespot failed: ${err.message}`;
      this.child = null;
      this.resolvePairingWaiters();
    });

    let stdoutBuf = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) this.handleStdoutLine(line);
    });

    let stderrBuf = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBuf += chunk;
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
      }
    });

    child.on('exit', (code, signal) => {
      this.child = null;
      this.stopCredentialsPoll();
      this.resolvePairingWaiters();
      if (this.stopping) return;

      const detail = this.stderrTail.filter((l) => /ERROR|WARN/.test(l)).slice(-3).join(' | ');
      if (this.deviceAuth && !this.credentialsCaptured) {
        this.lastError = detail
          ? `Pairing did not complete: ${detail}`
          : 'Pairing did not complete. Start again to get a new code.';
        this.pairing = null;
        return;
      }

      if (this.restarts >= MAX_RESTARTS) {
        this.lastError = `librespot exited (${signal ?? code}) and stopped restarting${detail ? `: ${detail}` : ''}`;
        return;
      }
      const delay = 3_000 * 2 ** this.restarts;
      this.restarts += 1;
      this.lastError = null;
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (!this.stopping) {
          this.deviceAuth = false;
          this.spawnProcess();
        }
      }, delay);
      this.restartTimer.unref?.();
    });

    if (this.deviceAuth) this.startCredentialsPoll();
  }

  private handleStdoutLine(line: string): void {
    const parsed = parsePairingLine(line);
    if (!parsed) return;
    this.pairing = { url: '', code: '', ...(this.pairing ?? {}), ...parsed };
    if (this.pairing.url && this.pairing.code) this.resolvePairingWaiters();
  }

  private startCredentialsPoll(): void {
    this.stopCredentialsPoll();
    this.credentialsPoll = setInterval(() => {
      if (this.credentialsCaptured || !existsSync(this.credentialsFile)) return;
      let json: string;
      try {
        json = readFileSync(this.credentialsFile, 'utf8');
        JSON.parse(json);
      } catch {
        return; // still being written
      }
      this.credentialsCaptured = true;
      this.pairing = null;
      this.stopCredentialsPoll();
      // A successful pairing should reconnect quietly from now on.
      this.restarts = 0;
      void this.onCredentials?.(json).catch((err) => {
        this.lastError = `Could not save Spotify credentials: ${err instanceof Error ? err.message : String(err)}`;
      });
    }, CREDENTIALS_POLL_MS);
    this.credentialsPoll.unref?.();
  }

  private stopCredentialsPoll(): void {
    if (this.credentialsPoll) clearInterval(this.credentialsPoll);
    this.credentialsPoll = null;
  }

  private resolvePairingWaiters(): void {
    const waiters = this.pairingWaiters;
    this.pairingWaiters = [];
    for (const w of waiters) w();
  }

  /** Resolve once a full pairing code is known, the process dies, or the timeout passes. */
  waitForPairingCode(timeoutMs = PAIRING_CODE_TIMEOUT_MS): Promise<void> {
    if ((this.pairing?.url && this.pairing.code) || !this.running) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pairingWaiters = this.pairingWaiters.filter((w) => w !== done);
        resolve();
      }, timeoutMs);
      timer.unref?.();
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      this.pairingWaiters.push(done);
    });
  }

  private stopProcess(): void {
    this.stopping = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.stopCredentialsPoll();
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 3_000);
      force.unref?.();
    }
    this.pairing = null;
    this.resolvePairingWaiters();
  }

  stop(options: { purge?: boolean } = {}): void {
    this.stopProcess();
    this.lastError = null;
    if (options.purge) rmSync(this.stateDir, { recursive: true, force: true });
  }

  readNowPlaying(): SpotifyNowPlaying | null {
    try {
      const raw = JSON.parse(readFileSync(this.eventFile, 'utf8')) as Partial<SpotifyNowPlaying>;
      return {
        event: raw.event ?? '',
        trackId: raw.trackId ?? null,
        uri: raw.uri ?? null,
        name: raw.name ?? null,
        artists: Array.isArray(raw.artists) ? raw.artists : [],
        album: raw.album ?? null,
        durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : null,
        positionMs: typeof raw.positionMs === 'number' ? raw.positionMs : null,
        updatedAt: raw.updatedAt ?? '',
      };
    } catch {
      return null;
    }
  }

  status(): SpotifyPlayerStatus {
    const nowPlaying = this.readNowPlaying();
    const hasStream = existsSync(join(this.hlsDir, 'index.m3u8'));
    let state: SpotifyPlayerState;
    if (!this.running) {
      state = this.lastError ? 'error' : this.restartTimer ? 'connecting' : 'stopped';
    } else if (this.deviceAuth && !this.credentialsCaptured) {
      state = 'pairing';
    } else {
      state = playbackStateFromEvent(nowPlaying?.event);
    }
    return {
      state,
      deviceName: this.deviceName,
      pairing: state === 'pairing' && this.pairing?.url && this.pairing.code ? this.pairing : null,
      nowPlaying: state === 'playing' || state === 'paused' ? nowPlaying : null,
      hasStream,
      error: this.lastError,
    };
  }
}

export class SpotifyPlayerManager {
  private readonly players = new Map<string, LibrespotPlayer>();

  private player(userId: string, deviceName?: string): LibrespotPlayer {
    let p = this.players.get(userId);
    if (!p) {
      p = new LibrespotPlayer(userId, deviceName ?? defaultDeviceName());
      this.players.set(userId, p);
    }
    return p;
  }

  /** Begin device pairing and wait briefly for the code so the caller can show it. */
  async startPairing(userId: string, opts: StartOptions = {}): Promise<SpotifyPlayerStatus> {
    const p = this.player(userId, opts.deviceName);
    p.startPairing(opts);
    await p.waitForPairingCode();
    return p.status();
  }

  ensureRunning(userId: string, credentialsJson: string, opts: { deviceName?: string } = {}): SpotifyPlayerStatus {
    const p = this.player(userId, opts.deviceName);
    p.ensureRunning(credentialsJson);
    return p.status();
  }

  getStatus(userId: string): SpotifyPlayerStatus {
    const p = this.players.get(userId);
    if (!p) {
      return {
        state: 'stopped',
        deviceName: defaultDeviceName(),
        pairing: null,
        nowPlaying: null,
        hasStream: false,
        error: null,
      };
    }
    return p.status();
  }

  stop(userId: string, options: { purge?: boolean } = {}): void {
    const p = this.players.get(userId);
    if (!p) return;
    p.stop(options);
    this.players.delete(userId);
  }

  /** Absolute path of one HLS file for a user, or null if the name is not one we serve. */
  hlsPath(userId: string, file: string): string | null {
    if (!isSafeHlsFile(file)) return null;
    return join(spotifyStateDir(userId), 'hls', file);
  }

  stopAll(): void {
    for (const userId of [...this.players.keys()]) this.stop(userId);
  }
}

/**
 * One manager per process. Kept on globalThis so Next's dev-mode module
 * reloads do not orphan running librespot children behind a fresh Map.
 */
const GLOBAL_KEY = '__bittorrentedSpotifyPlayerManager';

export function getSpotifyPlayerManager(): SpotifyPlayerManager {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: SpotifyPlayerManager };
  if (!g[GLOBAL_KEY]) {
    const manager = new SpotifyPlayerManager();
    g[GLOBAL_KEY] = manager;
    for (const sig of ['SIGTERM', 'SIGINT'] as const) {
      process.once(sig, () => manager.stopAll());
    }
  }
  return g[GLOBAL_KEY];
}
