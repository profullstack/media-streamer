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
    const material = config.privateKey.endsWith('\n')
      ? config.privateKey
      : `${config.privateKey}\n`;
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
