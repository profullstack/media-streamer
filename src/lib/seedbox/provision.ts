/**
 * Torlink provisioner.
 *
 * Given an account's SSH-connected seedbox, install the `torlnk` CLI
 * (`npm i -g torlnk`), start its HTTP add-API (`serve`, :9161) and file server
 * (`files`, :9160) as daemons bound to a generated bearer token, and open those
 * ports in the box's firewall. On success the caller wires the resulting HTTP +
 * files endpoints into the account's seedbox config so the app can use them.
 *
 * The remote work runs as a single idempotent bash script fed to `bash -s` over
 * SSH (see {@link execRemote}). The script emits `STEP|name|status|detail` lines
 * and a final `RESULT|ok|fail` line, which we parse into structured steps.
 */

import { randomBytes } from 'node:crypto';

import type { SeedboxSshConfig } from './config';
import { execRemote } from './ssh-transport';

export const DEFAULT_SERVE_PORT = 9161;
export const DEFAULT_FILES_PORT = 9160;

export interface ProvisionStep {
  name: string;
  status: 'ok' | 'fail' | 'skip';
  detail: string;
}

export interface ProvisionResult {
  ok: boolean;
  steps: ProvisionStep[];
  token: string | null;
  servePort: number;
  filesPort: number;
  /** Raw combined stdout, for debugging when parsing finds nothing. */
  raw: string;
}

/** Generate a URL-safe bearer token for the seedbox HTTP/files servers. */
export function generateSeedboxToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Build the remote provisioning script. Values are injected as shell variables;
 * the token is base64url (shell-safe) and ports are validated integers.
 */
export function buildProvisionScript(token: string, servePort: number, filesPort: number): string {
  return `set -u
TOK='${token}'
SERVE_PORT='${servePort}'
FILES_PORT='${filesPort}'
emit(){ echo "STEP|$1|$2|$3"; }

# --- Node.js (torlnk needs >=22) — install latest LTS via mise if missing/old ---
export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
else
  NODE_MAJOR=0
fi
if [ "\${NODE_MAJOR:-0}" -lt 22 ]; then
  if ! command -v mise >/dev/null 2>&1; then
    if curl -fsSL https://mise.run | sh >/tmp/mise-install.log 2>&1; then
      export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
      emit mise ok "installed mise"
    else
      emit mise fail "could not install mise: $(tail -n 3 /tmp/mise-install.log 2>/dev/null | tr '\\n' ' ')"
      echo "RESULT|fail"; exit 0
    fi
  fi
  MISE=$(command -v mise 2>/dev/null || echo "$HOME/.local/bin/mise")
  if "$MISE" use -g node@lts >/tmp/mise-node.log 2>&1; then
    "$MISE" reshim >/dev/null 2>&1 || true
    export PATH="$HOME/.local/share/mise/shims:$PATH"
    hash -r 2>/dev/null || true
    emit node ok "installed Node $(node -v 2>/dev/null || echo lts) via mise (node@lts)"
  else
    emit node fail "mise could not install node@lts: $(tail -n 3 /tmp/mise-node.log 2>/dev/null | tr '\\n' ' ')"
    echo "RESULT|fail"; exit 0
  fi
else
  emit node ok "$(node -v)"
fi

# --- install torlnk (try user-global, fall back to sudo) ---
if npm i -g torlnk >/tmp/torlnk-install.log 2>&1; then
  emit install ok "npm i -g torlnk"
elif command -v sudo >/dev/null 2>&1 && sudo -n npm i -g torlnk >>/tmp/torlnk-install.log 2>&1; then
  emit install ok "npm i -g torlnk (sudo)"
else
  emit install fail "$(tail -n 3 /tmp/torlnk-install.log 2>/dev/null | tr '\\n' ' ')"
  echo "RESULT|fail"; exit 0
fi

command -v mise >/dev/null 2>&1 && mise reshim >/dev/null 2>&1 || true
BIN=$(command -v torlnk 2>/dev/null || true)
if [ -z "\${BIN:-}" ]; then BIN="$(npm prefix -g 2>/dev/null)/bin/torlnk"; fi
if [ ! -x "$BIN" ]; then
  emit install fail "torlnk installed but binary not found on PATH ($BIN)"
  echo "RESULT|fail"; exit 0
fi

# --- data dir + restart daemons (idempotent) ---
DATA="$HOME/torlnk/downloads"
mkdir -p "$DATA"
pkill -f 'torlnk serve' 2>/dev/null || true
pkill -f 'torlnk files' 2>/dev/null || true
sleep 1

export TORLINK_API_TOKEN="$TOK"
export TORLINK_FILES_TOKEN="$TOK"
if "$BIN" serve --host 0.0.0.0 --port "$SERVE_PORT" --token "$TOK" --to "$DATA" --daemon >/tmp/torlnk-serve.log 2>&1; then
  emit serve ok "add-API listening on $SERVE_PORT (downloads: $DATA)"
else
  emit serve fail "$(tail -n 3 /tmp/torlnk-serve.log 2>/dev/null | tr '\\n' ' ')"
fi
if "$BIN" files --host 0.0.0.0 --port "$FILES_PORT" --token "$TOK" --dir "$DATA" --daemon >/tmp/torlnk-files.log 2>&1; then
  emit files ok "file server listening on $FILES_PORT"
else
  emit files fail "$(tail -n 3 /tmp/torlnk-files.log 2>/dev/null | tr '\\n' ' ')"
fi

# --- open firewall ports ---
if command -v ufw >/dev/null 2>&1 && sudo -n ufw status >/dev/null 2>&1; then
  sudo -n ufw allow "$SERVE_PORT"/tcp >/dev/null 2>&1 || true
  sudo -n ufw allow "$FILES_PORT"/tcp >/dev/null 2>&1 || true
  emit ports ok "ufw: opened $SERVE_PORT/tcp and $FILES_PORT/tcp"
elif command -v firewall-cmd >/dev/null 2>&1 && sudo -n firewall-cmd --state >/dev/null 2>&1; then
  sudo -n firewall-cmd --permanent --add-port="$SERVE_PORT"/tcp >/dev/null 2>&1 || true
  sudo -n firewall-cmd --permanent --add-port="$FILES_PORT"/tcp >/dev/null 2>&1 || true
  sudo -n firewall-cmd --reload >/dev/null 2>&1 || true
  emit ports ok "firewalld: opened $SERVE_PORT/tcp and $FILES_PORT/tcp"
else
  emit ports skip "no ufw/firewalld with passwordless sudo; open $SERVE_PORT and $FILES_PORT manually (incl. any cloud firewall)"
fi

# --- health check ---
sleep 2
if curl -fsS "http://127.0.0.1:$SERVE_PORT/health" >/tmp/torlnk-health 2>/dev/null; then
  emit health ok "$(cat /tmp/torlnk-health 2>/dev/null | tr '\\n' ' ')"
else
  emit health fail "serve did not answer /health yet — check /tmp/torlnk-serve.log on the box"
fi
echo "RESULT|ok"
`;
}

export function parseSteps(stdout: string): { steps: ProvisionStep[]; result: 'ok' | 'fail' | null } {
  const steps: ProvisionStep[] = [];
  let result: 'ok' | 'fail' | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('STEP|')) {
      const [, name = '', status = '', ...rest] = line.split('|');
      const s = status === 'ok' || status === 'fail' || status === 'skip' ? status : 'fail';
      steps.push({ name, status: s, detail: rest.join('|').trim() });
    } else if (line.startsWith('RESULT|')) {
      result = line.slice('RESULT|'.length).trim() === 'ok' ? 'ok' : 'fail';
    }
  }
  return { steps, result };
}

/**
 * Install + start torlink on the account's SSH-connected seedbox and open its
 * ports. Returns structured per-step results and the generated bearer token.
 * "ok" means torlink installed and the `serve` add-API came up (the port-open
 * step may still be a skip if there's no manageable firewall).
 */
export async function provisionTorlink(
  ssh: SeedboxSshConfig,
  options: { token?: string; servePort?: number; filesPort?: number } = {}
): Promise<ProvisionResult> {
  const token = options.token ?? generateSeedboxToken();
  const servePort = options.servePort ?? DEFAULT_SERVE_PORT;
  const filesPort = options.filesPort ?? DEFAULT_FILES_PORT;
  const script = buildProvisionScript(token, servePort, filesPort);

  let raw = '';
  try {
    // mise + Node install and the global npm install can take a while — allow up to 5 minutes.
    const { stdout, stderr } = await execRemote(ssh, { input: script, timeoutMs: 300_000 });
    raw = `${stdout}\n${stderr}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      steps: [{ name: 'ssh', status: 'fail', detail: `Could not run provisioning over SSH: ${detail}` }],
      token: null,
      servePort,
      filesPort,
      raw: detail,
    };
  }

  const { steps, result } = parseSteps(raw);
  const serveOk = steps.some((s) => s.name === 'serve' && s.status === 'ok');
  const ok = result === 'ok' && serveOk;
  return { ok, steps, token: ok ? token : null, servePort, filesPort, raw };
}
