/**
 * Torlink provisioner.
 *
 * Given an account's SSH-connected seedbox, install the `torlnk` CLI
 * (`npm i -g torlnk`), start its HTTP add-API (`serve`, :9161) and file server
 * (`files`, :9160) bound to a generated bearer token, and open those ports in
 * the box's firewall. On success the caller wires the resulting HTTP + files
 * endpoints into the account's seedbox config so the app can use them.
 *
 * The daemons run under systemd `--user` units with `Restart=always` and linger
 * enabled, so they survive crashes and reboots; a cron watchdog re-launches them
 * if the add-API stops answering (and covers boxes with no usable systemd
 * `--user`, which fall back to unsupervised `--daemon`). Without that, any crash
 * or reboot left the box permanently unreachable — the app could only report
 * ECONNREFUSED until someone re-ran this installer by hand.
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
# Pin @latest so an old cached global is actually upgraded (a bare name can be a
# no-op when something is already installed under that name).
(npm rm -g torlnk >/dev/null 2>&1 || sudo -n npm rm -g torlnk >/dev/null 2>&1) || true
if npm i -g "$PKG@latest" >/tmp/torlnk-install.log 2>&1; then
  emit install ok "npm i -g $PKG@latest"
elif command -v sudo >/dev/null 2>&1 && sudo -n npm i -g "$PKG@latest" >>/tmp/torlnk-install.log 2>&1; then
  emit install ok "npm i -g $PKG@latest (sudo)"
else
  emit install fail "$(tail -n 3 /tmp/torlnk-install.log 2>/dev/null | tr '\\n' ' ')"
  echo "RESULT|fail"; exit 0
fi

command -v mise >/dev/null 2>&1 && mise reshim >/dev/null 2>&1 || true

# CRITICAL: resolve the binary from the *global package* we just installed, NOT
# from \`command -v torlnk\`. A stale hand-rolled ~/.local/bin/torlnk wrapper (from
# an old manual checkout install) shadows the global bin on PATH and re-execs an
# ancient ~/torlink/dist/index.js that predates /control — so npm i -g "succeeds"
# but the daemon that runs is the old build. That is exactly the "older torlink
# without torrent controls" trap. Run the freshly-installed dist directly.
PKG_ROOT="$(npm root -g 2>/dev/null)/@profullstack/torlink"
CLI_JS="$PKG_ROOT/dist/cli.cjs"

# --- pin uint8-util, which crashes the daemon on every magnet ---
# uint8-util 2.3.x restructured the package and broke arr2hex. It is a
# TRANSITIVE dep of webtorrent on a caret range, so \`npm i -g\` silently
# resolves it to the broken release. The failure is brutal: torlink accepts the
# magnet (POST /add -> 200), starts fetching metadata, and then throws an
# UNCAUGHT TypeError inside webtorrent's parse path —
#
#   TypeError: The first argument must be of type string or ... Received undefined
#     at arr2hex (uint8-util/dist/src/node.js:12)
#     at Torrent._processParsedTorrent (webtorrent/lib/torrent.js:330)
#
# — which kills the whole process. systemd restarts it, the in-memory queue is
# gone with it, and the torrent has vanished. The app sees a 200 from /add and
# then never finds the torrent in /status. Observed on a live box: 28 crashes,
# one per send, with an empty queue.json throughout.
#
# Reinstalling never helped because the reinstall is what re-fetched the broken
# version. Upstream fixed this by pinning 2.2.6 (baairon/torlink 5293408); we
# apply the same pin here so the installer stops re-introducing the crash.
# Remove once the fork ships a release carrying that pin.
UINT8_PIN=2.2.6
if [ -d "$PKG_ROOT" ]; then
  UINT8_HAVE=$(node -p "require('$PKG_ROOT/node_modules/uint8-util/package.json').version" 2>/dev/null || echo none)
  if [ "$UINT8_HAVE" = "$UINT8_PIN" ]; then
    emit uint8 skip "uint8-util already pinned at $UINT8_PIN"
  elif (cd "$PKG_ROOT" && npm i "uint8-util@$UINT8_PIN" --no-save --silent >/tmp/torlnk-uint8.log 2>&1) \
    || (command -v sudo >/dev/null 2>&1 && cd "$PKG_ROOT" && sudo -n npm i "uint8-util@$UINT8_PIN" --no-save --silent >>/tmp/torlnk-uint8.log 2>&1); then
    emit uint8 ok "pinned uint8-util $UINT8_HAVE -> $UINT8_PIN (2.3.x crashes the daemon on every magnet)"
  else
    emit uint8 fail "could not pin uint8-util@$UINT8_PIN — the daemon will crash on each add: $(tail -n 2 /tmp/torlnk-uint8.log 2>/dev/null | tr '\\n' ' ')"
  fi
fi
# Neutralize a shadowing wrapper so interactive \`torlnk\` also gets the fresh build
# (harmless if it doesn't exist).
if [ -f "$HOME/.local/bin/torlnk" ] && ! grep -q "$PKG_ROOT" "$HOME/.local/bin/torlnk" 2>/dev/null; then
  printf '#!/usr/bin/env bash\nexec %s "%s" "$@"\n' "$(command -v node)" "$CLI_JS" > "$HOME/.local/bin/torlnk" 2>/dev/null || true
  chmod +x "$HOME/.local/bin/torlnk" 2>/dev/null || true
  emit shadow ok "repointed stale ~/.local/bin/torlnk wrapper at the global build"
fi
# Resolve a SINGLE executable path to the freshly-installed global build. Prefer
# the global npm bin symlink ("\$(npm prefix -g)/bin/torlnk" -> the package's
# cli.cjs) — it bypasses PATH (so a ~/.local/bin shadow can't win) yet stays one
# path, which the auto-update cron below needs (it does \`dirname "\$BIN"\` and runs
# \`"\$BIN" update\`).
GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin/torlnk"
if [ -x "$GLOBAL_BIN" ]; then
  BIN="$GLOBAL_BIN"
elif [ -f "$CLI_JS" ]; then
  BIN="$CLI_JS"                     # node-shebang'd; PATH has node via mise shims
elif command -v torlnk >/dev/null 2>&1; then
  BIN="$(command -v torlnk)"        # last resort
else
  BIN="$(npm prefix -g 2>/dev/null)/bin/torlnk"
fi
if [ ! -e "$BIN" ]; then
  emit install fail "torlnk installed but no runnable binary found (looked for $GLOBAL_BIN and $CLI_JS)"
  echo "RESULT|fail"; exit 0
fi

# --- data dirs + fully-automatic daemon (re)start (no manual steps) ---
${dataDirLine}
# NOTE: no watch dir is created. torlink's blackhole feature is a separate
# subcommand (\`torlnk watch <dir>\`) that this provisioner never started, so a
# watch dir here was only ever a place for magnets to rot unread. It also would
# not help: \`watch\` runs as its own process with its own queue, invisible to the
# \`serve\` /status that the status page and progress bars poll. SSH sends now go
# through serve's add-API over loopback instead (see sendMagnetViaSshToLocalApi).
mkdir -p "$DATA"

# Stop ANY existing torlink daemon so our fresh token becomes authoritative —
# however it was started (detached process, systemd system/user unit, or pm2) —
# then free the ports by PID with whatever tool exists. Match broadly because
# the real cmdline is like "node .../torlnk/dist/cli.js serve", so
# \`pkill -f 'torlnk serve'\` misses it.
stop_torlink(){
  # Order matters: tear down supervisors FIRST. Our own units set
  # Restart=always, so a pkill before the disable would just be undone five
  # seconds later and the resurrected daemon would hold the port against us.
  # Stop AND disable+remove any torlink unit: a leftover unit (from an old manual
  # install) that points at a stale checkout/token would otherwise resurrect the
  # wrong build on reboot and fight this provisioner's daemons for the ports. The
  # provisioner owns the daemons, so it must be the single authority.
  local U
  for U in $(systemctl list-units --all --type=service --no-legend 2>/dev/null | grep -i torl | awk '{print $1}'); do
    sudo -n systemctl disable --now "$U" 2>/dev/null || sudo -n systemctl stop "$U" 2>/dev/null || true
    sudo -n rm -f "/etc/systemd/system/$U" 2>/dev/null || true
  done
  sudo -n systemctl daemon-reload 2>/dev/null || true
  for U in $(systemctl --user list-units --all --type=service --no-legend 2>/dev/null | grep -i torl | awk '{print $1}'); do
    systemctl --user disable --now "$U" 2>/dev/null || systemctl --user stop "$U" 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/$U" 2>/dev/null || true
  done
  systemctl --user daemon-reload 2>/dev/null || true
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete $(pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*torl[^"]*"' | cut -d'"' -f4) >/dev/null 2>&1 || true
  fi
  # Only now that nothing will restart them: kill any stray processes.
  # Match both spellings: the npm bin ("torlnk") and a local checkout ("torlink").
  pkill -f 'torli?nk' 2>/dev/null || sudo -n pkill -f 'torli?nk' 2>/dev/null || true
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

# --- start the daemons UNDER SUPERVISION ---
# A bare \`--daemon\` process answers to nobody: a crash, an OOM kill or a reboot
# takes the seedbox offline for good, and the app can only report ECONNREFUSED
# until a human re-runs this installer. Prefer systemd --user units with
# Restart=always (plus linger, so they come up at boot with nobody logged in);
# fall back to \`--daemon\` only where systemd --user isn't usable.
SUPERVISED=0
UNIT_DIR="$HOME/.config/systemd/user"
NODE_DIR=$(dirname "$(command -v node 2>/dev/null)" 2>/dev/null)
UNIT_PATH="$NODE_DIR:$HOME/.local/bin:$HOME/.local/share/mise/shims:/usr/local/bin:/usr/bin:/bin"
if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  mkdir -p "$UNIT_DIR"
  loginctl enable-linger "$USER" >/dev/null 2>&1 || sudo -n loginctl enable-linger "$USER" >/dev/null 2>&1 || true
  cat > "$UNIT_DIR/torlink-serve.service" <<UNIT
[Unit]
Description=torlink add-API (media-streamer)
After=network-online.target
# Never stop retrying. systemd's default rate limit (5 starts / 10s) would put a
# crash-looping torlink into 'failed' permanently — which is precisely the dead
# daemon this unit exists to prevent.
StartLimitIntervalSec=0

[Service]
Type=simple
Environment="PATH=$UNIT_PATH"
Environment="TORLINK_API_TOKEN=$TOK"
Environment="TORLINK_FILES_TOKEN=$TOK"
Environment="TORLINK_MAX_DOWNLOADS=2"
# The token comes from the environment above, NOT argv: anything on the command
# line is world-readable in \`ps\` to every user on the box. torlink reads
# \`U.token ?? process.env.TORLINK_API_TOKEN\`, and refuses to bind a public
# interface with no token at all — so a missing env var fails the unit loudly
# instead of quietly exposing an unauthenticated API.
ExecStart=$BIN serve --host 0.0.0.0 --port $SERVE_PORT --to "$DATA" ${seedFlag}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
  cat > "$UNIT_DIR/torlink-files.service" <<UNIT
[Unit]
Description=torlink file server (media-streamer)
After=network-online.target
# Never stop retrying. systemd's default rate limit (5 starts / 10s) would put a
# crash-looping torlink into 'failed' permanently — which is precisely the dead
# daemon this unit exists to prevent.
StartLimitIntervalSec=0

[Service]
Type=simple
Environment="PATH=$UNIT_PATH"
Environment="TORLINK_API_TOKEN=$TOK"
Environment="TORLINK_FILES_TOKEN=$TOK"
# Token via environment, not argv — see the add-API unit above.
ExecStart=$BIN files --host 0.0.0.0 --port $FILES_PORT --dir "$DATA"
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  if systemctl --user enable --now torlink-serve.service torlink-files.service >/tmp/torlnk-systemd.log 2>&1; then
    SUPERVISED=1
    emit supervise ok "systemd --user units with Restart=always + linger — torlink now recovers from crashes and reboots by itself"
  else
    emit supervise skip "systemd --user unavailable: $(tail -n 2 /tmp/torlnk-systemd.log 2>/dev/null | tr '\\n' ' ')"
  fi
else
  emit supervise skip "no usable systemd --user on this box; falling back to unsupervised --daemon (the watchdog cron below covers restarts)"
fi

if [ "$SUPERVISED" = "1" ]; then
  # systemd start is async — wait for the port to actually bind before judging.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS -m 2 "http://127.0.0.1:$SERVE_PORT/health" >/dev/null 2>&1 && break
    sleep 1
  done
  if curl -fsS -m 3 "http://127.0.0.1:$SERVE_PORT/health" >/dev/null 2>&1; then
    emit serve ok "add-API on $SERVE_PORT via systemd (downloads: $DATA; ${seedDesc})"
  else
    emit serve fail "torlink-serve.service started but nothing answered on $SERVE_PORT — run 'systemctl --user status torlink-serve' on the box"
  fi
  if [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H "Authorization: Bearer $TOK" "http://127.0.0.1:$FILES_PORT/" 2>/dev/null || echo 000)" != "000" ]; then
    emit files ok "file server on $FILES_PORT via systemd (serving: $DATA)"
  else
    emit files fail "torlink-files.service started but nothing answered on $FILES_PORT — run 'systemctl --user status torlink-files' on the box"
  fi
else
  # Export rather than pass --token: argv is visible in \`ps\` to every user on
  # the box, and torlink falls back to these env vars.
  export TORLINK_API_TOKEN="$TOK"
  export TORLINK_FILES_TOKEN="$TOK"
  if "$BIN" serve --host 0.0.0.0 --port "$SERVE_PORT" --to "$DATA" ${seedFlag}--daemon >/tmp/torlnk-serve.log 2>&1; then
    emit serve ok "add-API on $SERVE_PORT (downloads: $DATA; ${seedDesc})"
  else
    emit serve fail "$(tail -n 3 /tmp/torlnk-serve.log 2>/dev/null | tr '\\n' ' ')"
  fi
  if "$BIN" files --host 0.0.0.0 --port "$FILES_PORT" --dir "$DATA" --daemon >/tmp/torlnk-files.log 2>&1; then
    emit files ok "file server on $FILES_PORT (serving: $DATA)"
  else
    emit files fail "$(tail -n 3 /tmp/torlnk-files.log 2>/dev/null | tr '\\n' ' ')"
  fi
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
# Collect whatever the box can tell us about a daemon that would not stay up:
# the systemd journal when supervised, otherwise torlink's own logs.
why_dead(){
  if [ "$SUPERVISED" = "1" ]; then
    journalctl --user -u torlink-serve.service -n 6 --no-pager 2>/dev/null | tr '\\n' ' '
  else
    tail -n 6 /tmp/torlnk-serve.log 2>/dev/null | tr '\\n' ' '
  fi
}

if curl -fsS "http://127.0.0.1:$SERVE_PORT/health" >/tmp/torlnk-health 2>/dev/null; then
  emit health ok "$(cat /tmp/torlnk-health 2>/dev/null | tr '\\n' ' ')"
else
  emit health fail "serve did not answer /health — $(why_dead)"
fi

# --- does it STAY up? ---
# An immediate health check only proves torlink started. It has been dying
# shortly after launch (the box was found with no torlnk process at all), and a
# provisioner that reports success for a daemon which is already gone is worse
# than useless. Re-probe after a delay and report what killed it.
sleep 12
if curl -fsS -m 5 "http://127.0.0.1:$SERVE_PORT/health" >/dev/null 2>&1; then
  emit stable ok "still serving 15s after start"
else
  emit stable fail "torlink started but died within ~15s — $(why_dead)"
fi

# --- rescue magnets stranded in the legacy watch dir ---
# Older installs advertised $HOME/Downloads/watch as a blackhole, but nothing
# ever read it: torlink's watch mode is a separate \`torlnk watch\` process this
# provisioner never started. Every SSH send therefore piled up unread. Hand any
# leftovers to the add-API now and move them aside so they are not re-imported.
LEGACY_WATCH="$HOME/Downloads/watch"
if [ -d "$LEGACY_WATCH" ]; then
  RESCUED=0; STRAY_FAILED=0
  for F in "$LEGACY_WATCH"/*.magnet "$LEGACY_WATCH"/*.txt; do
    [ -f "$F" ] || continue
    # Build the JSON with node so a magnet containing quotes/backslashes cannot
    # break out of the body (node is guaranteed here — torlink requires it).
    if node -e 'const fs=require("fs");const m=fs.readFileSync(process.argv[1],"utf8").trim();if(!/^magnet:/i.test(m))process.exit(2);fetch(process.argv[2],{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.argv[3]},body:JSON.stringify({magnet:m})}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' \
         "$F" "http://127.0.0.1:$SERVE_PORT/add" "$TOK" 2>/dev/null; then
      mkdir -p "$LEGACY_WATCH/.processed" 2>/dev/null || true
      mv "$F" "$LEGACY_WATCH/.processed/" 2>/dev/null || true
      RESCUED=$((RESCUED+1))
    else
      STRAY_FAILED=$((STRAY_FAILED+1))
    fi
  done
  if [ "$RESCUED" -gt 0 ] || [ "$STRAY_FAILED" -gt 0 ]; then
    emit rescue ok "imported $RESCUED magnet(s) stranded in the old watch folder ($STRAY_FAILED could not be read); moved to .processed"
  else
    emit rescue skip "no stranded magnets in the old watch folder"
  fi
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

# --- verify per-torrent controls (POST /control) are actually served ---
# Catches a stale/old build that answers /health + /status but 404s the controls
# route (the "older torlink without torrent controls" trap): a PRESENT route
# replies "no such torrent" for a bogus id; a MISSING route replies "not found".
CTRL=$(curl -s -m 5 -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"id":"0000000000000000000000000000000000000000","action":"pause"}' \
  "http://127.0.0.1:$SERVE_PORT/control" 2>/dev/null || echo '')
if printf '%s' "$CTRL" | grep -qi 'no such torrent'; then
  emit controls ok "per-torrent controls (/control) are live"
elif printf '%s' "$CTRL" | grep -qi 'not found'; then
  emit controls fail "daemon lacks /control — an OLD torlink is answering on $SERVE_PORT. A stale ~/.local/bin/torlnk wrapper or systemd unit is shadowing the global build; the new build did not take. Check 'command -v torlnk' and ~/torlink on the box."
else
  emit controls skip "could not confirm /control locally (response: $(printf '%s' "$CTRL" | head -c 60))"
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
# The global npm bin dir — NOT \`dirname "$BIN"\`, which lands in .../dist when
# $BIN fell back to cli.cjs and would leave npm/torlnk off cron's PATH.
GLOBAL_BIN_DIR="$(npm prefix -g 2>/dev/null)/bin"

# The updater restarts both daemons whenever it installs a release, so every run
# is a small outage window. At */5 that was 288 chances a day to be caught
# mid-restart (the app just sees ECONNREFUSED), and a restart that half-failed
# stayed broken because the NEXT run finds the version current and no-ops.
# Hourly is plenty for picking up releases; the watchdog below owns liveness.
UPD_MARK="# torlink-autoupdate-media-streamer"
UPD_LINE="17 * * * * PATH=\\"$NODE_BIN_DIR:$GLOBAL_BIN_DIR:/usr/local/bin:/usr/bin:/bin\\" \\"$BIN\\" update >> \\"$HOME/.torlnk-update.log\\" 2>&1 $UPD_MARK"

# --- watchdog: the thing that actually keeps the seedbox reachable ---
# Probes the add-API and restarts torlink if it stops answering — covering the
# gap systemd can't (a wedged-but-alive process) and the case where systemd
# --user wasn't available at all.
WD="$HOME/.torlnk-watchdog.sh"
cat > "$WD" <<WDEOF
#!/usr/bin/env bash
# Installed by media-streamer. Restarts torlink when its add-API stops answering.
export PATH="$UNIT_PATH"
curl -fsS -m 5 "http://127.0.0.1:$SERVE_PORT/health" >/dev/null 2>&1 && exit 0
echo "\\$(date -Is) /health did not answer on $SERVE_PORT — restarting torlink" >> "$HOME/.torlnk-watchdog.log"
# Clear any 'failed' state first: systemctl restart refuses a unit that tripped
# the start limit ("start request repeated too quickly"), so without this the
# watchdog would silently no-op on exactly the boxes that need it most.
systemctl --user reset-failed torlink-serve.service torlink-files.service >/dev/null 2>&1 || true
systemctl --user restart torlink-serve.service torlink-files.service >/dev/null 2>&1 && exit 0
export TORLINK_API_TOKEN="$TOK"
export TORLINK_FILES_TOKEN="$TOK"
export TORLINK_MAX_DOWNLOADS=2
"$BIN" serve --host 0.0.0.0 --port "$SERVE_PORT" --to "$DATA" ${seedFlag}--daemon >/dev/null 2>&1 || true
"$BIN" files --host 0.0.0.0 --port "$FILES_PORT" --dir "$DATA" --daemon >/dev/null 2>&1 || true
WDEOF
chmod +x "$WD" 2>/dev/null || true
WD_MARK="# torlink-watchdog-media-streamer"
WD_LINE="*/5 * * * * \\"$WD\\" >/dev/null 2>&1 $WD_MARK"

if command -v crontab >/dev/null 2>&1; then
  if ( crontab -l 2>/dev/null | grep -vF "$UPD_MARK" | grep -vF "$WD_MARK"; echo "$UPD_LINE"; echo "$WD_LINE" ) | crontab - 2>/dev/null; then
    emit autoupdate ok "torlnk update runs hourly; a health watchdog re-launches torlink every 5 min if it stops answering"
  else
    emit autoupdate skip "couldn't install the auto-update/watchdog cron; run 'torlnk update' to upgrade manually"
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
