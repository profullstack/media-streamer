/**
 * Seedbox transport configuration
 *
 * Reads seedbox connection settings from the environment. Two transports are
 * supported for handing a torrent off to the seedbox:
 *
 *   - HTTP:  POST the magnet to a torrent-client API (e.g. torlink) using a
 *            bearer token or a custom header.
 *   - SSH:   either drop a `.magnet` file into a watch/blackhole directory the
 *            client monitors, or run a configurable add-command on the box.
 *
 * The feature fails closed: it is only available to the emails listed in
 * `SEEDBOX_ALLOWED_EMAILS`, and only for transports that are fully configured.
 */

export type SeedboxTransport = 'http' | 'ssh';

/** How the HTTP transport authenticates against the seedbox API. */
export type SeedboxHttpAuth =
  | { kind: 'bearer' }
  | { kind: 'header'; header: string };

export interface SeedboxHttpConfig {
  baseUrl: string;
  token: string;
  /** Path the magnet is POSTed to. */
  addPath: string;
  auth: SeedboxHttpAuth;
  /** JSON field name that carries the magnet in the POST body. */
  magnetField: string;
}

export interface SeedboxSshConfig {
  host: string;
  port: number;
  user: string;
  /** Private key material (PEM/OpenSSH), or null when a path is used instead. */
  privateKey: string | null;
  /** Path to a private key file on the server, or null when key material is inlined. */
  privateKeyPath: string | null;
  /** Watch/blackhole directory to drop `.magnet` files into (mode A). */
  watchDir: string | null;
  /** Command to run on the box, with `{magnet}` / `{name}` placeholders (mode B). */
  addCommand: string | null;
}

export interface SeedboxConfig {
  allowedEmails: string[];
  http: SeedboxHttpConfig | null;
  ssh: SeedboxSshConfig | null;
}

function readTrimmed(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseAllowedEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

function parseHttpAuth(raw: string | null): SeedboxHttpAuth {
  if (!raw || raw.toLowerCase() === 'bearer') return { kind: 'bearer' };
  const match = /^header:(.+)$/i.exec(raw);
  if (match) {
    const header = match[1].trim();
    if (header.length > 0) return { kind: 'header', header };
  }
  // Unrecognized value — fall back to bearer rather than silently mis-authing.
  return { kind: 'bearer' };
}

function readHttpConfig(): SeedboxHttpConfig | null {
  const baseUrl = readTrimmed('SEEDBOX_HTTP_BASE_URL');
  const token = readTrimmed('SEEDBOX_HTTP_TOKEN');
  // Both are required for the HTTP transport to be usable.
  if (!baseUrl || !token) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token,
    addPath: readTrimmed('SEEDBOX_HTTP_ADD_PATH') ?? '/api/torrents/add',
    auth: parseHttpAuth(readTrimmed('SEEDBOX_HTTP_AUTH')),
    magnetField: readTrimmed('SEEDBOX_HTTP_MAGNET_FIELD') ?? 'magnet',
  };
}

function readSshConfig(): SeedboxSshConfig | null {
  const host = readTrimmed('SEEDBOX_SSH_HOST');
  const user = readTrimmed('SEEDBOX_SSH_USER');
  const privateKey = readTrimmed('SEEDBOX_SSH_PRIVATE_KEY');
  const privateKeyPath = readTrimmed('SEEDBOX_SSH_PRIVATE_KEY_PATH');
  const watchDir = readTrimmed('SEEDBOX_SSH_WATCH_DIR');
  const addCommand = readTrimmed('SEEDBOX_SSH_ADD_COMMAND');

  // Host, user, a key, and at least one delivery mode are all required.
  if (!host || !user) return null;
  if (!privateKey && !privateKeyPath) return null;
  if (!watchDir && !addCommand) return null;

  const portRaw = readTrimmed('SEEDBOX_SSH_PORT');
  const port = portRaw ? Number.parseInt(portRaw, 10) : 22;

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 22,
    user,
    privateKey,
    privateKeyPath,
    watchDir,
    addCommand,
  };
}

export function getSeedboxConfig(): SeedboxConfig {
  return {
    allowedEmails: parseAllowedEmails(readTrimmed('SEEDBOX_ALLOWED_EMAILS')),
    http: readHttpConfig(),
    ssh: readSshConfig(),
  };
}

/** Which transports are usable given the current config. */
export function availableTransports(config: SeedboxConfig): SeedboxTransport[] {
  const transports: SeedboxTransport[] = [];
  if (config.http) transports.push('http');
  if (config.ssh) transports.push('ssh');
  return transports;
}

/** Is the given email allowed to use the seedbox feature? */
export function isEmailAllowed(config: SeedboxConfig, email: string | null | undefined): boolean {
  if (!email) return false;
  if (config.allowedEmails.length === 0) return false; // fail closed
  return config.allowedEmails.includes(email.trim().toLowerCase());
}
