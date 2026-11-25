'use client';

/**
 * Seedbox quick start: from "I have no box" to torlink running, in three steps.
 *
 *  1. Pick a box (prices from r4ck.dev), or use one you have.
 *  2. Type its address. We make an SSH key for it and hand back one line to paste on
 *     the box. No private key to find, no password given to us.
 *  3. One button checks the connection and installs torlink.
 *
 * The full form (Setup) is still there for a box with its own key or an add-API already
 * running; this is the path for everybody else.
 */

import { useCallback, useState } from 'react';
import { ServerOffers } from '@/components/seedbox/server-offers';
import { cn } from '@/lib/utils';

interface ConnectLine {
  id: string;
  command: string;
  login: string;
}

interface Step {
  name: string;
  status: string;
  detail: string;
}

const input =
  'w-full rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-hidden';
const primary =
  'rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:opacity-50';
const card = 'rounded-xl border border-border-subtle bg-bg-secondary p-5';

function StepHeading({ n, title, done }: { n: number; title: string; done?: boolean }): React.ReactElement {
  return (
    <h3 className="mb-3 flex items-center gap-3 font-semibold text-text-primary">
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm',
          done ? 'bg-status-success/20 text-status-success' : 'bg-accent-primary/15 text-accent-primary'
        )}
      >
        {done ? '✓' : n}
      </span>
      {title}
    </h3>
  );
}

function CopyLine({ label, value }: { label: string; value: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-secondary">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-xs text-text-primary">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="shrink-0 rounded-lg border border-border-default px-3 py-2 text-xs font-medium text-text-secondary hover:border-accent-primary"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function QuickStart({ onReady }: { onReady?: () => void }): React.ReactElement {
  const [host, setHost] = useState('');
  const [user, setUser] = useState('root');
  const [port, setPort] = useState('22');
  const [line, setLine] = useState<ConnectLine | null>(null);
  const [busy, setBusy] = useState<'key' | 'install' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [ready, setReady] = useState(false);

  const makeLine = useCallback(async () => {
    setBusy('key');
    setError(null);
    setConnected(null);
    setSteps(null);
    setReady(false);
    try {
      // The same box again (a typo fixed, a lost line) keeps its row; a new address is a new box.
      const res = await fetch(`/api/account/seedbox/quick-connect${line ? `?id=${encodeURIComponent(line.id)}` : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ host, user, port, name: host.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ConnectLine> & { error?: string; message?: string };
      if (!res.ok || !body.id || !body.command || !body.login) {
        throw new Error(body.error ?? body.message ?? 'Could not set that up.');
      }
      setLine({ id: body.id, command: body.command, login: body.login });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [host, user, port, line]);

  const connectAndInstall = useCallback(async () => {
    if (!line) return;
    setBusy('install');
    setError(null);
    setSteps(null);
    try {
      const check = await fetch(`/api/account/seedbox/quick-connect?id=${encodeURIComponent(line.id)}`, { cache: 'no-store' });
      const seen = (await check.json().catch(() => ({}))) as {
        connected?: boolean;
        error?: string;
        message?: string;
        user?: string;
        system?: string;
        freeGb?: number | null;
      };
      if (!seen.connected) throw new Error(seen.error ?? seen.message ?? 'Could not connect to the box.');
      setConnected(
        `Connected as ${seen.user} (${seen.system})${typeof seen.freeGb === 'number' ? `, ${seen.freeGb} GB free` : ''}. Installing torlink…`
      );

      const install = await fetch(`/api/account/seedbox/install-torlink?id=${encodeURIComponent(line.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seedHours: 2 }),
      });
      const done = (await install.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string; steps?: Step[] };
      setSteps(done.steps ?? null);
      if (!install.ok || !done.success) throw new Error(done.error ?? done.message ?? 'The install did not finish.');
      setConnected(`Connected as ${seen.user} (${seen.system}). torlink is installed and running.`);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [line]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-medium text-text-primary">Set up a seedbox in three steps</h2>
        <p className="text-sm text-text-secondary">
          A seedbox is your own server running torlink. It downloads and seeds there, and you stream the files here.
        </p>
      </div>

      <div className={card}>
        <StepHeading n={1} title="Get a box, or use one you have" />
        <ServerOffers />
      </div>

      <div className={card}>
        <StepHeading n={2} title="Tell us where it is" done={line !== null} />
        <form
          className="grid gap-3 sm:grid-cols-[2fr_1fr_6rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void makeLine();
          }}
        >
          <label className="text-xs font-medium text-text-secondary">
            IP address or hostname
            <input className={cn(input, 'mt-1')} value={host} onChange={(e) => setHost(e.target.value)} placeholder="203.0.113.10" required />
          </label>
          <label className="text-xs font-medium text-text-secondary">
            User
            <input className={cn(input, 'mt-1')} value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" />
          </label>
          <label className="text-xs font-medium text-text-secondary">
            SSH port
            <input className={cn(input, 'mt-1')} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" placeholder="22" />
          </label>
          <button type="submit" disabled={busy !== null || !host.trim()} className={cn(primary, 'self-end')}>
            {busy === 'key' ? 'Working…' : line ? 'Make a new line' : 'Get my connect line'}
          </button>
        </form>
        <p className="mt-2 text-xs text-text-muted">
          We make an SSH key just for this box. You never send us a password, and the private half of the key never leaves our vault.
        </p>

        {line ? (
          <div className="mt-4 flex flex-col gap-3">
            <CopyLine label="1. Log in to your box (your provider gave you the password)" value={line.login} />
            <CopyLine label="2. Paste this line there and press Enter" value={line.command} />
            <p className="text-xs text-text-muted">
              It adds our key to the box&apos;s authorized keys and prints &quot;BitTorrented can connect now&quot;. To cut us off later, delete that
              line from ~/.ssh/authorized_keys.
            </p>
          </div>
        ) : null}
      </div>

      <div className={cn(card, !line && 'opacity-60')}>
        <StepHeading n={3} title="Connect and install torlink" done={ready} />
        <p className="mb-3 text-sm text-text-secondary">
          Checks the connection, installs torlink, starts it, opens its two ports and saves the result here. About two minutes.
        </p>
        <button type="button" onClick={() => void connectAndInstall()} disabled={!line || busy !== null} className={primary}>
          {busy === 'install' ? 'Working… this takes a couple of minutes' : ready ? 'Run it again' : 'Connect and install'}
        </button>

        {connected ? <p className="mt-3 text-sm text-status-success">{connected}</p> : null}
        {steps ? (
          <ul className="mt-3 space-y-1 text-xs">
            {steps.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex gap-2">
                <span className={s.status === 'ok' ? 'text-status-success' : s.status === 'fail' ? 'text-red-500' : 'text-text-muted'}>
                  {s.status === 'ok' ? '✓' : s.status === 'fail' ? '✕' : '·'}
                </span>
                <span className="text-text-secondary">
                  <span className="font-medium text-text-primary">{s.name}</span> {s.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {ready ? (
          <p className="mt-4 text-sm text-text-primary">
            Your seedbox is ready.{' '}
            <button type="button" onClick={onReady} className="font-medium text-accent-primary hover:underline">
              Add your first torrent
            </button>
          </p>
        ) : null}
      </div>

      {error ? <ErrorLine message={error} /> : null}

      <ConnectWithCode onReady={onReady} />
    </div>
  );
}

/** A locked or missing vault is the one error with a place to go and fix it. */
function ErrorLine({ message }: { message: string }): React.ReactElement {
  const vault = /key vault/i.test(message);
  return (
    <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
      {message}
      {vault ? (
        <>
          {' '}
          <a href="/settings" className="underline">
            Open Settings
          </a>
        </>
      ) : null}
    </p>
  );
}

const INSTALL_LINE = 'curl -fsSL https://bittorrented.com/torlink/install.sh | bash';

/**
 * For a box that runs torlink already, or that you would rather set up yourself: a
 * c0mpute node (`c0mpute plugin install torlink`), or any Linux machine. The installer
 * prints a code; pasting it here adds the box, with no SSH.
 */
function ConnectWithCode({ onReady }: { onReady?: () => void }): React.ReactElement {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch('/api/account/seedbox/connect-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; message?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? body.message ?? 'Could not add that box.');
      // Ask the box: an unreachable port is the usual first problem, so say it now.
      const probe = await fetch(`/api/account/seedbox/test?id=${encodeURIComponent(body.id)}`, { cache: 'no-store' });
      const seen = (await probe.json().catch(() => ({}))) as {
        http?: { reachable?: boolean; authorized?: boolean; error?: string };
      };
      if (seen.http?.reachable && seen.http.authorized) {
        setDone('Connected. The box answered and accepted its token.');
        setCode('');
      } else if (seen.http?.reachable) {
        setDone('Added, but the box refused the token. Run the installer again and paste the new code.');
      } else {
        setDone(
          `Added, but the box did not answer${seen.http?.error ? ` (${seen.http.error})` : ''}. Open TCP 9161 and 9160 in your provider's firewall, then press Test on the Setup tab.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [code]);

  return (
    <div className={card}>
      <h3 className="mb-1 font-semibold text-text-primary">Already run a c0mpute node or your own server? Connect with a code</h3>
      <p className="mb-3 text-sm text-text-secondary">
        Install torlink on the machine yourself, then paste the code it prints. No SSH from us at all.
      </p>
      <div className="flex flex-col gap-3">
        <CopyLine label="On a c0mpute node" value="c0mpute plugin install torlink" />
        <CopyLine label="On any Linux machine" value={INSTALL_LINE} />
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <input
            className={cn(input, 'font-mono')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="btsb1_…"
            aria-label="Connect code"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={busy || !code.trim()} className={cn(primary, 'shrink-0')}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>
        {done ? (
          <p className="text-sm text-text-primary">
            {done}{' '}
            {done.startsWith('Connected') ? (
              <button type="button" onClick={onReady} className="font-medium text-accent-primary hover:underline">
                Add your first torrent
              </button>
            ) : null}
          </p>
        ) : null}
        {error ? <ErrorLine message={error} /> : null}
        <p className="text-xs text-text-muted">
          The same folder can be shared on nixamp as a station (the installer prints the command). Only share what you have
          the right to.
        </p>
      </div>
    </div>
  );
}
