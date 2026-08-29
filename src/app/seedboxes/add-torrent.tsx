'use client';

/**
 * Seedboxes → Add
 *
 * The way in for content the index has never seen. Everything else that reaches
 * a seedbox is found on the site first and sent with a button; this is for your
 * own release, a magnet somebody handed you, or a .torrent sitting on your disk.
 *
 * Both inputs end up as one POST, because the server turns a .torrent into a
 * magnet and every transport already speaks magnets.
 * See {@link file://../api/seedbox/add/route.ts}.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon, LinkIcon, LoadingSpinner, PlusIcon } from '@/components/ui/icons';

interface Box {
  id: string | null;
  name: string | null;
  isDefault: boolean;
}

interface Result {
  ok: boolean;
  message: string;
}

/** A .torrent as base64, without the data: prefix the API would have to strip. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.replace(/^data:[^,]*,/, ''));
    };
    reader.readAsDataURL(file);
  });
}

export function AddTorrent(): React.ReactElement {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [seedboxId, setSeedboxId] = useState('');
  const [magnet, setMagnet] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/account/seedboxes', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { seedboxes: [] }))
      .then((data: { seedboxes?: Box[] }) => {
        if (!cancelled) setBoxes(data.seedboxes ?? []);
      })
      .catch(() => {
        // The picker is a convenience; without it the account default is used,
        // which is what every send did before an account could have several.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = useCallback((): void => {
    setMagnet('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }, []);

  const submit = useCallback(async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const body: Record<string, string> = {};
      if (seedboxId) body.seedboxId = seedboxId;
      if (file) {
        body.torrent = await readAsBase64(file);
        body.name = file.name.replace(/\.torrent$/i, '');
      } else {
        body.magnet = magnet.trim();
      }

      const res = await fetch('/api/seedbox/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.ok) {
        setResult({ ok: true, message: data.message ?? 'Sent to seedbox' });
        reset();
      } else {
        setResult({ ok: false, message: data.error ?? `Failed (${res.status})` });
      }
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }, [file, magnet, reset, seedboxId]);

  // A file wins over a pasted magnet, so the button says which one it will send
  // rather than leaving the operator to guess when both are filled in.
  const canSubmit = !busy && (file != null || magnet.trim().length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Add a torrent</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Paste a magnet link, or upload a .torrent file. It goes straight to your seedbox and
          keeps seeding — nothing here has to be in the index first.
        </p>
      </div>

      {boxes.length > 1 && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-primary">Seedbox</span>
          <select
            value={seedboxId}
            onChange={(e) => setSeedboxId(e.target.value)}
            className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Default</option>
            {boxes.map((box) => (
              <option key={box.id ?? 'default'} value={box.id ?? ''}>
                {box.name ?? 'Unnamed'}
                {box.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <LinkIcon size={16} /> Magnet link
        </span>
        <textarea
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          placeholder="magnet:?xt=urn:btih:…"
          rows={3}
          disabled={file != null}
          className={cn(
            'w-full resize-y rounded-lg border border-border bg-bg-secondary px-3 py-2 font-mono text-xs text-text-primary',
            file != null && 'opacity-50'
          )}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-primary">…or a .torrent file</span>
        <input
          ref={fileInput}
          type="file"
          accept=".torrent,application/x-bittorrent"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-bg-hover file:px-3 file:py-2 file:text-sm file:text-text-primary"
        />
        {file ? <span className="text-xs text-text-secondary">
            {file.name} — the magnet is built from the file, so the link box is ignored
          </span> : null}
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            canSubmit
              ? 'bg-accent-primary text-white hover:opacity-90'
              : 'cursor-not-allowed bg-bg-hover text-text-secondary'
          )}
        >
          {busy ? <LoadingSpinner size={16} /> : <PlusIcon size={16} />}
          {busy ? 'Sending…' : 'Send to seedbox'}
        </button>

        {result ? <span
            className={cn(
              'flex items-center gap-2 text-sm',
              result.ok ? 'text-green-500' : 'text-red-500'
            )}
          >
            {result.ok ? <CheckIcon size={16} /> : null}
            {result.message}
          </span> : null}
      </div>
    </div>
  );
}
