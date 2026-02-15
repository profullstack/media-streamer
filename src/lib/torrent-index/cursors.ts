/**
 * Cursor-based pagination helpers for public.torrents table.
 * Uses Supabase RPC functions list_torrents_page / list_torrents_month_page.
 */

import { getServerClient } from '@/lib/supabase/client';

export interface TorrentRow {
  info_hash: string; // hex-encoded by RPC via encode(info_hash, 'hex') — but actually returned as raw bytea
  name: string;
  size: number;
  created_at: string;
  files_count: number | null;
  files_status: string;
  extension: string | null;
  private: boolean;
  updated_at: string;
}

export interface CursorPage {
  torrents: TorrentRow[];
  /** Cursor for next (older) page, null if no more */
  nextCursor: { before_ts: number; before_id: string } | null;
}

/**
 * Convert raw info_hash from Supabase (returned as hex string with \\x prefix or base64)
 * to a clean hex string.
 */
export function normalizeInfoHash(raw: unknown): string {
  if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
    return Buffer.from(raw).toString('hex');
  }
  const s = String(raw);
  // Supabase returns bytea as \\x prefixed hex or base64
  if (s.startsWith('\\x')) {
    return s.slice(2);
  }
  // If it's already 40-char hex
  if (/^[0-9a-f]{40}$/i.test(s)) {
    return s.toLowerCase();
  }
  // Try base64 decode
  try {
    return Buffer.from(s, 'base64').toString('hex');
  } catch {
    return s;
  }
}

export async function fetchTorrentsPage(
  pageSize: number,
  beforeTs?: number,
  beforeId?: string
): Promise<CursorPage> {
  const supabase = getServerClient();

  const params: Record<string, unknown> = { page_size: pageSize };
  if (beforeTs != null && beforeId) {
    params.before_ts = new Date(beforeTs * 1000).toISOString();
    params.before_id = beforeId;
  }

  const { data, error } = await supabase.rpc('list_torrents_page' as any, params);
  if (error) throw new Error(`list_torrents_page: ${error.message}`);

  const rows = (data ?? []) as unknown as TorrentRow[];
  // Normalize info_hash
  for (const r of rows) {
    r.info_hash = normalizeInfoHash(r.info_hash);
  }

  let nextCursor: CursorPage['nextCursor'] = null;
  if (rows.length === pageSize) {
    const last = rows[rows.length - 1];
    nextCursor = {
      before_ts: Math.floor(new Date(last.created_at).getTime() / 1000),
      before_id: last.info_hash,
    };
  }

  return { torrents: rows, nextCursor };
}

export async function fetchTorrentsMonthPage(
  pageSize: number,
  year: number,
  month: number,
  beforeTs?: number,
  beforeId?: string
): Promise<CursorPage> {
  const supabase = getServerClient();

  const startTs = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const endTs = new Date(Date.UTC(year, month, 1)).toISOString();

  const params: Record<string, unknown> = {
    page_size: pageSize,
    start_ts: startTs,
    end_ts: endTs,
  };
  if (beforeTs != null && beforeId) {
    params.before_ts = new Date(beforeTs * 1000).toISOString();
    params.before_id = beforeId;
  }

  const { data, error } = await supabase.rpc('list_torrents_month_page' as any, params);
  if (error) throw new Error(`list_torrents_month_page: ${error.message}`);

  const rows = (data ?? []) as unknown as TorrentRow[];
  for (const r of rows) {
    r.info_hash = normalizeInfoHash(r.info_hash);
  }

  let nextCursor: CursorPage['nextCursor'] = null;
  if (rows.length === pageSize) {
    const last = rows[rows.length - 1];
    nextCursor = {
      before_ts: Math.floor(new Date(last.created_at).getTime() / 1000),
      before_id: last.info_hash,
    };
  }

  return { torrents: rows, nextCursor };
}
