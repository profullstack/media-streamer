'use client';

/**
 * Key vault: the passphrase that seals every key and password you store here
 * (seedbox SSH keys and tokens, email passwords, broker keys, Spotify, VOD
 * source logins).
 *
 * Everything cryptographic happens in this browser. The passphrase and the
 * recovery key never leave it; the server gets the sealed record, and on unlock
 * only the derived data key, which it keeps in memory for the time you pick.
 */

import { useCallback, useEffect, useState } from 'react';
import { bytesToBase64, wipe, type SealRecord } from '@profullstack/sealed-secrets';

import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/icons';
import { LOST_PASSPHRASE_COPY, sealer } from '@/lib/vault/sealer';

interface VaultState {
  userId: string;
  exists: boolean;
  seal: SealRecord | null;
  unlocked: boolean;
  expiresAt: string | null;
}

const TTLS = [
  { value: '1h', label: '1 hour' },
  { value: '8h', label: '8 hours' },
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
];

const inputClass =
  'w-full rounded-lg bg-bg-tertiary border border-border-subtle px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary';
const buttonClass =
  'px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed';

export function KeyVaultSection(): React.ReactElement {
  const [state, setState] = useState<VaultState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [ttl, setTtl] = useState('8h');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [newPassphrase, setNewPassphrase] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/vault', { cache: 'no-store' });
    if (res.ok) setState((await res.json()) as VaultState);
    else setError('Could not load your key vault.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sendUnlock = useCallback(
    async (dek: Uint8Array): Promise<void> => {
      try {
        const res = await fetch('/api/vault/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dek: bytesToBase64(dek), ttl }),
        });
        const body = (await res.json()) as { error?: string; migration?: { migrated: number; failed: number } };
        if (!res.ok) throw new Error(body.error ?? 'Unlock failed');
        const m = body.migration;
        setNotice(
          m && m.migrated > 0
            ? `Unlocked. ${m.migrated} older secret${m.migrated === 1 ? ' was' : 's were'} re-sealed under your passphrase.`
            : 'Unlocked.'
        );
      } finally {
        wipe(dek);
      }
    },
    [ttl]
  );

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const create = () =>
    run(async () => {
      if (passphrase !== confirm) throw new Error('The two passphrases do not match.');
      const { dek, seal, recoveryKey: rk } = await sealer.createSeal(passphrase, state!.userId);
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seal }),
      });
      if (!res.ok) {
        wipe(dek);
        throw new Error(((await res.json()) as { error?: string }).error ?? 'Could not create the vault');
      }
      setRecoveryKey(rk);
      setPassphrase('');
      setConfirm('');
      await sendUnlock(dek);
    });

  const unlock = () =>
    run(async () => {
      const seal = state!.seal!;
      const dek = useRecovery
        ? await sealer.unlockSealWithRecovery(seal, passphrase.trim(), state!.userId)
        : await sealer.unlockSeal(seal, passphrase, state!.userId);
      setPassphrase('');
      await sendUnlock(dek);
    });

  const lock = () =>
    run(async () => {
      await fetch('/api/vault/lock', { method: 'POST' });
      setNotice('Locked. Anything that needs your keys is paused until you unlock again.');
    });

  const changePassphrase = () =>
    run(async () => {
      const seal = state!.seal!;
      const dek = useRecovery
        ? await sealer.unlockSealWithRecovery(seal, passphrase.trim(), state!.userId)
        : await sealer.unlockSeal(seal, passphrase, state!.userId);
      try {
        const next = await sealer.rewrapSeal(dek, seal, newPassphrase, state!.userId);
        const res = await fetch('/api/vault', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seal: next, dek: bytesToBase64(dek) }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Could not change it');
        setPassphrase('');
        setNewPassphrase('');
        setNotice('Passphrase changed. Your recovery key still works.');
      } finally {
        wipe(dek);
      }
    });

  if (!state) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <LoadingSpinner size={16} /> Loading your key vault…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Key vault</h2>
        <p className="text-sm text-text-secondary">
          Your seedbox keys, email passwords, broker keys, Spotify login and VOD source logins are sealed with a
          passphrase only you know. We cannot open them, and neither can anyone who breaks into our servers. Anything
          that runs for you on the server (seedbox adds, syncing, streaming) works while your vault is unlocked.
        </p>
        <p className="text-sm text-text-muted mt-2">{LOST_PASSPHRASE_COPY}</p>
      </div>

      {recoveryKey ? (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-text-primary">Your recovery key (shown once)</p>
          <p className="font-mono text-sm break-all text-text-primary select-all">{recoveryKey}</p>
          <p className="text-sm text-text-secondary">
            Save it somewhere safe, like a password manager. It opens your vault if you forget your passphrase. We do
            not keep a copy.
          </p>
          <button className={buttonClass} onClick={() => setRecoveryKey(null)}>
            I saved it
          </button>
        </div>
      ) : null}

      {notice ? <p className="text-sm text-green-500">{notice}</p> : null}
      {error ? <p className="text-sm text-status-error">{error}</p> : null}

      <div className="rounded-xl bg-bg-secondary border border-border-subtle p-4 space-y-3">
        {!state.exists ? (
          <>
            <p className="text-sm text-text-primary font-medium">Set up your vault</p>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Passphrase (at least 10 characters)"
              className={inputClass}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Type it again"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <TtlPicker ttl={ttl} setTtl={setTtl} />
            <button className={buttonClass} disabled={busy || passphrase.length < 10} onClick={() => void create()}>
              {busy ? 'Sealing…' : 'Create vault'}
            </button>
          </>
        ) : state.unlocked ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-text-primary">
              Unlocked until {state.expiresAt ? new Date(state.expiresAt).toLocaleString() : 'later'}.
            </p>
            <button
              className={cn(buttonClass, 'bg-bg-tertiary text-text-primary hover:bg-bg-hover')}
              disabled={busy}
              onClick={() => void lock()}
            >
              Lock now
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-primary font-medium">
              Locked. Unlock to use your stored keys; jobs that need them resume once you do.
            </p>
            <input
              type="password"
              autoComplete="current-password"
              placeholder={useRecovery ? 'Recovery key' : 'Passphrase'}
              className={inputClass}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={useRecovery} onChange={(e) => setUseRecovery(e.target.checked)} />
              Use my recovery key instead
            </label>
            <TtlPicker ttl={ttl} setTtl={setTtl} />
            <button className={buttonClass} disabled={busy || !passphrase} onClick={() => void unlock()}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </>
        )}
      </div>

      {state.exists ? (
        <details className="rounded-xl bg-bg-secondary border border-border-subtle p-4">
          <summary className="cursor-pointer text-sm text-text-primary">Change passphrase</summary>
          <div className="space-y-3 mt-3">
            <input
              type="password"
              autoComplete="current-password"
              placeholder={useRecovery ? 'Recovery key' : 'Current passphrase'}
              className={inputClass}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={useRecovery} onChange={(e) => setUseRecovery(e.target.checked)} />
              I forgot it: use my recovery key
            </label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="New passphrase (at least 10 characters)"
              className={inputClass}
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
            />
            <button
              className={buttonClass}
              disabled={busy || !passphrase || newPassphrase.length < 10}
              onClick={() => void changePassphrase()}
            >
              Change passphrase
            </button>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function TtlPicker({ ttl, setTtl }: { ttl: string; setTtl: (v: string) => void }): React.ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      Stay unlocked for
      <select className={cn(inputClass, 'w-auto')} value={ttl} onChange={(e) => setTtl(e.target.value)}>
        {TTLS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
