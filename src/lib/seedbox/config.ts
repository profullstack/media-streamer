/**
 * Seedbox transport configuration.
 *
 * A seedbox connection is configured PER ACCOUNT (the master account connects
 * their own seedbox in Settings; it's then shared to every profile under that
 * account). Two transports hand a torrent off to the seedbox:
 *
 *   - HTTP:  POST the magnet to a torrent-client API (e.g. torlink) using a
 *            bearer token or a custom header.
 *   - SSH:   either drop a `.magnet` file into a watch/blackhole directory the
 *            client monitors, or run a configurable add-command on the box.
 *
 * Plus an optional files server for streaming completed files back for playback.
 *
 * These builders are pure — they turn already-resolved values (from the DB row,
 * with secrets decrypted) into a validated `SeedboxConfig`, keeping only the
 * transports that are fully specified. The feature is available to an account
 * exactly when {@link hasSeedbox} is true for its resolved config.
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

/** How the file-streaming proxy authenticates against the seedbox file server. */
export type SeedboxFilesAuth =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'header'; header: string; token: string }
  | { kind: 'basic'; user: string; pass: string };

export interface SeedboxFilesConfig {
  /** HTTP root that maps to the seedbox save directory (files live at base + '/' + file.path). */
  baseUrl: string;
  auth: SeedboxFilesAuth;
}

export interface SeedboxConfig {
  http: SeedboxHttpConfig | null;
  ssh: SeedboxSshConfig | null;
  files: SeedboxFilesConfig | null;
}

/** A config with nothing configured (no transports, no files). */
export function emptySeedboxConfig(): SeedboxConfig {
  return { http: null, ssh: null, files: null };
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse an HTTP-auth spec: 'bearer' | 'header:X-Header-Name'. */
export function parseHttpAuth(raw: string | null | undefined): SeedboxHttpAuth {
  if (!raw || raw.toLowerCase() === 'bearer') return { kind: 'bearer' };
  const match = /^header:(.+)$/i.exec(raw);
  if (match) {
    const header = match[1].trim();
    if (header.length > 0) return { kind: 'header', header };
  }
  // Unrecognized value — fall back to bearer rather than silently mis-authing.
  return { kind: 'bearer' };
}

export interface HttpConfigValues {
  baseUrl?: string | null;
  token?: string | null;
  addPath?: string | null;
  auth?: string | null;
  magnetField?: string | null;
}

export function buildHttpConfig(values: HttpConfigValues): SeedboxHttpConfig | null {
  const baseUrl = trimOrNull(values.baseUrl);
  const token = trimOrNull(values.token);
  // Both are required for the HTTP transport to be usable.
  if (!baseUrl || !token) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token,
    // Default matches `torlnk serve` (POST /add {"magnet":"..."}); override for other clients.
    addPath: trimOrNull(values.addPath) ?? '/add',
    auth: parseHttpAuth(trimOrNull(values.auth)),
    magnetField: trimOrNull(values.magnetField) ?? 'magnet',
  };
}

export interface SshConfigValues {
  host?: string | null;
  port?: number | string | null;
  user?: string | null;
  privateKey?: string | null;
  privateKeyPath?: string | null;
  watchDir?: string | null;
  addCommand?: string | null;
}

export function buildSshConfig(values: SshConfigValues): SeedboxSshConfig | null {
  const host = trimOrNull(values.host);
  const user = trimOrNull(values.user);
  const privateKey = trimOrNull(values.privateKey);
  const privateKeyPath = trimOrNull(values.privateKeyPath);
  const watchDir = trimOrNull(values.watchDir);
  const addCommand = trimOrNull(values.addCommand);

  // Host, user, a key, and at least one delivery mode are all required.
  if (!host || !user) return null;
  if (!privateKey && !privateKeyPath) return null;
  if (!watchDir && !addCommand) return null;

  const portRaw = typeof values.port === 'number' ? values.port : trimOrNull(values.port ?? null);
  const port = typeof portRaw === 'number' ? portRaw : portRaw ? Number.parseInt(portRaw, 10) : 22;

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

export interface FilesConfigValues {
  baseUrl?: string | null;
  /** 'none' | 'bearer' | 'basic' | 'header:X-Header-Name'. */
  auth?: string | null;
  token?: string | null;
  basicUser?: string | null;
  basicPass?: string | null;
}

export function buildFilesAuth(values: FilesConfigValues): SeedboxFilesAuth {
  const raw = (trimOrNull(values.auth) ?? 'none').toLowerCase();
  if (raw === 'basic') {
    const user = trimOrNull(values.basicUser);
    const pass = trimOrNull(values.basicPass);
    if (user && pass) return { kind: 'basic', user, pass };
    return { kind: 'none' };
  }
  const token = trimOrNull(values.token);
  if (raw === 'bearer' && token) return { kind: 'bearer', token };
  const headerMatch = /^header:(.+)$/i.exec(raw);
  if (headerMatch && token) {
    const header = headerMatch[1].trim();
    if (header) return { kind: 'header', header, token };
  }
  return { kind: 'none' };
}

export function buildFilesConfig(values: FilesConfigValues): SeedboxFilesConfig | null {
  const baseUrl = trimOrNull(values.baseUrl);
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    auth: buildFilesAuth(values),
  };
}

/** Which transports are usable given the current config. */
export function availableTransports(config: SeedboxConfig): SeedboxTransport[] {
  const transports: SeedboxTransport[] = [];
  if (config.http) transports.push('http');
  if (config.ssh) transports.push('ssh');
  return transports;
}

/** Does this account have a usable seedbox (at least one transport, or a files server)? */
export function hasSeedbox(config: SeedboxConfig | null | undefined): config is SeedboxConfig {
  if (!config) return false;
  return config.http != null || config.ssh != null || config.files != null;
}
