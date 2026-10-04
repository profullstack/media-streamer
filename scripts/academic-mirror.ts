/**
 * Run the dataset mirror up the storage ladder.
 *
 *   pnpm academic:mirror plan [--revenue <usd/mo>]   what fits on this rung, and whether to climb
 *   pnpm academic:mirror apply                        queue this rung's picks on the seedbox
 *   pnpm academic:mirror hash-cmd <infohash>          the command that hashes a finished download
 *   pnpm academic:mirror record <infohash> <sha256>   mark one mirrored (lists it in openfile.json)
 *   pnpm academic:mirror set capacity <tb> | used <bytes>
 *
 * `apply` speaks torlnk's HTTP API, which only listens on the box's localhost,
 * so open a tunnel first and pass the daemon's token:
 *
 *   ssh -N -L 9161:localhost:9161 seed &
 *   SEEDBOX_TOKEN=... pnpm academic:mirror apply
 *
 * Nothing is deleted and nothing is bought here: climbing a rung is a purchase,
 * so `plan` only says when the numbers justify it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { type Catalog, type MirrorState, magnetFor, planMirror } from '../src/lib/academic/catalog';
import { shouldClimb } from '../src/lib/academic/ladder';
import { buildHttpConfig, emptySeedboxConfig } from '../src/lib/seedbox/config';
import { sendTorrentToSeedbox } from '../src/lib/seedbox/send';

const CATALOG = 'src/data/academic/catalog.json';
const MIRROR = 'src/data/academic/mirror.json';

const load = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const save = (state: MirrorState) => writeFileSync(MIRROR, `${JSON.stringify(state, null, 2)}\n`);
const tb = (bytes: number) => `${(bytes / 1e12).toFixed(3)} TB`;

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at > -1 ? process.argv[at + 1] : undefined;
}

async function main() {
  const [command, ...args] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  const catalog = load<Catalog>(CATALOG);
  const mirror = load<MirrorState>(MIRROR);

  switch (command ?? 'plan') {
    case 'plan': {
      const plan = planMirror(catalog, mirror);
      console.log(`rung ${plan.rungTb} TB, ${tb(mirror.usedBytes)} used, ${tb(plan.budget)} to fill`);
      console.log(`${plan.picks.length} sellable entries fit (${tb(plan.bytes)}):`);
      for (const p of plan.picks) console.log(`  ${p.infohash}  ${tb(p.size).padStart(10)}  ${p.license?.canonical ?? '-'}  ${p.title}`);
      const revenue = Number(flag('--revenue') ?? 0);
      const advice = shouldClimb(mirror.capacityTb, mirror.usedBytes + plan.bytes, revenue);
      console.log(`\nclimb to ${advice.next ?? '-'} TB? ${advice.climb ? 'yes' : 'no'}: ${advice.reason}`);
      return;
    }
    case 'apply': {
      const http = buildHttpConfig({ baseUrl: process.env.SEEDBOX_URL ?? 'http://127.0.0.1:9161', token: process.env.SEEDBOX_TOKEN });
      if (!http) throw new Error('SEEDBOX_TOKEN is required (the torlnk serve token; see the header of this file)');
      const config = { ...emptySeedboxConfig(), http };
      for (const p of planMirror(catalog, mirror).picks) {
        const result = await sendTorrentToSeedbox(magnetFor(p), p.title, 'http', config);
        console.log(`${result.ok ? 'queued' : 'FAILED'}  ${p.infohash}  ${p.title}${result.ok ? '' : `  ${result.message ?? ''}`}`);
      }
      console.log('\nWhen each finishes: hash-cmd, then record, then set used.');
      return;
    }
    case 'hash-cmd': {
      const [infohash] = args;
      const entry = catalog.entries.find((e) => e.infohash === infohash);
      if (!entry) throw new Error(`${infohash} is not in the catalog`);
      const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
      const remote = `cd ~/Downloads/done && cd -- ${q(entry.title)} && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 cat | sha256sum`;
      console.log(`ssh seed ${q(remote)}`);
      console.log('# check the folder name with `ls ~/Downloads/done` first; torrents name their own root.');
      return;
    }
    case 'record': {
      const [infohash, sha256] = args;
      if (!catalog.entries.some((e) => e.infohash === infohash)) throw new Error(`${infohash} is not in the catalog`);
      if (!/^[0-9a-f]{64}$/.test(sha256 ?? '')) throw new Error('sha256 must be 64 hex characters');
      mirror.mirrored = mirror.mirrored.filter((m) => m.infohash !== infohash);
      mirror.mirrored.push({ infohash, sha256, mirroredAt: new Date().toISOString() });
      save(mirror);
      console.log(`recorded ${infohash}; it is listed in /.well-known/openfile.json from the next deploy`);
      return;
    }
    case 'set': {
      const [key, value] = args;
      if (key === 'capacity') mirror.capacityTb = Number(value);
      else if (key === 'used') mirror.usedBytes = Number(value);
      else throw new Error('set capacity <tb> | set used <bytes>');
      save(mirror);
      console.log(`${key} = ${value}`);
      return;
    }
    default:
      throw new Error(`unknown command ${command}; see the header of scripts/academic-mirror.ts`);
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
