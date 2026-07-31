import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  buildProvisionScript,
  generateSeedboxToken,
  parseSteps,
  provisionTorlink,
  DEFAULT_FILES_PORT,
  DEFAULT_SERVE_PORT,
} from './provision';
import { execRemote } from './ssh-transport';

vi.mock('./ssh-transport', () => ({ execRemote: vi.fn() }));

describe('seedbox provisioner', () => {
  describe('generateSeedboxToken', () => {
    it('produces a URL-safe token with no padding', () => {
      const tok = generateSeedboxToken();
      expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(tok.length).toBeGreaterThanOrEqual(24);
      expect(generateSeedboxToken()).not.toBe(tok);
    });
  });

  describe('buildProvisionScript', () => {
    const script = buildProvisionScript('TOK123_-', DEFAULT_SERVE_PORT, DEFAULT_FILES_PORT);

    it('installs the torlink fork (with the concurrency cap) and enforces Node >= 22', () => {
      expect(script).toContain('npm i -g "$PKG@latest"'); // @latest so a cached global actually upgrades
      expect(script).toContain("PKG='@profullstack/torlink'");
      expect(script).toContain('TORLINK_MAX_DOWNLOADS=2');
      expect(script).toContain('-lt 22');
    });

    it('resolves the daemon from the global bin, not PATH (a ~/.local/bin shadow must not win)', () => {
      // The "older torlink without torrent controls" bug: a stale ~/.local/bin/torlnk
      // wrapper shadowed the freshly-installed global build. Resolve via npm prefix,
      // and repoint the shadow wrapper.
      expect(script).toContain('GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin/torlnk"');
      expect(script).toContain('.local/bin/torlnk');
      expect(script).not.toContain('BIN=$(command -v torlnk 2>/dev/null || true)');
    });

    it('verifies /control is actually served (catches a stale build that only has /add,/status)', () => {
      expect(script).toContain('/control');
      expect(script).toContain('no such torrent'); // present route
      expect(script).toContain('not found'); // missing route -> emit controls fail
    });

    it('starts serve and files daemons bound to the public host', () => {
      expect(script).toContain(`serve --host 0.0.0.0 --port "$SERVE_PORT"`);
      expect(script).toContain(`files --host 0.0.0.0 --port "$FILES_PORT"`);
      expect(script).toContain('--daemon');
      expect(script).toContain("TOK='TOK123_-'");
      expect(script).toContain("SERVE_PORT='9161'");
      expect(script).toContain("FILES_PORT='9160'");
    });

    it('never puts the bearer token on a command line', () => {
      // argv is world-readable via `ps`, so `--token <secret>` hands the seedbox
      // API key to every user on the box. torlink reads
      // `U.token ?? process.env.TORLINK_API_TOKEN` and refuses to bind a public
      // interface with no token at all, so the env-var route is both safe and
      // fail-loud.
      // Compare executable lines only — a comment mentioning the flag is fine.
      const code = script
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');
      expect(code).not.toContain('--token');
      expect(code).toContain('TORLINK_API_TOKEN=');
      expect(code).toContain('TORLINK_FILES_TOKEN=');
    });

    // Pull out just the `serve ... --daemon` invocation so assertions target the
    // real command, not the surrounding explanatory comments.
    const serveCmd = (s: string): string => (s.match(/serve --host[^\n]*--daemon/)?.[0] ?? '');

    it('time-limits seeding via torlink --seed-time (default 2h) and keeps files', () => {
      // Defaults to 2h; the serve daemon never passes --delete-files.
      expect(serveCmd(script)).toContain('--seed-time 2h');
      expect(serveCmd(script)).not.toContain('--delete-files');
      // The old delete-after-6h cron (find -mmin +N -delete every 30m) is gone.
      expect(script).not.toContain('-mmin');
      expect(script).not.toContain('*/30 * * * *');
      // …but re-provisioning still strips that cron off boxes that already have it.
      expect(script).toContain('torlink-autopurge-media-streamer');
    });

    it('installs a cron that self-updates torlink via `torlnk update`', () => {
      expect(script).toContain('torlink-autoupdate-media-streamer');
      expect(script).toContain('update >>'); // `"$BIN" update >> ...log`
      expect(script).toContain('NODE_BIN_DIR='); // pins PATH for cron
    });

    it('runs the updater hourly, not every 5 min (each run restarts the daemons)', () => {
      // */5 meant 288 restart windows a day; the app sees ECONNREFUSED in each
      // one. Liveness is the watchdog's job, not the updater's.
      const updLine = script.match(/^UPD_LINE=.*$/m)?.[0] ?? '';
      expect(updLine).toContain('17 * * * *');
      expect(updLine).not.toContain('*/5 * * * *');
    });

    it('pins cron PATH to the real global bin dir, not dirname of a cli.cjs path', () => {
      expect(script).toContain('GLOBAL_BIN_DIR="$(npm prefix -g 2>/dev/null)/bin"');
      expect(script).not.toContain('GLOBAL_BIN_DIR=$(dirname "$BIN")');
    });

    it('supervises the daemons with systemd --user (Restart=always + linger)', () => {
      expect(script).toContain('torlink-serve.service');
      expect(script).toContain('torlink-files.service');
      expect(script).toContain('Restart=always');
      expect(script).toContain('enable-linger');
      expect(script).toContain('systemctl --user enable --now');
      // The unsupervised path must remain as a fallback.
      expect(script).toContain('SUPERVISED=0');
      expect(script).toContain('if [ "$SUPERVISED" = "1" ]; then');
    });

    it('installs a watchdog that restarts torlink when /health stops answering', () => {
      expect(script).toContain('torlink-watchdog-media-streamer');
      expect(script).toContain('.torlnk-watchdog.sh');
      const wdLine = script.match(/^WD_LINE=.*$/m)?.[0] ?? '';
      expect(wdLine).toContain('*/5 * * * *'); // liveness probe every 5 min
      // Restarts via systemd when present, else relaunches the daemons directly.
      expect(script).toContain('systemctl --user restart torlink-serve.service');
      // The timestamp must be evaluated when the watchdog RUNS, not when the
      // heredoc that writes it is expanded.
      expect(script).toContain('\\$(date -Is)');
    });

    it('tears down supervisors before pkill so Restart=always cannot resurrect a daemon', () => {
      const stopFn = script.match(/stop_torlink\(\)\{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(stopFn).toBeTruthy();
      // Compare actual commands — comments mention both names, so matching the
      // raw text would assert nothing about execution order.
      const commands = stopFn
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');
      expect(commands).toContain('pkill');
      expect(commands.indexOf('systemctl')).toBeLessThan(commands.indexOf('pkill'));
    });

    it('honors a custom seeding window and supports 0 = seed indefinitely', () => {
      expect(
        serveCmd(buildProvisionScript('T', DEFAULT_SERVE_PORT, DEFAULT_FILES_PORT, undefined, 6))
      ).toContain('--seed-time 6h');
      const forever = buildProvisionScript('T', DEFAULT_SERVE_PORT, DEFAULT_FILES_PORT, undefined, 0);
      expect(serveCmd(forever)).not.toContain('--seed-time');
      expect(forever).toContain('seeds indefinitely');
    });

    it('opens firewall ports via ufw or firewalld', () => {
      expect(script).toContain('ufw allow "$SERVE_PORT"/tcp');
      expect(script).toContain('firewall-cmd');
    });

    it('health-checks the add-API', () => {
      expect(script).toContain('/health');
    });
  });

  describe('parseSteps', () => {
    it('parses STEP and RESULT lines', () => {
      const out = [
        'STEP|node|ok|v22.5.0',
        'STEP|install|ok|npm i -g torlnk',
        'STEP|serve|ok|add-API listening on 9161',
        'STEP|files|ok|file server listening on 9160',
        'STEP|ports|skip|no ufw/firewalld',
        'STEP|health|ok|{"ok":true}',
        'RESULT|ok',
      ].join('\n');
      const { steps, result } = parseSteps(out);
      expect(result).toBe('ok');
      expect(steps).toHaveLength(6);
      expect(steps[0]).toEqual({ name: 'node', status: 'ok', detail: 'v22.5.0' });
      expect(steps[4]).toEqual({ name: 'ports', status: 'skip', detail: 'no ufw/firewalld' });
    });

    it('preserves detail text containing pipes and marks a failed result', () => {
      const { steps, result } = parseSteps('STEP|install|fail|error: a|b|c\nRESULT|fail');
      expect(result).toBe('fail');
      expect(steps[0]).toEqual({ name: 'install', status: 'fail', detail: 'error: a|b|c' });
    });

    it('returns null result when no RESULT line is present', () => {
      const { result } = parseSteps('STEP|node|ok|v22');
      expect(result).toBeNull();
    });
  });
});

describe('seedbox provisioner — install must leave a daemon that stays up', () => {
  const script = buildProvisionScript('TOK123_-', DEFAULT_SERVE_PORT, DEFAULT_FILES_PORT);

  it('disables systemd’s start rate limit so a crash loop never lands in failed', () => {
    // Default is 5 starts / 10s, after which systemd gives up permanently —
    // recreating the exact dead-daemon state these units exist to prevent.
    expect(script).toContain('StartLimitIntervalSec=0');
    // Once per unit ([Unit] section of serve and files).
    expect(script.match(/StartLimitIntervalSec=0/g)).toHaveLength(2);
  });

  it('clears failed state before the watchdog restarts (restart refuses otherwise)', () => {
    const wd = script.match(/cat > "\$WD" <<WDEOF[\s\S]*?WDEOF/)?.[0] ?? '';
    expect(wd).toContain('reset-failed');
    expect(wd.indexOf('reset-failed')).toBeLessThan(wd.indexOf('systemctl --user restart'));
  });

  it('re-probes after a delay so a daemon that dies immediately is not reported ok', () => {
    expect(script).toContain('emit stable ok');
    expect(script).toContain('emit stable fail');
    // The re-probe must come after a wait, not back-to-back with the first check.
    const stable = script.indexOf('--- does it STAY up? ---');
    expect(stable).toBeGreaterThan(-1);
    expect(script.slice(stable, stable + 400)).toMatch(/sleep \d+/);
  });

  it('reports why a dead daemon died instead of a bare "did not answer"', () => {
    expect(script).toContain('why_dead()');
    expect(script).toContain('journalctl --user -u torlink-serve.service');
    expect(script).toContain('$(why_dead)');
  });

  it('imports magnets stranded in the legacy watch folder', () => {
    expect(script).toContain('LEGACY_WATCH="$HOME/Downloads/watch"');
    expect(script).toContain('emit rescue ok');
    expect(script).toContain('.processed');
    // Body built via node, so a magnet with quotes cannot break the JSON.
    expect(script).toContain('JSON.stringify({magnet:m})');
  });

  it('still does not create a watch dir (nothing reads it)', () => {
    expect(script).not.toContain('mkdir -p "$WATCH"');
    expect(script).not.toContain('WATCH="$HOME/Downloads/watch"\nmkdir');
  });
});

describe('watchdog — must be able to reach systemd from cron', () => {
  const script = buildProvisionScript('TOK123_-', DEFAULT_SERVE_PORT, DEFAULT_FILES_PORT);
  const wd = script.match(/cat > "\$WD" <<WDEOF[\s\S]*?\nWDEOF/)?.[0] ?? '';

  it('extracts the watchdog body', () => {
    expect(wd).toBeTruthy();
  });

  // Comments in this block mention systemctl by name, so order must be asserted
  // against real commands only — matching raw text would prove nothing.
  const wdCommands = wd
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

  it('sets XDG_RUNTIME_DIR/DBUS before calling systemctl --user', () => {
    // cron has no login session: without these, `systemctl --user` fails with
    // "Failed to connect to user scope bus" on every run, so the watchdog never
    // actually restarted the units it exists to restart.
    expect(wdCommands).toContain('XDG_RUNTIME_DIR');
    expect(wdCommands).toContain('DBUS_SESSION_BUS_ADDRESS');
    expect(wdCommands.indexOf('XDG_RUNTIME_DIR')).toBeLessThan(wdCommands.indexOf('systemctl --user'));
    expect(wdCommands.indexOf('DBUS_SESSION_BUS_ADDRESS')).toBeLessThan(
      wdCommands.indexOf('systemctl --user')
    );
  });

  it('resolves the uid when the watchdog runs, not when it is written', () => {
    // A bare $(id -u) inside the unquoted heredoc would bake the PROVISIONING
    // shell's uid into the file.
    expect(wd).toContain('/run/user/\\$(id -u)');
    expect(wd).not.toMatch(/XDG_RUNTIME_DIR="\/run\/user\/\d+"/);
  });

  it('re-probes health before falling back to an unsupervised daemon', () => {
    // Spawning a bare daemon while the unit is mid-restart races it for the
    // port; the loser then crash-loops forever against a port it cannot bind.
    const restart = wd.indexOf('systemctl --user restart');
    const fallback = wd.indexOf('--daemon');
    expect(restart).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(restart);
    const between = wd.slice(restart, fallback);
    expect(between).toMatch(/curl[^\n]*\/health/);
    expect(between).toMatch(/sleep \d+/);
    // The old `restart ... && exit 0` short-circuit treated a queued restart as
    // proof the port was bound.
    expect(wd).not.toContain('restart torlink-serve.service torlink-files.service >/dev/null 2>&1 && exit 0');
  });

  it('retries the stability probe so one dropped packet cannot fail a healthy box', () => {
    const stable = script.slice(script.indexOf('--- does it STAY up? ---'));
    expect(stable).toContain('STABLE=0');
    expect(stable).toMatch(/for _ in 1 2 3/);
  });
});

describe('provisionTorlink — a daemon we watched die is not a successful install', () => {
  const ssh = {
    host: 'seedbox.example.com',
    port: 22,
    user: 'ubuntu',
    privateKey: 'KEY',
    privateKeyPath: null,
    watchDir: null,
    addCommand: 'true',
  };

  const runWith = async (lines: string[]) => {
    vi.mocked(execRemote).mockResolvedValue({ stdout: lines.join('\n'), stderr: '' } as never);
    return provisionTorlink(ssh, { token: 'TOK' });
  };

  beforeEach(() => vi.mocked(execRemote).mockReset());

  it('fails the install when the daemon died inside the stability window', async () => {
    const result = await runWith([
      'STEP|install|ok|npm i -g @profullstack/torlink@latest',
      'STEP|serve|ok|add-API on 9161',
      'STEP|health|ok|{"ok":true}',
      'STEP|stable|fail|torlink started but died within ~15s — Main process exited',
      'RESULT|ok',
    ]);
    expect(result.ok).toBe(false);
    // No token ⇒ the route 502s instead of wiring a dead box into the config.
    expect(result.token).toBeNull();
    expect(result.steps.find((s) => s.name === 'stable')?.status).toBe('fail');
  });

  it('succeeds when the daemon is still serving after the window', async () => {
    const result = await runWith([
      'STEP|serve|ok|add-API on 9161',
      'STEP|stable|ok|still serving 15s after start',
      'RESULT|ok',
    ]);
    expect(result.ok).toBe(true);
    expect(result.token).toBe('TOK');
  });

  it('does not require a stable step that an older script never emitted', async () => {
    const result = await runWith(['STEP|serve|ok|add-API on 9161', 'RESULT|ok']);
    expect(result.ok).toBe(true);
  });
});
