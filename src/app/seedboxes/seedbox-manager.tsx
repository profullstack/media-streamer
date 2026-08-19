'use client';

/**
 * Manage several seedboxes on one account.
 *
 * The setup form edits exactly one box. This owns the list around it: which one
 * is selected, which is the default, and adding or removing them.
 *
 * "Default" is the one every existing feature uses when nothing names a box --
 * sending a torrent, streaming a file back, and every resale share. So it is
 * shown as a property of the account rather than a per-box toggle: exactly one
 * box has it, and setting it on another moves it.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SeedboxSection } from '@/app/settings/seedbox-section';

interface SeedboxRow {
  id: string | null;
  name: string | null;
  isDefault: boolean;
  configured: boolean;
  http: { ready: boolean };
  ssh: { ready: boolean };
  files: { ready: boolean };
}

const btn =
  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50';

/** What this box can actually do, in the words the rest of the page uses. */
function capabilities(box: SeedboxRow): string {
  const parts = [
    box.http.ready ? 'add' : null,
    box.ssh.ready ? 'ssh' : null,
    box.files.ready ? 'files' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'not configured';
}

export function SeedboxManager(): React.ReactElement {
  const [boxes, setBoxes] = useState<SeedboxRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/account/seedboxes', { cache: 'no-store' });
      if (!res.ok) {
        setError('Could not load your seedboxes.');
        return;
      }
      const data = (await res.json()) as { seedboxes: SeedboxRow[] };
      const list = (data.seedboxes ?? []).filter((b) => b.id);
      setBoxes(list);
      // Keep the current selection if it still exists; otherwise fall back to the
      // default, which is the first row.
      setSelected((cur) => (cur && list.some((b) => b.id === cur) ? cur : (list[0]?.id ?? null)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(): Promise<void> {
    const name = window.prompt('What do you want to call this seedbox?', `Seedbox ${boxes.length + 1}`);
    if (name === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/seedboxes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { summary?: SeedboxRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not add that seedbox.');
      await load();
      // Drop straight into the new box's setup form -- an empty one is the only
      // thing you would do next.
      if (data.summary?.id) setSelected(data.summary.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rename(box: SeedboxRow): Promise<void> {
    const name = window.prompt('Rename this seedbox', box.name ?? '');
    if (name === null || !name.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/account/seedboxes/${box.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(box: SeedboxRow): Promise<void> {
    setBusy(true);
    try {
      await fetch(`/api/account/seedboxes/${box.id}/default`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(box: SeedboxRow): Promise<void> {
    const label = box.name ?? 'this seedbox';
    if (!window.confirm(`Remove ${label}? Its stored credentials are deleted.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/account/seedboxes/${box.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-text-secondary">Loading…</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-text-primary">Your seedboxes</h2>
          <p className="text-sm text-text-secondary">
            Add as many as you like. The default is the one used when nothing names a box —
            sending a torrent, streaming a file back, and anything you rent out.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className={cn(btn, 'shrink-0 bg-accent-primary text-white')}
        >
          Add seedbox
        </button>
      </div>

      {error ? (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      ) : null}

      {boxes.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          Nothing connected yet. Add one to push torrents to it and stream completed files back.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {boxes.map((box) => (
            <li
              key={box.id}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                selected === box.id ? 'border-accent-primary bg-accent-primary/5' : 'border-border'
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelected(box.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {box.name ?? 'Unnamed seedbox'}
                    {box.isDefault ? (
                      <span className="ml-2 rounded bg-accent-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent-primary">
                        default
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-text-tertiary">
                    {capabilities(box)}
                  </span>
                </button>

                {!box.isDefault ? (
                  <button
                    type="button"
                    onClick={() => makeDefault(box)}
                    disabled={busy}
                    className={cn(btn, 'border border-border text-text-secondary')}
                  >
                    Make default
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => rename(box)}
                  disabled={busy}
                  className={cn(btn, 'border border-border text-text-secondary')}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => remove(box)}
                  disabled={busy}
                  className={cn(btn, 'border border-border text-red-500')}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div className="border-t border-border pt-5">
          {/* Remounted per selection: the form holds the box's values in state, so
              reusing the instance would show the previous box until it refetched. */}
          <SeedboxSection key={selected} seedboxId={selected} onChanged={load} />
        </div>
      ) : null}
    </div>
  );
}
