'use client';

/**
 * Settings → Seedbox
 *
 * Connect your own seedbox on the master account. Once saved, "Send to seedbox"
 * (torrent detail) and "Play from seedbox" unlock for every profile under this
 * account. Secrets (API tokens, SSH private key, basic-auth password) are
 * encrypted at rest server-side and never sent back to the browser — the form
 * shows only whether each secret is set, and blank secret fields leave the
 * stored value untouched.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon, KeyIcon, LoadingSpinner, TrashIcon } from '@/components/ui/icons';

interface SeedboxProbe {
  url: string;
  reachable: boolean;
  authorized: boolean;
  status?: number;
  error?: string;
}

interface SeedboxProbeResult {
  http?: SeedboxProbe;
  files?: SeedboxProbe;
}

interface SeedboxSummary {
  configured: boolean;
  http: { baseUrl: string | null; hasToken: boolean; addPath: string | null; auth: string | null; magnetField: string | null; ready: boolean };
  ssh: { host: string | null; port: number | null; user: string | null; hasPrivateKey: boolean; watchDir: string | null; addCommand: string | null; ready: boolean };
  files: { baseUrl: string | null; auth: string | null; hasToken: boolean; basicUser: string | null; hasBasicPass: boolean; ready: boolean };
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none';
const labelCls = 'block text-xs font-medium text-text-secondary mb-1';

export function SeedboxSection(): React.ReactElement {
  const [summary, setSummary] = useState<SeedboxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installSteps, setInstallSteps] = useState<{ name: string; status: string; detail: string }[] | null>(null);
  const [dataDir, setDataDir] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SeedboxProbeResult | null>(null);

  // HTTP
  const [httpBaseUrl, setHttpBaseUrl] = useState('');
  const [httpToken, setHttpToken] = useState('');
  const [httpAddPath, setHttpAddPath] = useState('');
  const [httpAuth, setHttpAuth] = useState('');
  const [httpMagnetField, setHttpMagnetField] = useState('');

  // SSH
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('');
  const [sshUser, setSshUser] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshWatchDir, setSshWatchDir] = useState('');
  const [sshAddCommand, setSshAddCommand] = useState('');

  // Files
  const [filesBaseUrl, setFilesBaseUrl] = useState('');
  const [filesAuth, setFilesAuth] = useState('none');
  const [filesToken, setFilesToken] = useState('');
  const [filesBasicUser, setFilesBasicUser] = useState('');
  const [filesBasicPass, setFilesBasicPass] = useState('');

  const applySummary = useCallback((s: SeedboxSummary): void => {
    setSummary(s);
    setHttpBaseUrl(s.http.baseUrl ?? '');
    setHttpAddPath(s.http.addPath ?? '');
    setHttpAuth(s.http.auth ?? '');
    setHttpMagnetField(s.http.magnetField ?? '');
    setSshHost(s.ssh.host ?? '');
    setSshPort(s.ssh.port != null ? String(s.ssh.port) : '');
    setSshUser(s.ssh.user ?? '');
    setSshWatchDir(s.ssh.watchDir ?? '');
    setSshAddCommand(s.ssh.addCommand ?? '');
    setFilesBaseUrl(s.files.baseUrl ?? '');
    setFilesAuth(s.files.auth ?? 'none');
    setFilesBasicUser(s.files.basicUser ?? '');
    // Never repopulate secret fields.
    setHttpToken('');
    setSshPrivateKey('');
    setFilesToken('');
    setFilesBasicPass('');
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch('/api/account/seedbox');
      if (res.ok) {
        const data = (await res.json()) as { summary: SeedboxSummary };
        applySummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [applySummary]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (): Promise<void> => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account/seedbox', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          http: {
            baseUrl: httpBaseUrl,
            token: httpToken,
            addPath: httpAddPath,
            auth: httpAuth,
            magnetField: httpMagnetField,
          },
          ssh: {
            host: sshHost,
            port: sshPort,
            user: sshUser,
            privateKey: sshPrivateKey,
            watchDir: sshWatchDir,
            addCommand: sshAddCommand,
          },
          files: {
            baseUrl: filesBaseUrl,
            auth: filesAuth,
            token: filesToken,
            basicUser: filesBasicUser,
            basicPass: filesBasicPass,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { summary?: SeedboxSummary; error?: string };
      if (res.ok && data.summary) {
        applySummary(data.summary);
        setStatus({ ok: true, message: 'Seedbox saved' });
      } else {
        setStatus({ ok: false, message: data.error ?? 'Failed to save seedbox' });
      }
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : 'Failed to save seedbox' });
    } finally {
      setSaving(false);
    }
  }, [
    httpBaseUrl, httpToken, httpAddPath, httpAuth, httpMagnetField,
    sshHost, sshPort, sshUser, sshPrivateKey, sshWatchDir, sshAddCommand,
    filesBaseUrl, filesAuth, filesToken, filesBasicUser, filesBasicPass,
    applySummary,
  ]);

  const installTorlink = useCallback(async (): Promise<void> => {
    setInstalling(true);
    setStatus(null);
    setInstallSteps(null);
    try {
      const res = await fetch('/api/account/seedbox/install-torlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataDir: dataDir.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        steps?: { name: string; status: string; detail: string }[];
        summary?: SeedboxSummary;
      };
      if (data.steps) setInstallSteps(data.steps);
      if (res.ok && data.success) {
        if (data.summary) applySummary(data.summary);
        setStatus({ ok: true, message: 'torlink installed and running — HTTP + files are now connected.' });
      } else {
        setStatus({ ok: false, message: data.error ?? 'Install failed' });
      }
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : 'Install failed' });
    } finally {
      setInstalling(false);
    }
  }, [applySummary, dataDir]);

  const testConnection = useCallback(async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    setStatus(null);
    try {
      const res = await fetch('/api/account/seedbox/test');
      const data = (await res.json().catch(() => ({}))) as SeedboxProbeResult;
      setTestResult(data);
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    if (!window.confirm('Disconnect your seedbox? This removes the stored connection and credentials.')) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account/seedbox', { method: 'DELETE' });
      if (res.ok) {
        await load();
        setStatus({ ok: true, message: 'Seedbox disconnected' });
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ ok: false, message: data.error ?? 'Failed to disconnect' });
      }
    } finally {
      setSaving(false);
    }
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <LoadingSpinner className="h-4 w-4" /> Loading seedbox settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Seedbox</h2>
        <p className="text-sm text-text-secondary">
          Connect your own seedbox to push torrents to it and stream completed files back. Configured
          on your account and available to all of your profiles. Credentials are encrypted at rest and
          never shown again after saving.
        </p>
        {summary?.configured ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <StatusPill on={summary.http.ready} label="HTTP send" />
            <StatusPill on={summary.ssh.ready} label="SSH send" />
            <StatusPill on={summary.files.ready} label="Play from seedbox" />
          </div>
        ) : (
          <p className="mt-2 text-xs text-text-tertiary">No seedbox connected yet.</p>
        )}
      </div>

      {/* How it works + firewall requirements — the #1 cause of "Could not reach seedbox". */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-text-secondary space-y-2">
        <p className="font-semibold text-text-primary">How the connection works — and why HTTP can fail</p>
        <p>
          The app reaches your seedbox two ways: over <strong>SSH (port 22)</strong> to send magnets, and over{' '}
          <strong>HTTP</strong> to the torlink daemon — the add-API on <code className="rounded bg-border/40 px-1">9161</code>{' '}
          (send) and the file server on <code className="rounded bg-border/40 px-1">9160</code> (&ldquo;Play from
          seedbox&rdquo;), each authenticated with a bearer token created during install.
        </p>
        <p>
          <strong className="text-amber-500">If you see &ldquo;Could not reach seedbox: fetch failed&rdquo;</strong>,
          ports 9160/9161 are blocked. The installer opens the OS firewall (<code className="rounded bg-border/40 px-1">ufw</code>),
          but <strong>you must also open TCP 9160 and 9161 in your host&rsquo;s cloud/provider firewall</strong> (DigitalOcean,
          Vultr, Hetzner, AWS security groups, a home router, etc.) — that&rsquo;s outside the box&rsquo;s control. SSH send
          can work while HTTP fails because only port 22 is open. Use <strong>Test connection</strong> below to check.
        </p>
        <p>
          <strong>Auth is automatic — you don&rsquo;t type a token.</strong> &ldquo;Install torlink &amp; open ports&rdquo;
          generates a random <strong>Bearer token</strong>, starts the daemons with it, and stores it here (encrypted).
          If Test connection shows <span className="text-amber-500">token rejected (401)</span>, an old torlink daemon is
          still running with a different token — just click <strong>Install torlink &amp; open ports</strong> again to
          stop it and re-sync. (Setting the HTTP/token fields by hand is only for a non-torlink client.)
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => void testConnection()}
            disabled={testing || !summary?.configured}
            title={summary?.configured ? undefined : 'Connect a seedbox first'}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? <LoadingSpinner className="h-4 w-4" /> : null}
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {testResult ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {testResult.http ? <ReachPill label="HTTP :9161" probe={testResult.http} /> : null}
              {testResult.files ? <ReachPill label="Files :9160" probe={testResult.files} /> : null}
              {!testResult.http && !testResult.files ? (
                <span className="text-text-tertiary">No HTTP endpoints configured yet — run the installer below.</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* HTTP transport */}
      <fieldset className="rounded-lg border border-border p-4 space-y-3">
        <legend className="px-1 text-sm font-semibold text-text-primary">HTTP (torlink serve)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Base URL</label>
            <input className={inputCls} placeholder="http://seed.example.com:9161" value={httpBaseUrl} onChange={(e) => setHttpBaseUrl(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>
              API token {summary?.http.hasToken ? <SavedHint /> : null}
            </label>
            <input className={inputCls} type="password" placeholder={summary?.http.hasToken ? '•••••• (unchanged)' : 'token'} value={httpToken} onChange={(e) => setHttpToken(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Add path <span className="text-text-tertiary">(default /add)</span></label>
            <input className={inputCls} placeholder="/add" value={httpAddPath} onChange={(e) => setHttpAddPath(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Auth <span className="text-text-tertiary">(bearer or header:X-Header)</span></label>
            <input className={inputCls} placeholder="bearer" value={httpAuth} onChange={(e) => setHttpAuth(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Magnet field <span className="text-text-tertiary">(default magnet)</span></label>
            <input className={inputCls} placeholder="magnet" value={httpMagnetField} onChange={(e) => setHttpMagnetField(e.target.value)} />
          </div>
        </div>
      </fieldset>

      {/* SSH transport */}
      <fieldset className="rounded-lg border border-border p-4 space-y-3">
        <legend className="px-1 text-sm font-semibold text-text-primary">SSH</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Host</label>
            <input className={inputCls} placeholder="seed.example.com" value={sshHost} onChange={(e) => setSshHost(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Port <span className="text-text-tertiary">(22)</span></label>
            <input className={inputCls} inputMode="numeric" placeholder="22" value={sshPort} onChange={(e) => setSshPort(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>User</label>
            <input className={inputCls} placeholder="seeduser" value={sshUser} onChange={(e) => setSshUser(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>
            Private key {summary?.ssh.hasPrivateKey ? <SavedHint /> : null}
          </label>
          <textarea className={cn(inputCls, 'font-mono text-xs')} rows={4} placeholder={summary?.ssh.hasPrivateKey ? '•••••• (unchanged)' : '-----BEGIN OPENSSH PRIVATE KEY-----'} value={sshPrivateKey} onChange={(e) => setSshPrivateKey(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Watch dir <span className="text-text-tertiary">(drop .magnet)</span></label>
            <input className={inputCls} placeholder="/home/seeduser/watch" value={sshWatchDir} onChange={(e) => setSshWatchDir(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>…or add command</label>
            <input className={inputCls} placeholder="transmission-remote -a {magnet}" value={sshAddCommand} onChange={(e) => setSshAddCommand(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-text-tertiary">Provide a private key that can log into your seedbox, plus either a watch directory or an add-command.</p>

        {/* One-click torlink provisioning — needs a working SSH connection saved first. */}
        <div className="rounded-md border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">Install torlink on this seedbox</p>
              <p className="text-xs text-text-tertiary">
                Runs <code className="rounded bg-border/40 px-1">npm i -g torlnk</code> (auto-installing the latest Node LTS
                via <code className="rounded bg-border/40 px-1">mise</code> if the box has no Node), starts the add-API (9161)
                and file server (9160), tries to open those ports in <code className="rounded bg-border/40 px-1">ufw</code>,
                and connects them here automatically. Requires a saved SSH connection. <strong>You must still open 9160/9161
                in any cloud/provider firewall yourself.</strong>
              </p>
            </div>
            <button
              onClick={() => void installTorlink()}
              disabled={installing || !summary?.ssh.ready}
              title={summary?.ssh.ready ? undefined : 'Save an SSH host, user, and private key first'}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-accent-primary px-3 py-1.5 text-xs font-medium text-accent-primary hover:bg-accent-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {installing ? <LoadingSpinner className="h-4 w-4" /> : null}
              {installing ? 'Installing…' : 'Install torlink & open ports'}
            </button>
          </div>
          <div className="mt-3">
            <label className={labelCls}>
              Download directory <span className="text-text-tertiary">(where torlink saves &amp; serves files; default ~/torlnk/downloads)</span>
            </label>
            <input
              className={inputCls}
              placeholder="~/torlnk/downloads"
              value={dataDir}
              onChange={(e) => setDataDir(e.target.value)}
            />
          </div>
          {installSteps ? (
            <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
              {installSteps.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex gap-2">
                  <span
                    className={cn(
                      'font-mono',
                      s.status === 'ok' ? 'text-green-500' : s.status === 'skip' ? 'text-amber-500' : 'text-red-500'
                    )}
                  >
                    {s.status === 'ok' ? '✓' : s.status === 'skip' ? '!' : '✗'} {s.name}
                  </span>
                  <span className="text-text-tertiary">{s.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </fieldset>

      {/* Files server */}
      <fieldset className="rounded-lg border border-border p-4 space-y-3">
        <legend className="px-1 text-sm font-semibold text-text-primary">Files server (playback)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Base URL</label>
            <input className={inputCls} placeholder="http://seed.example.com:9160" value={filesBaseUrl} onChange={(e) => setFilesBaseUrl(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Auth</label>
            <select className={inputCls} value={filesAuth} onChange={(e) => setFilesAuth(e.target.value)}>
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic (user/pass)</option>
            </select>
          </div>
          {filesAuth === 'bearer' && (
            <div>
              <label className={labelCls}>Token {summary?.files.hasToken ? <SavedHint /> : null}</label>
              <input className={inputCls} type="password" placeholder={summary?.files.hasToken ? '•••••• (unchanged)' : 'token'} value={filesToken} onChange={(e) => setFilesToken(e.target.value)} />
            </div>
          )}
          {filesAuth === 'basic' && (
            <>
              <div>
                <label className={labelCls}>Username</label>
                <input className={inputCls} placeholder="user" value={filesBasicUser} onChange={(e) => setFilesBasicUser(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Password {summary?.files.hasBasicPass ? <SavedHint /> : null}</label>
                <input className={inputCls} type="password" placeholder={summary?.files.hasBasicPass ? '•••••• (unchanged)' : 'password'} value={filesBasicPass} onChange={(e) => setFilesBasicPass(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </fieldset>

      {status ? (
        <div className={cn('text-sm', status.ok ? 'text-green-500' : 'text-red-500')}>{status.message}</div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? <LoadingSpinner className="h-4 w-4" /> : <KeyIcon className="h-4 w-4" />}
          Save seedbox
        </button>
        {summary?.configured ? (
          <button
            onClick={() => void disconnect()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:text-red-500 disabled:opacity-60"
          >
            <TrashIcon className="h-4 w-4" /> Disconnect
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ on, label }: { on: boolean; label: string }): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        on ? 'bg-green-500/15 text-green-500' : 'bg-border/40 text-text-tertiary'
      )}
    >
      {on ? <CheckIcon className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

function SavedHint(): React.ReactElement {
  return <span className="ml-1 text-[10px] font-normal text-green-500">saved</span>;
}

function ReachPill({ label, probe }: { label: string; probe: SeedboxProbe }): React.ReactElement {
  // Three states: blocked (no response), unauthorized (answered but token
  // rejected), and ok (answered + token accepted).
  const state = !probe.reachable ? 'blocked' : !probe.authorized ? 'unauthorized' : 'ok';
  const styles =
    state === 'ok'
      ? 'bg-green-500/15 text-green-500'
      : state === 'unauthorized'
        ? 'bg-amber-500/15 text-amber-500'
        : 'bg-red-500/15 text-red-500';
  const text =
    state === 'ok'
      ? 'ok'
      : state === 'unauthorized'
        ? `${probe.status ?? 'auth'} — token rejected`
        : 'blocked';
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', styles)}
      title={probe.error ?? (probe.status != null ? `HTTP ${probe.status}` : undefined)}
    >
      {state === 'ok' ? <CheckIcon className="h-3 w-3" /> : null}
      {label}: {text}
    </span>
  );
}
