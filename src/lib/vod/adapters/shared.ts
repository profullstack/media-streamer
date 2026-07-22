import { createHash } from 'node:crypto';

/** Stable id for a source item that has no natural id (e.g. an M3U url). */
export function stableId(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 24);
}

/** Fetch with a timeout; returns null on any failure. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extension from a url/filename (lowercase, no query), or null. */
export function extOf(hint: string | null | undefined): string | null {
  if (!hint) return null;
  const noQuery = hint.split(/[?#]/)[0] ?? hint;
  const dot = noQuery.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = noQuery.slice(dot + 1).toLowerCase();
  return ext.length > 0 && ext.length <= 5 && /^[a-z0-9]+$/.test(ext) ? ext : null;
}

export interface ResolvedStream {
  url: string;
  headers: Record<string, string>;
  extHint: string;
}

export interface TitleRef {
  streamRef: string;
  extension: string | null;
  title: string;
}
