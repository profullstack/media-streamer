/**
 * Seedbox send dispatcher + access resolution.
 */

import {
  availableTransports,
  getSeedboxConfig,
  isEmailAllowed,
  type SeedboxConfig,
  type SeedboxTransport,
} from './config';
import { sendMagnetViaHttp, type SendResult } from './http-transport';
import { getSeedboxPublicKey, sendMagnetViaSsh } from './ssh-transport';

export interface SeedboxAccess {
  /** True when this user may push to a fully-configured seedbox. */
  enabled: boolean;
  transports: SeedboxTransport[];
  /** Our public key to add to the seedbox's authorized_keys (SSH transport only). */
  publicKey: string | null;
  /** True when a seedbox file server is configured, so playback-from-seedbox is available. */
  filesConfigured: boolean;
}

/**
 * Resolve what the given user can do with the seedbox: which transports are
 * configured, and (for SSH) the public key they need to authorize.
 */
export async function getSeedboxAccess(
  email: string | null | undefined,
  config: SeedboxConfig = getSeedboxConfig()
): Promise<SeedboxAccess> {
  const allowed = isEmailAllowed(config, email);
  const transports = allowed ? availableTransports(config) : [];
  const publicKey = allowed && config.ssh ? await getSeedboxPublicKey(config.ssh) : null;
  return {
    enabled: allowed && transports.length > 0,
    transports,
    publicKey,
    filesConfigured: allowed && config.files != null,
  };
}

export function isValidMagnet(magnet: unknown): magnet is string {
  return typeof magnet === 'string' && /^magnet:\?/i.test(magnet.trim());
}

/**
 * Send a magnet to the seedbox over the chosen transport (or the only
 * configured one when `transport` is omitted).
 */
export async function sendTorrentToSeedbox(
  magnet: string,
  name: string,
  transport: SeedboxTransport | undefined,
  config: SeedboxConfig = getSeedboxConfig()
): Promise<SendResult> {
  const available = availableTransports(config);
  if (available.length === 0) {
    return { ok: false, transport: 'http', message: 'No seedbox transport is configured' };
  }

  const chosen = transport ?? available[0];
  if (!available.includes(chosen)) {
    return { ok: false, transport: chosen, message: `Seedbox transport "${chosen}" is not configured` };
  }

  if (chosen === 'http' && config.http) {
    return sendMagnetViaHttp(config.http, magnet, name);
  }
  if (chosen === 'ssh' && config.ssh) {
    return sendMagnetViaSsh(config.ssh, magnet, name);
  }
  return { ok: false, transport: chosen, message: `Seedbox transport "${chosen}" is not configured` };
}
