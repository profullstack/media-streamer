/**
 * Turn a request body into a SeedboxConfigInput.
 *
 * Shared by the single-seedbox route and the collection route so the two cannot
 * drift: a field parsed in one and dropped in the other would silently fail to
 * save on whichever path the UI happened not to exercise.
 *
 * `undefined` and empty string mean different things downstream -- undefined
 * leaves a stored secret alone, which is how the UI avoids ever round-tripping
 * secrets back to the client -- so non-strings become undefined rather than ''.
 */

import type { SeedboxConfigInput } from './account-config';

function asStringOrUndef(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asPortOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseSeedboxInput(body: Record<string, unknown>): SeedboxConfigInput {
  const http = (body.http ?? {}) as Record<string, unknown>;
  const ssh = (body.ssh ?? {}) as Record<string, unknown>;
  const files = (body.files ?? {}) as Record<string, unknown>;

  return {
    name: asStringOrUndef(body.name),
    http: {
      baseUrl: asStringOrUndef(http.baseUrl),
      token: asStringOrUndef(http.token),
      addPath: asStringOrUndef(http.addPath),
      auth: asStringOrUndef(http.auth),
      magnetField: asStringOrUndef(http.magnetField),
    },
    ssh: {
      host: asStringOrUndef(ssh.host),
      port: asPortOrNull(ssh.port),
      user: asStringOrUndef(ssh.user),
      privateKey: asStringOrUndef(ssh.privateKey),
      watchDir: asStringOrUndef(ssh.watchDir),
      addCommand: asStringOrUndef(ssh.addCommand),
    },
    files: {
      baseUrl: asStringOrUndef(files.baseUrl),
      auth: asStringOrUndef(files.auth),
      token: asStringOrUndef(files.token),
      basicUser: asStringOrUndef(files.basicUser),
      basicPass: asStringOrUndef(files.basicPass),
    },
  };
}
