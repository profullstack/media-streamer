/**
 * Seedbox send dispatcher + access resolution.
 */

import {
  availableTransports,
  type SeedboxConfig,
  type SeedboxTransport,
} from './config';
import { sendMagnetViaHttp, type SendResult } from './http-transport';
import { getSeedboxPublicKey, sendMagnetViaSsh } from './ssh-transport';

export interface SeedboxAccess {
  /** True when this account may push to a configured seedbox transport. */
  enabled: boolean;
  transports: SeedboxTransport[];
  /** The public key derived from the account's SSH key, for reference (SSH transport only). */
  publicKey: string | null;
  /** True when a seedbox file server is configured, so playback-from-seedbox is available. */
  filesConfigured: boolean;
}

/**
 * Resolve what the account can do with its configured seedbox: which transports
 * are usable, and (for SSH) the public key derived from the stored private key.
 * `config` is the account's own resolved config (null when nothing is connected).
 */
export async function getSeedboxAccess(
  config: SeedboxConfig | null | undefined
): Promise<SeedboxAccess> {
  if (!config) {
    return { enabled: false, transports: [], publicKey: null, filesConfigured: false };
  }
  const transports = availableTransports(config);
  const publicKey = config.ssh ? await getSeedboxPublicKey(config.ssh) : null;
  return {
    enabled: transports.length > 0,
    transports,
    publicKey,
    filesConfigured: config.files != null,
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
  config: SeedboxConfig
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
