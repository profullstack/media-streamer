import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { loadAccountSeedboxConfig } from '@/lib/seedbox';
import { buildAuthHeaders } from '@/lib/seedbox/http-transport';

// Manage a torrent on the account's torlink seedbox: pause/resume a download,
// start/stop seeding, or remove/delete it. Proxies torlink's authenticated
// `POST <serve>/control { id, action, deleteFiles? }` (keeps the token
// server-side). Requires torlink with the /control endpoint — older daemons
// answer 404 "not found", which we translate into an actionable 501.

export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['pause', 'resume', 'start-seed', 'stop-seed', 'remove', 'delete']);
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; action?: unknown; deleteFiles?: unknown }
    | null;
  const id = typeof body?.id === 'string' ? body.id.trim().toLowerCase() : '';
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const deleteFiles = body?.deleteFiles === true;

  if (!/^[0-9a-f]{40}$/.test(id)) {
    return NextResponse.json({ error: 'A valid infohash is required' }, { status: 400 });
  }
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: `Unknown action: ${action || '(none)'}` }, { status: 400 });
  }

  const config = await loadAccountSeedboxConfig(user.id);
  if (!config?.http) {
    return NextResponse.json(
      { error: 'No torlink HTTP seedbox is connected.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const url = `${config.http.baseUrl.replace(/\/+$/, '')}/control`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...buildAuthHeaders(config.http), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, deleteFiles }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };

    if (res.ok) {
      return NextResponse.json({ ok: true, id, action }, { status: 200, headers: NO_STORE });
    }
    // torlink returns 404 "not found" for an unknown *route* (a daemon too old to
    // have /control) vs "no such torrent" for a known route + unknown id.
    if (res.status === 404 && (data.error ?? '').toLowerCase().includes('not found')) {
      return NextResponse.json(
        { error: 'This seedbox is running an older torlink without torrent controls. Re-run "Install torlink & open ports" in Setup to update it.' },
        { status: 501, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { error: data.error ?? `torlink /control returned ${res.status}` },
      { status: res.status === 404 ? 404 : 502, headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502, headers: NO_STORE }
    );
  } finally {
    clearTimeout(timer);
  }
}
