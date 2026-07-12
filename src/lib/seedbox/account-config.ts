/**
 * Per-account seedbox configuration store.
 *
 * The master account connects its own seedbox in Settings; the resolved config
 * is shared to every profile under that account. Secrets (HTTP/files tokens, the
 * SSH private key, basic-auth password) are AES-256-GCM encrypted at rest via
 * {@link module:seedbox/crypto} and never leave the server.
 *
 * `load*` turns a stored row (secrets decrypted) into a validated `SeedboxConfig`
 * for the transports/routes; `getSummary` returns a secret-free view for the UI.
 */

import { createServerClient } from '@/lib/supabase';
import {
  buildFilesConfig,
  buildHttpConfig,
  buildSshConfig,
  emptySeedboxConfig,
  type SeedboxConfig,
} from './config';
import { decryptOptional, encryptOptional } from './crypto';

const TABLE = 'account_seedbox_configs';

/** Plaintext input from the settings form. Secret fields are optional on update
 * (empty string / undefined = leave the stored secret unchanged). */
export interface SeedboxConfigInput {
  http?: {
    baseUrl?: string | null;
    token?: string | null; // secret
    addPath?: string | null;
    auth?: string | null;
    magnetField?: string | null;
  };
  ssh?: {
    host?: string | null;
    port?: number | null;
    user?: string | null;
    privateKey?: string | null; // secret
    watchDir?: string | null;
    addCommand?: string | null;
  };
  files?: {
    baseUrl?: string | null;
    auth?: string | null;
    token?: string | null; // secret
    basicUser?: string | null;
    basicPass?: string | null; // secret
  };
}

/** Secret-free description of what an account has configured (for the UI). */
export interface SeedboxConfigSummary {
  configured: boolean;
  http: {
    baseUrl: string | null;
    hasToken: boolean;
    addPath: string | null;
    auth: string | null;
    magnetField: string | null;
    ready: boolean;
  };
  ssh: {
    host: string | null;
    port: number | null;
    user: string | null;
    hasPrivateKey: boolean;
    watchDir: string | null;
    addCommand: string | null;
    ready: boolean;
  };
  files: {
    baseUrl: string | null;
    auth: string | null;
    hasToken: boolean;
    basicUser: string | null;
    hasBasicPass: boolean;
    ready: boolean;
  };
}

type SeedboxRow = {
  account_id: string;
  http_base_url: string | null;
  http_token_encrypted: string | null;
  http_add_path: string | null;
  http_auth: string | null;
  http_magnet_field: string | null;
  ssh_host: string | null;
  ssh_port: number | null;
  ssh_user: string | null;
  ssh_private_key_encrypted: string | null;
  ssh_watch_dir: string | null;
  ssh_add_command: string | null;
  files_base_url: string | null;
  files_auth: string | null;
  files_token_encrypted: string | null;
  files_basic_user: string | null;
  files_basic_pass_encrypted: string | null;
};

async function fetchRow(accountId: string): Promise<SeedboxRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load seedbox config: ${error.message}`);
  }
  return (data as SeedboxRow | null) ?? null;
}

/**
 * Resolve the account's seedbox config with secrets decrypted, ready for the
 * transports. Returns null when the account has connected nothing.
 */
export async function loadAccountSeedboxConfig(accountId: string): Promise<SeedboxConfig | null> {
  const row = await fetchRow(accountId);
  if (!row) return null;

  const config: SeedboxConfig = {
    http: buildHttpConfig({
      baseUrl: row.http_base_url,
      token: decryptOptional(row.http_token_encrypted),
      addPath: row.http_add_path,
      auth: row.http_auth,
      magnetField: row.http_magnet_field,
    }),
    ssh: buildSshConfig({
      host: row.ssh_host,
      port: row.ssh_port,
      user: row.ssh_user,
      privateKey: decryptOptional(row.ssh_private_key_encrypted),
      watchDir: row.ssh_watch_dir,
      addCommand: row.ssh_add_command,
    }),
    files: buildFilesConfig({
      baseUrl: row.files_base_url,
      auth: row.files_auth,
      token: decryptOptional(row.files_token_encrypted),
      basicUser: row.files_basic_user,
      basicPass: decryptOptional(row.files_basic_pass_encrypted),
    }),
  };
  return config;
}

/** Secret-free summary for rendering the settings form (no plaintext ever). */
export async function getSeedboxConfigSummary(accountId: string): Promise<SeedboxConfigSummary> {
  const row = await fetchRow(accountId);
  const empty = emptySeedboxConfig();
  if (!row) {
    return {
      configured: false,
      http: { baseUrl: null, hasToken: false, addPath: null, auth: null, magnetField: null, ready: false },
      ssh: { host: null, port: null, user: null, hasPrivateKey: false, watchDir: null, addCommand: null, ready: false },
      files: { baseUrl: null, auth: null, hasToken: false, basicUser: null, hasBasicPass: false, ready: false },
    };
  }

  // Reuse the builders to compute "ready" (fully-specified) per transport.
  const http = buildHttpConfig({
    baseUrl: row.http_base_url,
    token: row.http_token_encrypted, // presence is enough for readiness
    addPath: row.http_add_path,
    auth: row.http_auth,
    magnetField: row.http_magnet_field,
  });
  const ssh = buildSshConfig({
    host: row.ssh_host,
    port: row.ssh_port,
    user: row.ssh_user,
    privateKey: row.ssh_private_key_encrypted,
    watchDir: row.ssh_watch_dir,
    addCommand: row.ssh_add_command,
  });
  const files = buildFilesConfig({
    baseUrl: row.files_base_url,
    auth: row.files_auth,
    token: row.files_token_encrypted,
    basicUser: row.files_basic_user,
    basicPass: row.files_basic_pass_encrypted,
  });
  void empty;

  return {
    configured: http != null || ssh != null || files != null,
    http: {
      baseUrl: row.http_base_url,
      hasToken: Boolean(row.http_token_encrypted),
      addPath: row.http_add_path,
      auth: row.http_auth,
      magnetField: row.http_magnet_field,
      ready: http != null,
    },
    ssh: {
      host: row.ssh_host,
      port: row.ssh_port,
      user: row.ssh_user,
      hasPrivateKey: Boolean(row.ssh_private_key_encrypted),
      watchDir: row.ssh_watch_dir,
      addCommand: row.ssh_add_command,
      ready: ssh != null,
    },
    files: {
      baseUrl: row.files_base_url,
      auth: row.files_auth,
      hasToken: Boolean(row.files_token_encrypted),
      basicUser: row.files_basic_user,
      hasBasicPass: Boolean(row.files_basic_pass_encrypted),
      ready: files != null,
    },
  };
}

/** Choose the new encrypted secret: re-encrypt a provided plaintext, or keep the
 * existing stored value when the field was left blank/undefined. */
function nextSecret(incoming: string | null | undefined, existing: string | null): string | null {
  if (incoming === undefined) return existing; // field not sent → unchanged
  const trimmed = (incoming ?? '').trim();
  if (trimmed.length === 0) return existing; // blank → keep existing secret
  return encryptOptional(trimmed);
}

/**
 * Upsert the account's seedbox config. Secret fields left blank/undefined keep
 * their previously-stored (encrypted) value, so the UI never has to round-trip
 * secrets back to the client.
 */
export async function saveAccountSeedboxConfig(
  accountId: string,
  input: SeedboxConfigInput
): Promise<SeedboxConfigSummary> {
  const existing = await fetchRow(accountId);
  const supabase = createServerClient();

  const record = {
    account_id: accountId,
    http_base_url: input.http?.baseUrl?.trim() || null,
    http_token_encrypted: nextSecret(input.http?.token, existing?.http_token_encrypted ?? null),
    http_add_path: input.http?.addPath?.trim() || null,
    http_auth: input.http?.auth?.trim() || null,
    http_magnet_field: input.http?.magnetField?.trim() || null,
    ssh_host: input.ssh?.host?.trim() || null,
    ssh_port: input.ssh?.port ?? null,
    ssh_user: input.ssh?.user?.trim() || null,
    ssh_private_key_encrypted: nextSecret(input.ssh?.privateKey, existing?.ssh_private_key_encrypted ?? null),
    ssh_watch_dir: input.ssh?.watchDir?.trim() || null,
    ssh_add_command: input.ssh?.addCommand?.trim() || null,
    files_base_url: input.files?.baseUrl?.trim() || null,
    files_auth: input.files?.auth?.trim() || null,
    files_token_encrypted: nextSecret(input.files?.token, existing?.files_token_encrypted ?? null),
    files_basic_user: input.files?.basicUser?.trim() || null,
    files_basic_pass_encrypted: nextSecret(input.files?.basicPass, existing?.files_basic_pass_encrypted ?? null),
  };

  const { error } = await supabase.from(TABLE).upsert(record, { onConflict: 'account_id' });
  if (error) {
    throw new Error(`Failed to save seedbox config: ${error.message}`);
  }
  return getSeedboxConfigSummary(accountId);
}

/** Disconnect the account's seedbox entirely. */
export async function deleteAccountSeedboxConfig(accountId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from(TABLE).delete().eq('account_id', accountId);
  if (error) {
    throw new Error(`Failed to delete seedbox config: ${error.message}`);
  }
}
