/**
 * Run the dataset mirror up the storage ladder.
 *
 *   pnpm academic:mirror plan [--revenue <usd/mo>]   what fits on this rung, and whether to climb
 *   pnpm academic:mirror apply                        queue this rung's picks on the seedbox
 *   pnpm academic:mirror hash-cmd <infohash>          the command that hashes a finished download
 *   pnpm academic:mirror record <infohash> <sha256>   mark one mirrored (lists it in openfile.json)
 *   pnpm academic:mirror finish --host user@box        record finished, drop seederless, top up to budget
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

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { type Catalog, type CatalogEntry, type MirrorState, magnetFor, planMirror } from '../src/lib/academic/catalog';
import { hasSeeders, scrape } from '../src/lib/academic/scrape';
import { shouldClimb } from '../src/lib/academic/ladder';
import { isSellable } from '../src/lib/academic/license';
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

/** The tunnelled torlnk API. Kept apart from any output so the token never reaches a log. */
function torlinkConfig() {
  const http = buildHttpConfig({ baseUrl: process.env.SEEDBOX_URL ?? 'http://127.0.0.1:9161', token: process.env.SEEDBOX_TOKEN });
  return http ? { ...emptySeedboxConfig(), http } : null;
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
      const config = torlinkConfig();
      if (!config) {
        console.error('set the torlnk serve token in the environment first; see the header of this file');
        process.exit(1);
      }
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
    case 'finish': {
      const host = flag('--host');
      if (!host || !/^[\w.-]+@[\w.-]+$/.test(host)) throw new Error('finish --host user@box');
      const run = (script: string) => execFileSync('ssh', ['-o', 'BatchMode=yes', host, script], { encoding: 'utf8', maxBuffer: 64 << 20 });
      const b64 = (text: string) => Buffer.from(text).toString('base64');
      // The token never leaves the box: it is read from the daemon's environment and used there.
      // Bodies go over as base64 so no torrent name or magnet can break out of the remote shell.
      const torlnk = <T>(path: '/downloads' | '/add' | '/control', body?: object): T =>
        JSON.parse(
          run(
            'PID=$(systemctl --user show -p MainPID --value torlink-serve.service); ' +
              'TOK=$(tr "\\0" "\\n" < /proc/$PID/environ | grep ^TORLINK_API_TOKEN= | cut -d= -f2-); ' +
              (body
                ? `echo ${b64(JSON.stringify(body))} | base64 -d | curl -s -X POST localhost:9161${path} -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" --data-binary @-`
                : `curl -s localhost:9161${path} -H "Authorization: Bearer $TOK"`)
          )
        ) as T;
      const pause = () => new Promise((r) => setTimeout(r, 1000));
      const skip = (infohash: string, reason: string) => {
        const others = (mirror.skipped ?? []).filter((x) => x.infohash !== infohash);
        mirror.skipped = [...others, { infohash, reason, at: new Date().toISOString() }];
      };

      type Torrent = { id: string; name: string; status: string };
      const listing = torlnk<{ downloads: Torrent[]; seeds: Torrent[] }>('/downloads');
      const byHash = new Map(catalog.entries.filter((e) => isSellable(e.verdict)).map((e) => [e.infohash, e]));
      const have = new Set(mirror.mirrored.map((m) => m.infohash));

      // 1. Record what finished.
      const finished = listing.seeds.filter((t) => byHash.has(t.id) && !have.has(t.id));
      for (const t of finished) {
        const out = run(
          `P="$HOME/Downloads/done/$(echo ${b64(t.name)} | base64 -d)"; ` +
            'if [ -f "$P" ]; then sha256sum < "$P"; elif [ -d "$P" ]; then cd "$P" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 cat | sha256sum; else echo missing; fi'
        ).trim();
        const sha256 = out.split(/\s+/)[0];
        if (!/^[0-9a-f]{64}$/.test(sha256)) {
          console.log(`unhashed ${t.id}  ${t.name}: ${out.slice(0, 60)}`);
          continue;
        }
        mirror.mirrored.push({ infohash: t.id, sha256, mirroredAt: new Date().toISOString() });
        console.log(`record   ${t.id}  ${t.name}`);
      }
      mirror.usedBytes = Number(run('df -B1 --output=used "$HOME/Downloads" | tail -1').trim()) || mirror.usedBytes;

      // 2. Drop queued or downloading torrents nobody seeds: they hold a slot and never finish.
      const inFlight: CatalogEntry[] = [];
      for (const t of listing.downloads.filter((d) => byHash.has(d.id))) {
        const counts = await scrape(t.id);
        await pause();
        if (counts && !hasSeeders(counts)) {
          torlnk('/control', { id: t.id, action: 'remove' });
          skip(t.id, 'no seeders');
          console.log(`drop     ${t.id}  ${t.name} (0 seeders, ${counts.incomplete} leechers)`);
        } else {
          inFlight.push(byHash.get(t.id)!);
        }
      }

      // 3. Top up with the next datasets that fit and have seeders.
      let added = 0;
      for (const p of planMirror(catalog, mirror, inFlight).picks) {
        const counts = await scrape(p.infohash);
        await pause();
        if (!counts || !hasSeeders(counts)) {
          if (counts) skip(p.infohash, 'no seeders');
          continue;
        }
        const res = torlnk<{ ok?: boolean; error?: string }>('/add', { magnet: magnetFor(p) });
        const note = res.ok ? '' : ` ${res.error ?? ''}`;
        console.log(`${res.ok ? 'queue   ' : 'FAILED  '} ${p.infohash}  ${p.title} (${counts.complete} seeders)${note}`);
        if (res.ok) added++;
      }

      save(mirror);
      console.log(
        `${finished.length} finished, ${added} queued, ${inFlight.length} in flight, ` +
          `${mirror.mirrored.length} mirrored, ${(mirror.skipped ?? []).length} resting, ${tb(mirror.usedBytes)} used`
      );
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
