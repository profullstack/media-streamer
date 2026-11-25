/**
 * Quick connect: get a member's own server talking to us without them handling a key.
 *
 * The setup form asks for an SSH private key to be pasted in, which is the step people
 * give up at: most have a fresh box with a root password and no key at all, and a
 * private key is the wrong thing to be pasting into a web page anyway. Here we make the
 * key. The private half is sealed in the member's vault with the rest of the seedbox
 * config and never shown; the public half goes back as one line to paste into the box.
 * After that the existing one-click installer (provisionTorlink) does the rest.
 *
 * Nothing here takes a password: the box's password stays between the member and
 * their provider.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface SshKeyPair {
  /** OpenSSH private key (the format `ssh -i` reads). */
  privateKey: string;
  /** One `ssh-ed25519 AAAA… comment` line. */
  publicKey: string;
}

const KEY_COMMENT = 'bittorrented-seedbox';

/** A fresh ed25519 pair, made by ssh-keygen so it is in the format ssh itself reads. */
export async function generateSshKeyPair(): Promise<SshKeyPair> {
  const dir = await mkdtemp(join(tmpdir(), 'seedbox-newkey-'));
  const keyPath = join(dir, 'id');
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'ssh-keygen',
        ['-q', '-t', 'ed25519', '-N', '', '-C', KEY_COMMENT, '-f', keyPath],
        { timeout: 15_000 },
        (error, _stdout, stderr) => (error ? reject(new Error(stderr?.trim() || error.message)) : resolve())
      );
    });
    const [privateKey, publicKey] = await Promise.all([readFile(keyPath, 'utf8'), readFile(`${keyPath}.pub`, 'utf8')]);
    return { privateKey, publicKey: publicKey.trim() };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** One public key line, and nothing that could carry a second command. */
export function isPublicKeyLine(value: string): boolean {
  return /^ssh-(ed25519|rsa) [A-Za-z0-9+/=]{40,1000}( [A-Za-z0-9@._-]{1,64})?$/.test(value);
}

/**
 * The one line a member pastes on their box to let this key in. Idempotent: pasting it
 * twice does not add the key twice, and it fixes the permissions sshd insists on.
 */
export function authorizeCommand(publicKey: string): string {
  if (!isPublicKeyLine(publicKey)) throw new Error('Not a public key');
  return (
    `mkdir -p ~/.ssh && chmod 700 ~/.ssh && ` +
    `grep -qxF '${publicKey}' ~/.ssh/authorized_keys 2>/dev/null || echo '${publicKey}' >> ~/.ssh/authorized_keys; ` +
    `chmod 600 ~/.ssh/authorized_keys && echo "BitTorrented can connect now"`
  );
}

/** A hostname or an IP address, and nothing ssh would read as an option. */
export function cleanHost(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const host = value.trim().replace(/^\[|\]$/g, '');
  if (!host || host.length > 253 || host.startsWith('-')) return null;
  const hostname = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
  const ipv6 = /^[0-9A-Fa-f:.]{3,45}$/;
  if (hostname.test(host)) return host;
  return host.includes(':') && ipv6.test(host) ? host : null;
}

/** A unix login name. Defaults to root, which is what a new box hands out. */
export function cleanUser(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return 'root';
  if (typeof value !== 'string') return null;
  const user = value.trim();
  return /^[a-z_][a-z0-9_-]{0,31}$/i.test(user) ? user : null;
}

export function cleanPort(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 22;
  const port = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

/** What somebody types to get onto the box and paste the line. */
export function loginCommand(host: string, user: string, port: number): string {
  const target = host.includes(':') ? `${user}@[${host}]` : `${user}@${host}`;
  return port === 22 ? `ssh ${target}` : `ssh -p ${port} ${target}`;
}

/**
 * SSH failures in words. ssh's own stderr is accurate and unreadable; these are the
 * three things that actually go wrong on a first connect.
 */
export function explainSshFailure(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes('permission denied')) {
    return 'The box refused the key. Log in to it, paste the line above, then try again.';
  }
  if (d.includes('timed out') || d.includes('no route to host') || d.includes('network is unreachable')) {
    return 'The box did not answer. Check the address and port, and that its firewall allows SSH.';
  }
  if (d.includes('connection refused')) {
    return 'Nothing is listening for SSH on that port. Check the port (most boxes use 22).';
  }
  if (d.includes('could not resolve') || d.includes('name or service not known')) {
    return 'That hostname does not resolve. Use the IP address your provider gave you.';
  }
  if (d.includes('enoent')) {
    return 'SSH is not available on our side right now. Tell support; this is ours to fix.';
  }
  return `Could not connect: ${detail.split('\n')[0]?.slice(0, 200) ?? 'unknown error'}`;
}
