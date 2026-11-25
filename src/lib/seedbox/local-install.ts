/**
 * torlink on your own machine, set up by a script you run there yourself.
 *
 * The SSH installer (provision.ts) reaches into a box from our side. This is the same
 * script, wrapped to run on the box directly: `curl -fsSL https://bittorrented.com/torlink/install.sh | bash`,
 * or `c0mpute plugin install torlink` on a c0mpute node, which downloads and runs it.
 * Nothing about the box comes to us unless the owner pastes the connect code it prints
 * into /seedboxes, and the access token in that code is made on the box, not here.
 *
 * Anthony, 2026-11-25: "c0mpute.com should have a torlink plugin ... add a plugin for
 * bittorrented.com and nixamp.com to share ... connect et. al. if node operator for
 * managing". The connect code is the "connect": paste it and the box is a seedbox on
 * your account, managed from the seedbox pages. nixamp shares the same folder.
 */

import { DEFAULT_FILES_PORT, DEFAULT_SERVE_PORT, buildProvisionScript } from './provision';

/** What the connect code starts with, so a pasted code is recognisable. */
export const CONNECT_CODE_PREFIX = 'btsb1_';

const TOKEN_PLACEHOLDER = '__BT_LOCAL_TOKEN__';
const BODY_DELIMITER = 'BITTORRENTED_TORLINK_PROVISION_EOF';

export interface ConnectCode {
  host: string;
  servePort: number;
  filesPort: number;
  token: string;
  name: string | null;
}

/** The script served at /torlink/install.sh. Holds no secret: the token is made on the box. */
export function buildLocalInstallScript(origin = 'https://bittorrented.com'): string {
  const body = buildProvisionScript(TOKEN_PLACEHOLDER, DEFAULT_SERVE_PORT, DEFAULT_FILES_PORT, undefined, 2).replace(
    `TOK='${TOKEN_PLACEHOLDER}'`,
    'TOK="$BT_TORLINK_TOKEN"'
  );
  if (body.includes(TOKEN_PLACEHOLDER) || body.includes(BODY_DELIMITER)) {
    throw new Error('provision script changed shape; the local installer cannot wrap it');
  }

  return `#!/usr/bin/env bash
# torlink for BitTorrented: install it on THIS machine, keep it running, and print a
# code that connects it to your BitTorrented account as a seedbox.
#
#   curl -fsSL ${origin}/torlink/install.sh | bash
#   c0mpute plugin install torlink        # the same thing, on a c0mpute node
#
# What it does: installs Node (via mise) if needed and the torlink CLI, starts its
# add-API on :${DEFAULT_SERVE_PORT} and file server on :${DEFAULT_FILES_PORT} under systemd --user (a watchdog
# cron restarts them, an hourly cron updates torlink), opens those two ports when it
# can, and prints a connect code. Downloads land in ~/Downloads/done.
# Run it as the user that should own the downloads, not root. Re-running is safe; it
# makes a new access token, so connect again with the new code.
# Settings: BT_HOST=<public hostname or IP> (default: this machine's public IPv4).
set -u

say()  { printf '\\033[1;36m→\\033[0m %s\\n' "$*"; }
warn() { printf '\\033[1;33m!\\033[0m %s\\n' "$*" >&2; }

if [ "$(id -u)" -eq 0 ]; then
  warn "running as root: torlink will run as root and downloads land in /root. Run this as an ordinary user instead if you can."
fi
for bin in curl base64; do
  command -v "$bin" >/dev/null 2>&1 || { warn "needs $bin"; exit 1; }
done

CONF="\${XDG_CONFIG_HOME:-$HOME/.config}/torlink"
mkdir -p "$CONF" && chmod 700 "$CONF"

# The access token is made here and never sent anywhere but into the code below.
BT_TORLINK_TOKEN="$(head -c 24 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\\n')"
export BT_TORLINK_TOKEN

BODY="$(mktemp)"
LOG="$(mktemp)"
trap 'rm -f "$BODY" "$LOG"' EXIT
cat > "$BODY" <<'${BODY_DELIMITER}'
${body}
${BODY_DELIMITER}

say "installing torlink (this takes a minute or two)"
bash "$BODY" 2>&1 | tee "$LOG" | while IFS='|' read -r kind name status detail; do
  [ "$kind" = "STEP" ] || continue
  case "$status" in
    ok)   printf '  \\033[1;32m✓\\033[0m %s: %s\\n' "$name" "$detail" ;;
    fail) printf '  \\033[1;31m✕\\033[0m %s: %s\\n' "$name" "$detail" ;;
    *)    printf '  · %s: %s\\n' "$name" "$detail" ;;
  esac
done
if ! grep -q '^RESULT|ok' "$LOG"; then
  warn "torlink did not finish installing; the failed step is marked above. Fix it and run this again."
  exit 1
fi

HOST="\${BT_HOST:-}"
if [ -z "$HOST" ]; then
  HOST="$(curl -fsSL -m 10 'https://my.ip.pit.world/?format=json' 2>/dev/null | sed -n 's/.*"ipv4":"\\([0-9.]*\\)".*/\\1/p')"
fi
[ -n "$HOST" ] || HOST="$(curl -fsS -m 10 https://api.ipify.org 2>/dev/null)"
if [ -z "$HOST" ]; then
  warn "could not work out this machine's public address; run again with BT_HOST=<address>"
  exit 1
fi

NAME="$(hostname 2>/dev/null | tr -cd 'A-Za-z0-9._-' | cut -c1-40)"
JSON="{\\"v\\":1,\\"h\\":\\"$HOST\\",\\"sp\\":${DEFAULT_SERVE_PORT},\\"fp\\":${DEFAULT_FILES_PORT},\\"t\\":\\"$BT_TORLINK_TOKEN\\",\\"n\\":\\"$NAME\\"}"
CODE="${CONNECT_CODE_PREFIX}$(printf '%s' "$JSON" | base64 | tr '+/' '-_' | tr -d '=\\n')"
( umask 077; printf '%s\\n' "$CODE" > "$CONF/bittorrented-connect-code" )

cat <<EOF

torlink is running on this machine (add-API :${DEFAULT_SERVE_PORT}, files :${DEFAULT_FILES_PORT}, downloads in ~/Downloads/done).

Manage it from BitTorrented:
  1. Open ${origin}/seedboxes (Quick start, "Connect with a code")
  2. Paste this code:

$CODE

  It holds this box's access token: treat it like a password. Show it again with
    cat $CONF/bittorrented-connect-code
  If your provider has its own firewall, open TCP ${DEFAULT_SERVE_PORT} and ${DEFAULT_FILES_PORT} there too.

Share the same files on nixamp (https://nixamp.com), as a station others can tune in to:
  nixamp daemon start ~/Downloads/done --name "$NAME" --announce

Only share what you have the right to.
EOF
`;
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/**
 * An address we will make requests to: public, and not ours. Our server calls this
 * host to add torrents and stream files, so a code naming a private or loopback
 * address would be a way to make it call itself.
 */
export function isPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    if (h.split('.').some((o) => Number(o) > 255)) return false;
    return !PRIVATE_V4.some((re) => re.test(h));
  }
  if (h.includes(':')) {
    return !(h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::ffff:'));
  }
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h);
}

const validPort = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535 ? v : null;

/** Read a pasted connect code, or say why not. */
export function parseConnectCode(raw: unknown): { ok: true; code: ConnectCode } | { ok: false; error: string } {
  const text = typeof raw === 'string' ? raw.trim().replace(/\s+/g, '') : '';
  if (!text.startsWith(CONNECT_CODE_PREFIX)) {
    return { ok: false, error: `That is not a connect code. It starts with ${CONNECT_CODE_PREFIX} and is printed at the end of the install.` };
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(Buffer.from(text.slice(CONNECT_CODE_PREFIX.length), 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'That code is cut short or mistyped. Copy it again from the box.' };
  }
  const host = typeof data.h === 'string' ? data.h.trim().replace(/^\[|\]$/g, '') : '';
  const servePort = validPort(data.sp);
  const filesPort = validPort(data.fp);
  const token = typeof data.t === 'string' ? data.t : '';
  if (data.v !== 1 || !host || !servePort || !filesPort) {
    return { ok: false, error: 'That code is cut short or mistyped. Copy it again from the box.' };
  }
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return { ok: false, error: 'That code has no usable access token. Run the installer again.' };
  if (!isPublicHost(host)) {
    return { ok: false, error: 'That code names a private address. Run the installer again with BT_HOST set to the box’s public address.' };
  }
  const name = typeof data.n === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(data.n) ? data.n : null;
  return { ok: true, code: { host, servePort, filesPort, token, name } };
}

/** The base URL for a host and port, with IPv6 in brackets. */
export function baseUrl(host: string, port: number): string {
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}
