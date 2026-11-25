/**
 * Live sessions: one ffmpeg per member who is on air.
 *
 * The member's browser records their own camera or screen and posts it here in
 * two-second pieces; each piece goes down that session's ffmpeg stdin, and
 * ffmpeg pushes RTMP to c0mpute Live. The registry sits on globalThis so every
 * route bundle in the server process shares one.
 *
 * Caps: one session per member, a small global maximum (each one is a 720p x264
 * encode), a session with no chunk for 20 seconds is stopped, and nothing runs
 * past four hours. The publish URL holds the stream key, so it is never logged
 * and ffmpeg's stderr is never echoed.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { C0MPUTE_RTMP_URL, runtimeEnv } from './oauth';

/** nginx in front caps a request body at 1 MB. */
export const MAX_CHUNK_BYTES = 900 * 1024;
export const IDLE_MS = 20_000;
export const MAX_RUNTIME_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 3;
/** How long an ended session's reason stays readable by its owner. */
const ENDED_TTL_MS = 10 * 60 * 1000;

/** What the browser may hand us: what MediaRecorder produces. */
export function acceptedMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const mime = value.trim().toLowerCase();
  return /^video\/(webm|mp4|x-matroska)(;\s*codecs="?[a-z0-9.,\s-]+"?)?$/.test(mime) ? mime : null;
}

export const publishUrl = (streamKey: string): string => `${C0MPUTE_RTMP_URL}/${streamKey}`;

/**
 * ffmpeg arguments for one session. The publish URL (which holds the stream
 * key) is the last argument and appears nowhere else.
 */
export function buildFfmpegArgs(streamKey: string): string[] {
  // No whitespace, control characters or path/query separators: it is one path segment.
  if (!/^[^\s\u0000-\u001f/?#]{4,500}$/.test(streamKey)) throw new Error('invalid stream key');
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-fflags', '+genpts',
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    // Never above 720p (the c0mpute free tier), never upscaled, even width.
    '-vf', "scale=-2:'min(720,ih)'",
    '-r', '30',
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-b:v', '2500k',
    '-maxrate', '2500k',
    '-bufsize', '5000k',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'flv',
    publishUrl(streamKey),
  ];
}

export function maxSessions(): number {
  const n = Number.parseInt(runtimeEnv('C0MPUTE_LIVE_MAX_SESSIONS'), 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_SESSIONS;
}

export type ChunkCheck = { ok: true } | { ok: false; status: 400 | 409 | 413; error: string };

/** Is this the next chunk, and small enough? `expected` is the session's next seq. */
export function checkChunk(expected: number, seq: unknown, bytes: number): ChunkCheck {
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
    return { ok: false, status: 400, error: 'seq must be a whole number' };
  }
  if (bytes <= 0) return { ok: false, status: 400, error: 'Empty chunk' };
  if (bytes > MAX_CHUNK_BYTES) return { ok: false, status: 413, error: 'Chunk too large' };
  if (seq !== expected) return { ok: false, status: 409, error: `Out of order: expected chunk ${String(expected)}` };
  return { ok: true };
}

export type EndReason = 'stopped' | 'idle' | 'time_limit' | 'replaced' | 'encoder_exit' | 'encoder_error';

interface Session {
  id: string;
  userId: string;
  startedAt: number;
  nextSeq: number;
  process: ChildProcess;
  idleTimer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
  /** Chunks are written one at a time, in order. */
  writing: Promise<void>;
  ended: boolean;
}

interface Ended {
  sessionId: string;
  reason: EndReason;
  at: number;
}

interface Registry {
  sessions: Map<string, Session>;
  /** The last ended session per user, so the page can say why it stopped. */
  ended: Map<string, Ended>;
}

const REGISTRY = Symbol.for('bittorrented.c0mputeLive.sessions');

function registry(): Registry {
  const g = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
  g[REGISTRY] ??= { sessions: new Map(), ended: new Map() };
  return g[REGISTRY];
}

export type Spawner = (args: string[]) => ChildProcess;

const defaultSpawner: Spawner = (args) => spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'ignore'] });

function end(session: Session, reason: EndReason): void {
  if (session.ended) return;
  session.ended = true;
  clearTimeout(session.idleTimer);
  clearTimeout(session.maxTimer);
  const reg = registry();
  reg.sessions.delete(session.id);
  reg.ended.set(session.userId, { sessionId: session.id, reason, at: Date.now() });
  try {
    session.process.stdin?.end();
  } catch {
    // Already closed.
  }
  // Give ffmpeg a moment to flush the FLV trailer, then make sure it is gone.
  const kill = setTimeout(() => {
    if (session.process.exitCode === null) session.process.kill('SIGKILL');
  }, 3000);
  kill.unref?.();
}

function armIdle(session: Session): void {
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => end(session, 'idle'), IDLE_MS);
  session.idleTimer.unref?.();
}

export class LiveCapacityError extends Error {
  constructor() {
    super('Every live slot is in use right now. Try again in a few minutes.');
    this.name = 'LiveCapacityError';
  }
}

/** Start a session for a member. A session they already had is stopped first. */
export function startSession(
  userId: string,
  streamKey: string,
  spawner: Spawner = defaultSpawner
): { sessionId: string; startedAt: number } {
  const reg = registry();
  for (const s of [...reg.sessions.values()]) if (s.userId === userId) end(s, 'replaced');
  if (reg.sessions.size >= maxSessions()) throw new LiveCapacityError();

  const process = spawner(buildFfmpegArgs(streamKey));
  const session: Session = {
    id: randomBytes(16).toString('base64url'),
    userId,
    startedAt: Date.now(),
    nextSeq: 0,
    process,
    idleTimer: setTimeout(() => undefined, 0),
    maxTimer: setTimeout(() => end(session, 'time_limit'), MAX_RUNTIME_MS),
    writing: Promise.resolve(),
    ended: false,
  };
  session.maxTimer.unref?.();
  armIdle(session);
  process.on('exit', () => end(session, 'encoder_exit'));
  process.on('error', () => end(session, 'encoder_error'));
  // A closed pipe must not take the server down with an unhandled EPIPE.
  process.stdin?.on('error', () => end(session, 'encoder_exit'));
  reg.sessions.set(session.id, session);
  reg.ended.delete(userId);
  return { sessionId: session.id, startedAt: session.startedAt };
}

export type WriteResult = { ok: true } | { ok: false; status: 400 | 404 | 409 | 410 | 413; error: string };

/** Write the next chunk to the member's session, waiting for ffmpeg to take it. */
export async function writeChunk(userId: string, sessionId: string, seq: unknown, chunk: Uint8Array): Promise<WriteResult> {
  const session = registry().sessions.get(sessionId);
  // Somebody else's session is reported exactly as one that does not exist.
  if (!session || session.userId !== userId) return { ok: false, status: 404, error: 'No such live session' };
  const check = checkChunk(session.nextSeq, seq, chunk.byteLength);
  if (!check.ok) return check;
  session.nextSeq += 1;
  armIdle(session);

  const write = session.writing.then(
    () =>
      new Promise<void>((resolve, reject) => {
        const stdin = session.process.stdin;
        if (session.ended || !stdin || stdin.destroyed) {
          reject(new Error('ended'));
          return;
        }
        const drained = stdin.write(chunk, (err) => {
          if (err) reject(err);
          else if (drained) resolve();
        });
        if (!drained) stdin.once('drain', resolve);
      })
  );
  session.writing = write.catch(() => undefined);
  try {
    await write;
    return { ok: true };
  } catch {
    return { ok: false, status: 410, error: 'The live session has ended' };
  }
}

/** Stop the member's session (all of them; there is at most one). */
export function stopSessionsOf(userId: string, reason: EndReason = 'stopped'): number {
  let stopped = 0;
  for (const s of [...registry().sessions.values()]) {
    if (s.userId === userId) {
      end(s, reason);
      stopped += 1;
    }
  }
  return stopped;
}

export interface LiveState {
  active: boolean;
  sessionId: string | null;
  startedAt: string | null;
  /** Why the last session stopped, when there is none now. */
  ended: { reason: EndReason; at: string } | null;
}

export function liveStateOf(userId: string): LiveState {
  const reg = registry();
  for (const s of reg.sessions.values()) {
    if (s.userId === userId) {
      return { active: true, sessionId: s.id, startedAt: new Date(s.startedAt).toISOString(), ended: null };
    }
  }
  const last = reg.ended.get(userId);
  if (last && Date.now() - last.at > ENDED_TTL_MS) reg.ended.delete(userId);
  const ended = last && Date.now() - last.at <= ENDED_TTL_MS ? { reason: last.reason, at: new Date(last.at).toISOString() } : null;
  return { active: false, sessionId: null, startedAt: null, ended };
}

export function activeSessionCount(): number {
  return registry().sessions.size;
}

/** Tests only. */
export function resetSessionsForTest(): void {
  const reg = registry();
  for (const s of [...reg.sessions.values()]) end(s, 'stopped');
  reg.sessions.clear();
  reg.ended.clear();
}
