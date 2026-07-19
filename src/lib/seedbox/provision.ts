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
export function buildProvisionScript(
  token: string,
  servePort: number,
  filesPort: number,
  dataDir?: string,
  seedTimeHours: number = 2
): string {
  // Where torlnk saves downloads (serve --to) and serves files from (files --dir).
  // Injected single-quoted; a leading ~ is expanded to $HOME on the box.
  const dataDirLine = dataDir
    ? `DATA='${dataDir.replace(/'/g, `'\\''`)}'\nDATA="\${DATA/#\\~/$HOME}"`
    : `DATA="$HOME/Downloads/done"`;
  // torlink's own --seed-time stops seeding a torrent after this window but KEEPS
  // its files on disk (we deliberately omit --delete-files). 0 = seed forever.
  const seedHours = Number.isFinite(seedTimeHours) && seedTimeHours >= 0 ? Math.floor(seedTimeHours) : 2;
  const seedFlag = seedHours > 0 ? `--seed-time ${seedHours}h ` : '';
  const seedDesc = seedHours > 0 ? `stops seeding after ${seedHours}h, keeps files` : 'seeds indefinitely (no time limit)';
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

# --- install torlink (profullstack fork w/ TORLINK_MAX_DOWNLOADS cap; ships the
#     same 'torlnk' binary — switch back to official 'torlnk' once baairon#102
#     is merged + published). Remove the official pkg first to avoid a bin clash.
PKG='@profullstack/torlink'
(npm rm -g torlnk >/dev/null 2>&1 || sudo -n npm rm -g torlnk >/dev/null 2>&1) || true
if npm i -g "$PKG" >/tmp/torlnk-install.log 2>&1; then
  emit install ok "npm i -g $PKG"
elif command -v sudo >/dev/null 2>&1 && sudo -n npm i -g "$PKG" >>/tmp/torlnk-install.log 2>&1; then
  emit install ok "npm i -g $PKG (sudo)"
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

# --- data dirs + fully-automatic daemon (re)start (no manual steps) ---
${dataDirLine}
WATCH="$HOME/Downloads/watch"
mkdir -p "$WATCH" "$DATA"

# Stop ANY existing torlink daemon so our fresh token becomes authoritative —
# however it was started (detached process, systemd system/user unit, or pm2) —
# then free the ports by PID with whatever tool exists. Match broadly because
# the real cmdline is like "node .../torlnk/dist/cli.js serve", so
# \`pkill -f 'torlnk serve'\` misses it.
stop_torlink(){
  # Match both spellings: the npm bin ("torlnk") and a local checkout ("torlink").
  pkill -f 'torli?nk' 2>/dev/null || sudo -n pkill -f 'torli?nk' 2>/dev/null || true
  local U
  for U in $(systemctl list-units --type=service --no-legend 2>/dev/null | grep -i torl | awk '{print $1}'); do
    sudo -n systemctl stop "$U" 2>/dev/null || true
  done
  for U in $(systemctl --user list-units --type=service --no-legend 2>/dev/null | grep -i torl | awk '{print $1}'); do
    systemctl --user stop "$U" 2>/dev/null || true
  done
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete $(pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*torl[^"]*"' | cut -d'"' -f4) >/dev/null 2>&1 || true
  fi
}
free_port(){
  local SIG="$1" P="$2" PIDS PID
  PIDS=$( { command -v fuser >/dev/null 2>&1 && fuser "$P"/tcp 2>/dev/null; }
          { command -v lsof  >/dev/null 2>&1 && lsof -ti tcp:"$P" 2>/dev/null; }
          { command -v ss    >/dev/null 2>&1 && ss -tlnpH "sport = :$P" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2; } )
  for PID in $(printf '%s\\n' $PIDS | sort -u); do
    kill "$SIG" "$PID" 2>/dev/null || sudo -n kill "$SIG" "$PID" 2>/dev/null || true
  done
}
stop_torlink
free_port -TERM "$SERVE_PORT"; free_port -TERM "$FILES_PORT"
sleep 2
free_port -KILL "$SERVE_PORT"; free_port -KILL "$FILES_PORT"
sleep 1

export TORLINK_API_TOKEN="$TOK"
export TORLINK_FILES_TOKEN="$TOK"
# Cap concurrent downloads so each active torrent gets fair bandwidth on a
# limited seedbox line (torlink >= the version with TORLINK_MAX_DOWNLOADS;
# harmlessly ignored by older builds).
export TORLINK_MAX_DOWNLOADS=2
if "$BIN" serve --host 0.0.0.0 --port "$SERVE_PORT" --token "$TOK" --to "$DATA" ${seedFlag}--daemon >/tmp/torlnk-serve.log 2>&1; then
  emit serve ok "add-API on $SERVE_PORT (downloads: $DATA; ${seedDesc})"
else
  emit serve fail "$(tail -n 3 /tmp/torlnk-serve.log 2>/dev/null | tr '\\n' ' ')"
fi
if "$BIN" files --host 0.0.0.0 --port "$FILES_PORT" --token "$TOK" --dir "$DATA" --daemon >/tmp/torlnk-files.log 2>&1; then
  emit files ok "file server on $FILES_PORT (serving: $DATA)"
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

# --- verify the freshly-generated token is the one actually answering ---
AUTHCODE=$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H "Authorization: Bearer $TOK" "http://127.0.0.1:$FILES_PORT/" 2>/dev/null || echo 000)
if [ "$AUTHCODE" = "401" ] || [ "$AUTHCODE" = "403" ]; then
  emit auth fail "file server still rejects the new token (HTTP $AUTHCODE) — a process supervisor keeps respawning an old torlink daemon on this port. Check 'systemctl'/'pm2' on the box for a torlink service and remove it, then retry."
elif [ "$AUTHCODE" = "000" ]; then
  emit auth skip "could not verify token locally (curl failed)"
else
  emit auth ok "token accepted (HTTP $AUTHCODE) — send + play are wired up"
fi

# --- limit the seeding window WITHOUT deleting files ---
# Seeding is time-limited by torlink's own --seed-time on the serve daemon above:
# each torrent stops seeding once past its window, but the downloaded files stay
# on disk (we don't pass --delete-files). Older installs shipped a cron that
# DELETED downloads after 6h — strip it so re-provisioning stops deleting files.
CRON_MARK="# torlink-autopurge-media-streamer"
if command -v crontab >/dev/null 2>&1 && crontab -l >/dev/null 2>&1 && crontab -l 2>/dev/null | grep -qF "$CRON_MARK"; then
  if crontab -l 2>/dev/null | grep -vF "$CRON_MARK" | crontab - 2>/dev/null; then
    emit cleanup ok "removed legacy delete-after-6h cron — now ${seedDesc}"
  else
    emit cleanup skip "run 'crontab -e' and delete the torlink-autopurge line so downloads stop being auto-deleted"
  fi
else
  emit cleanup ok "torlink ${seedDesc}"
fi

# --- keep torlink up to date automatically ---
# \`torlnk update\` checks npm for a newer release, installs it (npm i -g @latest)
# and restarts the serve/files daemons in place — each daemon relaunches from the
# argv recorded in its .run.json, so the token + --seed-time flags survive. Run
# it on a cron so the seedbox self-updates without re-provisioning; it's a no-op
# when already current, and bails gracefully if the global prefix isn't writable.
# cron has a bare PATH, so pin node + npm (same dir) + the global-bin dir.
NODE_BIN_DIR=$(dirname "$(command -v node 2>/dev/null)" 2>/dev/null)
GLOBAL_BIN_DIR=$(dirname "$BIN")
UPD_MARK="# torlink-autoupdate-media-streamer"
UPD_LINE="47 */6 * * * PATH=\\"$NODE_BIN_DIR:$GLOBAL_BIN_DIR:/usr/local/bin:/usr/bin:/bin\\" \\"$BIN\\" update >> \\"$HOME/.torlnk-update.log\\" 2>&1 $UPD_MARK"
if command -v crontab >/dev/null 2>&1; then
  if ( crontab -l 2>/dev/null | grep -vF "$UPD_MARK"; echo "$UPD_LINE" ) | crontab - 2>/dev/null; then
    emit autoupdate ok "torlnk update runs every 6h (self-installs new releases + restarts daemons)"
  else
    emit autoupdate skip "couldn't install the auto-update cron; run 'torlnk update' to upgrade manually"
  fi
else
  emit autoupdate skip "no crontab on the box; run 'torlnk update' to upgrade manually"
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
  options: { token?: string; servePort?: number; filesPort?: number; dataDir?: string; seedTimeHours?: number } = {}
): Promise<ProvisionResult> {
  const token = options.token ?? generateSeedboxToken();
  const servePort = options.servePort ?? DEFAULT_SERVE_PORT;
  const filesPort = options.filesPort ?? DEFAULT_FILES_PORT;
  const script = buildProvisionScript(token, servePort, filesPort, options.dataDir, options.seedTimeHours);

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
