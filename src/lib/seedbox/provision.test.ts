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

    it('installs torlnk and enforces Node >= 22', () => {
      expect(script).toContain('npm i -g torlnk');
      expect(script).toContain('-lt 22');
    });

    it('starts serve and files daemons bound to the token and public host', () => {
      expect(script).toContain(`serve --host 0.0.0.0 --port "$SERVE_PORT" --token "$TOK"`);
      expect(script).toContain(`files --host 0.0.0.0 --port "$FILES_PORT" --token "$TOK"`);
      expect(script).toContain('--daemon');
      expect(script).toContain("TOK='TOK123_-'");
      expect(script).toContain("SERVE_PORT='9161'");
      expect(script).toContain("FILES_PORT='9160'");
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
