/**
 * The pure parts of the Go Live page: which recording format to ask the browser
 * for, the numbers that keep a chunk under the server's limit, and the words
 * for why a stream stopped.
 */

/** Two seconds a piece: 2 Mbps video + 128 kbps audio is about 530 KB, under the 900 KB the server takes. */
export const CHUNK_MS = 2000;
export const VIDEO_BPS = 2_000_000;
export const AUDIO_BPS = 128_000;
/** More than this many pieces waiting to upload means the connection cannot keep up. */
export const MAX_QUEUE = 10;

export const RECORDER_MIMES = [
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const;

/** The first format this browser can record, or null when it can record none. */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  for (const mime of RECORDER_MIMES) {
    try {
      if (isSupported(mime)) return mime;
    } catch {
      // A browser that throws on an unknown type does not support it.
    }
  }
  return null;
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number): string => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${String(h)}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

const ENDED: Record<string, string> = {
  idle: 'Nothing arrived from your browser for 20 seconds, so the stream was stopped.',
  time_limit: 'A stream runs for four hours at most. Go live again to carry on.',
  replaced: 'You went live somewhere else, so this stream was stopped.',
  encoder_exit: 'The live encoder stopped. Go live again to carry on.',
  encoder_error: 'The live encoder could not start. Please try again in a moment.',
};

/** Why the server stopped a session, in words; null for a stop the member asked for. */
export function endedMessage(reason: string | null | undefined): string | null {
  return reason ? (ENDED[reason] ?? null) : null;
}
