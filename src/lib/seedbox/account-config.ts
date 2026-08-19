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
  /** What the owner calls this box. Only used when creating or renaming. */
  name?: string;
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
  /** null only in the empty summary returned for an account with no seedboxes. */
  id: string | null;
  name: string | null;
  isDefault: boolean;
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
  id: string;
  account_id: string;
  name: string | null;
  is_default: boolean;
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

/**
 * One of the account's seedboxes.
 *
 * Naming an id also scopes the query by account_id, so an id belonging to someone
 * else reads as "not found" rather than as somebody else's box. Without an id this
 * resolves the default, which is what every caller that predates multiple
 * seedboxes wants.
 *
 * The fallback to the oldest row matters: an account can only lose its default
 * through a delete that failed to promote a successor, and silently returning
 * nothing there would look exactly like a disconnected seedbox.
 */
async function fetchRow(accountId: string, seedboxId?: string): Promise<SeedboxRow | null> {
  const supabase = createServerClient();

  if (seedboxId) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('account_id', accountId)
      .eq('id', seedboxId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load seedbox config: ${error.message}`);
    return (data as SeedboxRow | null) ?? null;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('account_id', accountId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(`Failed to load seedbox config: ${error.message}`);
  return ((data as SeedboxRow[] | null) ?? [])[0] ?? null;
}

/** Every seedbox on the account, default first then oldest. */
async function fetchRows(accountId: string): Promise<SeedboxRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('account_id', accountId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list seedbox configs: ${error.message}`);
  return (data as SeedboxRow[] | null) ?? [];
}

/**
 * Resolve the account's seedbox config with secrets decrypted, ready for the
 * transports. Returns null when the account has connected nothing.
 */
export async function loadAccountSeedboxConfig(accountId: string): Promise<SeedboxConfig | null> {
  return buildConfig(await fetchRow(accountId));
}

/** Decrypt one stored row into the config the transports consume. */
function buildConfig(row: SeedboxRow | null): SeedboxConfig | null {
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
export async function getSeedboxConfigSummary(
  accountId: string,
  seedboxId?: string
): Promise<SeedboxConfigSummary> {
  const row = await fetchRow(accountId, seedboxId);
  return summarise(row);
}

/** The summary shape for an account (or a seedbox) that has nothing configured. */
function emptySummary(): SeedboxConfigSummary {
  return {
      id: null,
      name: null,
      isDefault: false,
      configured: false,
      http: { baseUrl: null, hasToken: false, addPath: null, auth: null, magnetField: null, ready: false },
      ssh: { host: null, port: null, user: null, hasPrivateKey: false, watchDir: null, addCommand: null, ready: false },
      files: { baseUrl: null, auth: null, hasToken: false, basicUser: null, hasBasicPass: false, ready: false },
  };
}

/** Secret-free view of one stored row. */
function summarise(row: SeedboxRow | null): SeedboxConfigSummary {
  const empty = emptySeedboxConfig();
  if (!row) return emptySummary();

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
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
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
  input: SeedboxConfigInput,
  seedboxId?: string
): Promise<SeedboxConfigSummary> {
  const existing = await fetchRow(accountId, seedboxId);
  if (seedboxId && !existing) {
    throw new Error('That seedbox does not exist on this account');
  }
  const supabase = createServerClient();

  // A section (http/ssh/files) that is omitted entirely from the input is left
  // untouched — so a partial save (e.g. the torlink provisioner setting only
  // http+files) never clobbers the account's other transports. The settings
  // form always sends all three sections, so its clear-a-field behavior stands.
  const http = input.http
    ? {
        http_base_url: input.http.baseUrl?.trim() || null,
        http_token_encrypted: nextSecret(input.http.token, existing?.http_token_encrypted ?? null),
        http_add_path: input.http.addPath?.trim() || null,
        http_auth: input.http.auth?.trim() || null,
        http_magnet_field: input.http.magnetField?.trim() || null,
      }
    : {
        http_base_url: existing?.http_base_url ?? null,
        http_token_encrypted: existing?.http_token_encrypted ?? null,
        http_add_path: existing?.http_add_path ?? null,
        http_auth: existing?.http_auth ?? null,
        http_magnet_field: existing?.http_magnet_field ?? null,
      };

  const ssh = input.ssh
    ? {
        ssh_host: input.ssh.host?.trim() || null,
        ssh_port: input.ssh.port ?? null,
        ssh_user: input.ssh.user?.trim() || null,
        ssh_private_key_encrypted: nextSecret(input.ssh.privateKey, existing?.ssh_private_key_encrypted ?? null),
        ssh_watch_dir: input.ssh.watchDir?.trim() || null,
        ssh_add_command: input.ssh.addCommand?.trim() || null,
      }
    : {
        ssh_host: existing?.ssh_host ?? null,
        ssh_port: existing?.ssh_port ?? null,
        ssh_user: existing?.ssh_user ?? null,
        ssh_private_key_encrypted: existing?.ssh_private_key_encrypted ?? null,
        ssh_watch_dir: existing?.ssh_watch_dir ?? null,
        ssh_add_command: existing?.ssh_add_command ?? null,
      };

  const files = input.files
    ? {
        files_base_url: input.files.baseUrl?.trim() || null,
        files_auth: input.files.auth?.trim() || null,
        files_token_encrypted: nextSecret(input.files.token, existing?.files_token_encrypted ?? null),
        files_basic_user: input.files.basicUser?.trim() || null,
        files_basic_pass_encrypted: nextSecret(input.files.basicPass, existing?.files_basic_pass_encrypted ?? null),
      }
    : {
        files_base_url: existing?.files_base_url ?? null,
        files_auth: existing?.files_auth ?? null,
        files_token_encrypted: existing?.files_token_encrypted ?? null,
        files_basic_user: existing?.files_basic_user ?? null,
        files_basic_pass_encrypted: existing?.files_basic_pass_encrypted ?? null,
      };

  const fields = { ...http, ...ssh, ...files, ...(input.name ? { name: input.name.trim() } : {}) };

  // Update by row id, never upsert on account_id. Upserting on the account was
  // what made a second seedbox impossible -- saving one silently overwrote the
  // other, because they were the same row by definition.
  if (existing) {
    const { error } = await supabase.from(TABLE).update(fields).eq('id', existing.id);
    if (error) throw new Error(`Failed to save seedbox config: ${error.message}`);
    return getSeedboxConfigSummary(accountId, existing.id);
  }

  // Nothing stored yet, so this first box is the account's default.
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      account_id: accountId,
      name: input.name?.trim() || 'My seedbox',
      is_default: true,
      ...fields,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to save seedbox config: ${error.message}`);
  return getSeedboxConfigSummary(accountId, (data as { id: string }).id);
}

// ---------------------------------------------------------------------------
// Managing several
// ---------------------------------------------------------------------------

/** Every seedbox on the account, default first. Secret-free. */
export async function listSeedboxes(accountId: string): Promise<SeedboxConfigSummary[]> {
  return (await fetchRows(accountId)).map(summarise);
}

/** Load one specific seedbox, with secrets decrypted, for the transports. */
export async function loadSeedboxConfigById(
  accountId: string,
  seedboxId: string
): Promise<SeedboxConfig | null> {
  return buildConfig(await fetchRow(accountId, seedboxId));
}

/**
 * Add another seedbox.
 *
 * The first one an account adds becomes its default, so an account is never left
 * without one -- every code path that asks for "the seedbox" depends on that.
 */
export async function createSeedbox(
  accountId: string,
  input: SeedboxConfigInput
): Promise<SeedboxConfigSummary> {
  const supabase = createServerClient();
  const existing = await fetchRows(accountId);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      account_id: accountId,
      name: input.name?.trim() || `Seedbox ${existing.length + 1}`,
      is_default: existing.length === 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create seedbox: ${error.message}`);

  const id = (data as { id: string }).id;
  // Write the transports through the normal save path so secrets are encrypted
  // by exactly the same code that encrypts them on every later edit.
  return saveAccountSeedboxConfig(accountId, input, id);
}

/** Rename one. */
export async function renameSeedbox(
  accountId: string,
  seedboxId: string,
  name: string
): Promise<SeedboxConfigSummary> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from(TABLE)
    .update({ name: name.trim() || null })
    .eq('account_id', accountId)
    .eq('id', seedboxId);
  if (error) throw new Error(`Failed to rename seedbox: ${error.message}`);
  return getSeedboxConfigSummary(accountId, seedboxId);
}

/**
 * Make one the default.
 *
 * Clearing the old default first is required, not tidiness: a partial unique index
 * enforces one default per account, so setting the new one while the old still
 * holds the flag is a constraint violation.
 */
export async function setDefaultSeedbox(accountId: string, seedboxId: string): Promise<void> {
  const supabase = createServerClient();
  const target = await fetchRow(accountId, seedboxId);
  if (!target) throw new Error('That seedbox does not exist on this account');

  const cleared = await supabase
    .from(TABLE)
    .update({ is_default: false })
    .eq('account_id', accountId)
    .neq('id', seedboxId);
  if (cleared.error) throw new Error(`Failed to set default seedbox: ${cleared.error.message}`);

  const { error } = await supabase.from(TABLE).update({ is_default: true }).eq('id', seedboxId);
  if (error) throw new Error(`Failed to set default seedbox: ${error.message}`);
}

/**
 * Remove one, promoting a successor if it was the default.
 *
 * Leaving an account with seedboxes but no default would make every request that
 * does not name one fall through to the oldest row instead -- workable, but it
 * would silently change which box torrents land on.
 */
export async function deleteSeedbox(accountId: string, seedboxId: string): Promise<void> {
  const supabase = createServerClient();
  const target = await fetchRow(accountId, seedboxId);
  if (!target) return;

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('account_id', accountId)
    .eq('id', seedboxId);
  if (error) throw new Error(`Failed to delete seedbox: ${error.message}`);

  if (!target.is_default) return;
  const remaining = await fetchRows(accountId);
  if (remaining.length > 0) await setDefaultSeedbox(accountId, remaining[0].id);
}

/**
 * Remove EVERY seedbox on the account.
 *
 * Nothing calls this. It is kept for wiping an account wholesale, and is named to
 * be hard to reach for by accident: the thing you almost always want is
 * {@link deleteSeedbox}, which removes one box and promotes a successor. Deleting
 * a single box through here would take the account's other boxes with it.
 */
export async function deleteAccountSeedboxConfig(accountId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from(TABLE).delete().eq('account_id', accountId);
  if (error) {
    throw new Error(`Failed to delete seedbox config: ${error.message}`);
  }
}

/**
 * The seedbox a request is about: the one it names, or the account's default.
 *
 * Every per-box endpoint (test, status, control, cleanup, install) needs this
 * same choice, and getting it wrong is quiet -- the call succeeds against the
 * wrong machine.
 */
export async function loadSeedboxForRequest(
  accountId: string,
  seedboxId?: string | null
): Promise<SeedboxConfig | null> {
  return seedboxId
    ? loadSeedboxConfigById(accountId, seedboxId)
    : loadAccountSeedboxConfig(accountId);
}
