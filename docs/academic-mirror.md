# Academic Torrents dataset mirror

Members get fast access to datasets from academictorrents.com that we are allowed to sell, kept on our
seedbox and published as an [OpenFile](https://logicsrc.com/openfile) descriptor at
`/.well-known/openfile.json`. The rest stay out.

## What we may sell

Academic Torrents is a tracker, not a rights holder. Each entry's own licence decides it
(`src/lib/academic/license.ts`):

| Verdict | Licences | OpenFile `attestation.basis` |
|---|---|---|
| `public-domain` | CC0, PDDL, US government works | `public-domain` |
| `attribution` | CC-BY, ODC-By, MIT, Apache-2.0, BSD (CC-BY-ND: verbatim copies only) | `open-license` + SPDX `license` |
| `share-alike` | CC-BY-SA, ODbL, GPL family. Sellable, but buyers may re-share it for free | `open-license` + SPDX `license` |
| `no` | Anything NC, research-only, unstated, unrecognised, or detected with less than high confidence | not listed |

The site's "UNSPECIFIED" (most entries) is `no`. A false "no" costs one dataset. A false "yes" costs
statutory damages per work. Never hand-edit a verdict to `yes`. Add the licence to the gate, with a test.

## The storage ladder

`src/lib/academic/ladder.ts`: Fibonacci rungs 2 → 3 → 5 → 8 → 13 → 21 → 34 → 55 → 89 → 144 → 233 →
377 → 610 TB. Fill the rung to 90% with sellable entries (datasets before courses, smallest first).
Climb only when the rung is 80% used **and** monthly revenue covers the next rung at
~$2/TB-month. Full but unpaid means wait.

## Running it

```sh
pnpm academic:catalog                 # refresh catalog.json (resumable licence crawl, ~1 req / 1.5 s)
pnpm academic:mirror plan --revenue 40
ssh -N -L 9161:localhost:9161 seed &  # torlnk serve listens on the box's localhost only
SEEDBOX_TOKEN=... pnpm academic:mirror apply
pnpm academic:mirror hash-cmd <infohash>   # run what it prints once the download is done
pnpm academic:mirror record <infohash> <sha256>
pnpm academic:mirror set used <bytes>      # `df -B1` on the box
```

Commit `src/data/academic/*.json` after a run. Deploying lists the newly recorded files. A
re-crawl that flips a licence to `no` delists the file on the next deploy.

## Why only mirrored files are listed

OpenFile's `files[].id` is a SHA-256 of the bytes, and Academic Torrents publishes only the v1
infohash. For a multi-file torrent the id is the SHA-256 of its files concatenated in byte-sorted
path order (`hash-cmd` prints exactly that). Access is a yearly bittorrented membership, which
OpenFile's `price.per` cannot express, so it travels under the `bittorrented` key and `price` is
left absent.
