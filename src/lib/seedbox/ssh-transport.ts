/**
 * SSH transport — deliver a torrent to the seedbox over SSH, using the system
 * openssh binaries (no npm dependency). Two delivery modes:
 *
 *   - watch dir: write the magnet as a `<name>.magnet` file into a monitored
 *     blackhole directory (written to a temp name and moved into place so the
 *     client never sees a partial file).
 *   - add command: run a configurable command on the box with `{magnet}` /
 *     `{name}` substituted (shell-quoted) — e.g. `torlink add "{magnet}"`.
 */

import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SeedboxSshConfig } from './config';
import type { SendResult } from './http-transport';

/** Single-quote a value for safe embedding in a POSIX shell command. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Sanitize a torrent name into a safe basename for a dropped file. */
export function buildMagnetFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, ' ')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const base = cleaned.length > 0 ? cleaned : 'torrent';
  return `${base}.magnet`;
}

/** Render an add-command template, shell-quoting the substituted values. */
export function renderAddCommand(template: string, magnet: string, name: string): string {
  return template
    .replace(/\{magnet\}/g, shellQuote(magnet))
    .replace(/\{name\}/g, shellQuote(name));
}

/** Build the remote shell command that atomically writes stdin to a watch-dir file. */
export function buildWatchDirCommand(watchDir: string, filename: string): string {
  const target = `${watchDir.replace(/\/+$/, '')}/${filename}`;
  const quoted = shellQuote(target);
  // Write to a temp file in the same dir, then move into place atomically.
  return `tmp=$(mktemp "${target.replace(/\/+$/, '')}.XXXXXX") && cat > "$tmp" && mv "$tmp" ${quoted}`;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

function runExecFile(
  file: string,
  args: string[],
  input?: string,
  timeoutMs = 30_000
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr?.trim() || error.message;
        reject(new Error(detail));
        return;
      }
      resolve({ stdout, stderr });
    });
    if (input !== undefined && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

/**
 * Run an arbitrary command on the account's seedbox over SSH, using its stored
 * key. The command is fed to a remote `bash -s` on stdin (via `input`) so long
 * scripts need no shell-quoting. Used by the torlink provisioner.
 */
export async function execRemote(
  config: SeedboxSshConfig,
  options: { command?: string; input?: string; timeoutMs?: number }
): Promise<ExecResult> {
  return withPrivateKeyFile(config, async (keyPath) => {
    const target = `${config.user}@${config.host}`;
    const sshArgs = baseSshArgs(config, keyPath);
    const remote = options.command ?? 'bash -s';
    return runExecFile('ssh', [...sshArgs, target, remote], options.input, options.timeoutMs ?? 30_000);
  });
}

/**
 * Materialize the configured private key to a locked-down temp file and invoke
 * `fn` with its path. The file is always removed afterward.
 */
async function withPrivateKeyFile<T>(
  config: SeedboxSshConfig,
  fn: (keyPath: string) => Promise<T>
): Promise<T> {
  if (config.privateKeyPath) {
    return fn(config.privateKeyPath);
  }
  if (!config.privateKey) {
    throw new Error('No SSH private key configured');
  }
  const dir = await mkdtemp(join(tmpdir(), 'seedbox-key-'));
  const keyPath = join(dir, 'id');
  try {
    // OpenSSH/OpenSSL reject a key with CRLF (or lone CR) line endings or a
    // missing trailing newline with a cryptic "error in libcrypto". Textarea
    // pastes routinely carry CRLF, so normalize to LF + exactly one trailing
    // newline before handing the file to ssh/ssh-keygen.
    const material = `${config.privateKey.replace(/\r\n?/g, '\n').replace(/\n+$/, '')}\n`;
    await writeFile(keyPath, material, { mode: 0o600 });
    await chmod(keyPath, 0o600);
    return await fn(keyPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function baseSshArgs(config: SeedboxSshConfig, keyPath: string): string[] {
  return [
    '-i',
    keyPath,
    '-p',
    String(config.port),
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ConnectTimeout=15',
  ];
}

/** Derive the OpenSSH public key from the configured private key. */
export async function getSeedboxPublicKey(config: SeedboxSshConfig): Promise<string | null> {
  try {
    return await withPrivateKeyFile(config, async (keyPath) => {
      const { stdout } = await runExecFile('ssh-keygen', ['-y', '-f', keyPath]);
      return stdout.trim() || null;
    });
  } catch {
    return null;
  }
}

/**
 * Node one-liner run on the seedbox that POSTs a magnet to torlink's *local*
 * add-API. Input (url/token/magnet) arrives as JSON on stdin, so neither the
 * token nor the magnet ever appears in the box's process list.
 */
const REMOTE_ADD_SCRIPT = `let s='';process.stdin.on('data',d=>s+=d).on('end',async()=>{try{const{u,t,m}=JSON.parse(s);const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({magnet:m})});const b=await r.text();process.stdout.write(String(r.status)+' '+b);if(!r.ok)process.exit(1)}catch(e){process.stderr.write(String(e&&e.message||e));process.exit(1)}})`;

/**
 * Deliver a magnet by asking the box to hand it to torlink's own add-API over
 * loopback.
 *
 * Why not the watch dir: torlink's watch-folder feature is a separate
 * subcommand (`torlnk watch <dir>`), not part of `serve` — the provisioner only
 * ever ran `serve` and `files`, so files dropped into the watch dir were read by
 * nobody. And even with a watch daemon running it would be a *separate process
 * with its own queue*, invisible to the `serve` /status that the status page and
 * progress bar poll. Going through the same daemon keeps one queue, so SSH-sent
 * torrents show up exactly like HTTP-sent ones.
 */
export async function sendMagnetViaSshToLocalApi(
  ssh: SeedboxSshConfig,
  addUrl: string,
  token: string,
  magnet: string
): Promise<SendResult> {
  try {
    return await withPrivateKeyFile(ssh, async (keyPath) => {
      const target = `${ssh.user}@${ssh.host}`;
      const sshArgs = baseSshArgs(ssh, keyPath);
      // Non-interactive SSH gets a minimal PATH; torlink requires Node, and the
      // provisioner installs it via mise, so look there too.
      const remoteCmd =
        `export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"; ` +
        `exec node -e ${shellQuote(REMOTE_ADD_SCRIPT)}`;
      const payload = JSON.stringify({ u: addUrl, t: token, m: magnet });
      const { stdout } = await runExecFile('ssh', [...sshArgs, target, remoteCmd], payload);
      // torlink answers 200 {"ok":true,"outcome":"added"|"duplicate"}.
      const outcome = /"outcome"\s*:\s*"([a-z]+)"/i.exec(stdout)?.[1];
      return {
        ok: true,
        transport: 'ssh',
        message:
          outcome === 'duplicate'
            ? 'Already on the seedbox — torlink is tracking it'
            : 'Handed to torlink on the seedbox via SSH',
      };
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, transport: 'ssh', message: `SSH delivery failed: ${detail}` };
  }
}

export async function sendMagnetViaSsh(
  config: SeedboxSshConfig,
  magnet: string,
  name: string
): Promise<SendResult> {
  try {
    return await withPrivateKeyFile(config, async (keyPath) => {
      const target = `${config.user}@${config.host}`;
      const sshArgs = baseSshArgs(config, keyPath);

      if (config.watchDir) {
        const filename = buildMagnetFilename(name);
        const remoteCmd = buildWatchDirCommand(config.watchDir, filename);
        await runExecFile('ssh', [...sshArgs, target, remoteCmd], magnet);
        return { ok: true, transport: 'ssh', message: `Dropped ${filename} into seedbox watch folder` };
      }

      if (config.addCommand) {
        const remoteCmd = renderAddCommand(config.addCommand, magnet, name);
        await runExecFile('ssh', [...sshArgs, target, remoteCmd]);
        return { ok: true, transport: 'ssh', message: 'Sent to seedbox via SSH command' };
      }

      return { ok: false, transport: 'ssh', message: 'SSH transport has no delivery mode configured' };
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, transport: 'ssh', message: `SSH delivery failed: ${detail}` };
  }
}
