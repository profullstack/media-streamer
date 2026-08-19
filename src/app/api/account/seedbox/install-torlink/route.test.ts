import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Provision one seedbox, configure that same seedbox.
 *
 * The installer SSHes into the box named by ?id=, mints a bearer token there,
 * and stores it. Loading by id but saving without one wrote the token onto the
 * account's DEFAULT box instead: provisioning a second seedbox stamped its URLs
 * and token over the first one's config, while the box that had just been
 * provisioned kept no token at all. Both boxes end up broken, and nothing
 * errors — the install reports success.
 */
describe('install-torlink route', () => {
  it('saves the provisioned token against the seedbox it provisioned', async () => {
    const src = await readFile(new URL('./route.ts', import.meta.url).pathname, 'utf8');

    // One id, read once, used for both halves.
    expect(src).toContain("const seedboxId = new URL(request.url).searchParams.get('id')");
    expect(src).toContain('loadSeedboxForRequest(user.id, seedboxId)');
    expect(src).toMatch(/saveAccountSeedboxConfig\(\s*user\.id,[\s\S]*?seedboxId\s*\)/);

    // The id must never be read a second time; two reads is how they drift apart.
    expect(src.match(/searchParams\.get\('id'\)/g) ?? []).toHaveLength(1);
  });

  it('never saves seedbox config without naming a seedbox', async () => {
    // Every route that writes seedbox config has to say which one.
    for (const file of [
      '../route.ts',
      '../../seedboxes/[id]/route.ts',
      './route.ts',
    ]) {
      const src = await readFile(new URL(file, import.meta.url).pathname, 'utf8');
      for (const call of src.match(/saveAccountSeedboxConfig\([\s\S]*?\n\s*\);?/g) ?? []) {
        expect(call).toMatch(/\bid\b/);
      }
    }
  });
});
