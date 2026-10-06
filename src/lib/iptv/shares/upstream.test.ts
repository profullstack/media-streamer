import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fetchUpstream } from './upstream';

/**
 * The broken-certificate cases run against HTTPS servers on 127.0.0.1 with
 * certificates minted here, not against badssl.com: a public host made the
 * suite fail whenever the runner could not reach it (PR #259, "fetch failed"
 * on both cases while every other test passed).
 *
 * The certificates come from the openssl CLI at run time, so no private key is
 * committed. The expired one is made with `openssl ca -selfsign` and explicit
 * past dates, which works on OpenSSL 3.0 (the GitHub runner) where
 * `req -not_after` does not exist yet.
 */
function hasOpenssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface Cert {
  key: string;
  cert: string;
}

function mintCerts(dir: string): { selfSigned: Cert; expired: Cert } {
  const run = (args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  const subj = '/CN=127.0.0.1';

  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'self.key', '-out', 'self.crt',
    '-days', '3650', '-subj', subj]);

  writeFileSync(join(dir, 'index.txt'), '');
  writeFileSync(join(dir, 'serial'), '01\n');
  writeFileSync(
    join(dir, 'ca.cnf'),
    [
      '[ca]', 'default_ca = d',
      '[d]', `dir = ${dir}`, 'database = $dir/index.txt', 'serial = $dir/serial',
      'new_certs_dir = $dir', 'default_md = sha256', 'policy = p', 'unique_subject = no',
      '[p]', 'commonName = supplied',
    ].join('\n')
  );
  run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'expired.key', '-out', 'expired.csr',
    '-subj', subj]);
  run(['ca', '-batch', '-config', 'ca.cnf', '-selfsign', '-keyfile', 'expired.key', '-in', 'expired.csr',
    '-out', 'expired.crt', '-startdate', '20200101000000Z', '-enddate', '20200102000000Z']);

  const read = (name: string) => readFileSync(join(dir, name), 'utf8');
  return {
    selfSigned: { key: read('self.key'), cert: read('self.crt') },
    expired: { key: read('expired.key'), cert: read('expired.crt') },
  };
}

function serve(cert: Cert): Promise<Server> {
  const server = createServer(cert, (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const urlOf = (server: Server) => `https://127.0.0.1:${(server.address() as AddressInfo).port}/`;

/**
 * The behaviour that matters: a resale request carries the owner's provider
 * credentials, so it must be verified unless the provider's certificate is
 * genuinely broken -- not unverified by default, the way the rest of the codebase
 * reaches IPTV providers.
 */
describe('fetchUpstream', () => {
  it('succeeds against a host with a valid certificate', async () => {
    const res = await fetchUpstream({ url: 'https://example.com/', timeoutMs: 20000 });
    expect(res.status).toBeGreaterThan(0);
  }, 30000);

  describe.skipIf(!hasOpenssl())('hosts with a broken certificate', () => {
    let dir: string;
    let selfSigned: Server;
    let expired: Server;

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'upstream-tls-'));
      const certs = mintCerts(dir);
      selfSigned = await serve(certs.selfSigned);
      expired = await serve(certs.expired);
    });

    afterAll(async () => {
      await Promise.all([selfSigned, expired].map((s) => s && new Promise((r) => s.close(r))));
      rmSync(dir, { recursive: true, force: true });
    });

    // Each case also checks the warning: it is logged only on the
    // certificate-error branch, so a 200 without it would mean the strict
    // agent accepted a broken certificate.
    it('still reaches a host whose certificate is expired', async () => {
      // Precisely the provider population the fallback exists for. A
      // strict-only client fails here.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const res = await fetchUpstream({ url: urlOf(expired), timeoutMs: 10000 });
        expect(res.status).toBe(200);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed certificate verification'));
      } finally {
        warn.mockRestore();
      }
    }, 20000);

    it('still reaches a host with a self-signed certificate', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const res = await fetchUpstream({ url: urlOf(selfSigned), timeoutMs: 10000 });
        expect(res.status).toBe(200);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed certificate verification'));
      } finally {
        warn.mockRestore();
      }
    }, 20000);
  });

  it('propagates a non-certificate failure rather than retrying unverified', async () => {
    // A DNS failure must not be mistaken for a broken certificate and quietly
    // downgraded; the fallback has to stay scoped to certificate errors.
    await expect(
      fetchUpstream({ url: 'https://this-host-does-not-exist.invalid/', timeoutMs: 8000 })
    ).rejects.toBeDefined();
  }, 20000);
});
