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

/**
 * The settings form holds one box's values in component state. Between choosing
 * a different box and its GET returning, what is on screen still belongs to the
 * previous one — and a save in that window writes the previous box's host, user
 * and ports onto the newly selected box.
 *
 * That is not hypothetical: it scrambled two real seedboxes, pointing one at the
 * other's address while leaving the other with no token. Nothing errors; the
 * save succeeds, against the wrong row.
 */
describe('seedbox settings form', () => {
  it('refuses to save until the loaded values belong to the selected box', async () => {
    const src = await readFile(
      new URL('../../../../settings/seedbox-section.tsx', import.meta.url).pathname,
      'utf8',
    );

    // It must track which box the on-screen values came from...
    expect(src).toContain('setLoadedFor(seedboxId ?? null)');
    expect(src).toContain('const ready = loadedFor === (seedboxId ?? null)');
    // ...refuse the write itself, not merely grey out the button...
    expect(src).toMatch(/if \(!ready\) \{[\s\S]*?return;/);
    // ...and disable it too.
    expect(src).toContain('disabled={saving || !ready}');
  });
});
