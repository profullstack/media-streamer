import { describe, it, expect } from 'vitest';

import {
  buildProvisionScript,
  generateSeedboxToken,
  parseSteps,
  DEFAULT_FILES_PORT,
  DEFAULT_SERVE_PORT,
} from './provision';

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

    it('starts serve and files daemons bound to the token and public host', () => {
      expect(script).toContain(`serve --host 0.0.0.0 --port "$SERVE_PORT" --token "$TOK"`);
      expect(script).toContain(`files --host 0.0.0.0 --port "$FILES_PORT" --token "$TOK"`);
      expect(script).toContain('--daemon');
      expect(script).toContain("TOK='TOK123_-'");
      expect(script).toContain("SERVE_PORT='9161'");
      expect(script).toContain("FILES_PORT='9160'");
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
