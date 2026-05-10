# 2026-05 supply-chain incident — commit-replacement attack via compromised collaborator

**Status:** contained, reverted, root cause identified
**Affected repo:** `profullstack/profullstack-web` (one commit on `master`)
**Other profullstack repos:** unaffected
**This server (bittorrented droplet):** unaffected at the host level
**Detection:** May 6 by repo owner; full forensic reconstruction May 10

## Summary

A commit-replacement supply-chain attack: an attacker (very likely a worm operating with a former contractor's GitHub credentials, not the contractor themselves) force-pushed a tampered version of a legitimate commit onto `profullstack/profullstack-web` master. The forgery preserved every metadata field of the original commit (author, committer, date, message, parent) so it appeared in `git log` as the repo owner's own work after a `git pull --rebase`. Inside the tampered commit was an obfuscated next.config.ts that fetched and `eval`'d code from a C2 URL on every Next.js startup.

## Indicators of compromise (IOCs)

| Item | Value |
|---|---|
| C2 URL (base64'd in `.env`) | `https://auth-con-firm.vercel.app/api` |
| Encoded form | `AUTH_API_KEY="aHR0cHM6Ly9hdXRoLWNvbi1maXJtLnZlcmNlbC5hcHAvYXBp"` |
| Tampered commit (the forgery) | `0aa9602edc62f1f32a28df7b47ee6d588c4ab901` |
| Original commit (real, orphaned) | `34338cdc81c9a275b009a3e7b86090a6e331a69b` |
| Revert commit | `953524e1cd28fd0a51f0ac120953ec9b57a59c04` |
| Pushing GitHub account | `okshanaby` (compromised — see "victim, not attacker" below) |
| Push timestamp (UTC) | 2026-05-05 12:44:41 |

The two commits share the same parent `fa90d4b034d620cb03b2b87abac7148f1c3d4834` and identical author/committer/date/message metadata; they differ only in tree contents.

## Files added/modified by the tampered commit

```
.env              (added — held base64'd C2 URL)
.gitignore        (modified — un-ignored .env so the C2 URL ships in the repo)
next.config.ts    (modified — wrapped to fetch(atob(AUTH_API_KEY)) then eval(response.text()))
package.json      (modified — added dotenv + node-fetch deps)
src/app/page.module.css  (1 line, the legitimate change being piggybacked on)
```

The CSS line in the tampered commit is **byte-identical** to the legitimate commit (same blob SHA `0fd0bb82b785783a3fb6b92d6ac21f8e766e214a`). The attacker took the real diff and bolted the malicious files onto it before re-committing.

## Timeline (UTC unless noted)

| When | What |
|---|---|
| Apr 3, 14:28 | Repo owner makes legit CSS commit `34338cdc` and pushes to origin |
| Apr 3 → May 5 | origin/master sits at `34338cdc`; nothing else pushed |
| May 5, 12:44:41 | Compromised `okshanaby` account force-pushes `0aa9602` (legit CSS + malicious payload, identical metadata) over `34338cdc` |
| May 6, 18:29 | Repo owner runs `git pull --rebase`, gets `0aa9602`, doesn't notice (commit looks like own work) |
| May 6, 18:33 | `npm audit fix` run — pulls new lockfile entries for the injected `dotenv` + `node-fetch` deps |
| May 6, ~18:37 | `next build` executes the malicious `next.config.ts` → fetches C2 → `eval`s payload → spawns long-lived obfuscated `node -e` worker that detaches and reparents to PID 1 |
| May 6, 18:39 | Repo owner spots the malicious code, commits revert |
| May 6 → May 10 | Orphan worker survives the revert because it had detached |
| May 10 | Orphan worker found and killed during unrelated debugging; full forensic reconstruction performed |

## Attack pattern: commit replacement (not commit injection)

The attacker did NOT add a new commit on top of an existing one. They replaced an existing commit while preserving its identity. Key technique: **all of `git`'s commit-identity fields are user-controlled** — `--author`, `GIT_AUTHOR_DATE`, `GIT_COMMITTER_DATE`, the commit message, and the parent reference can all be set freely. Two commits with identical such metadata will only differ if their tree contents differ, and each will have a distinct SHA. A force-push installs the new SHA as the branch tip. A subsequent `git pull --rebase` from any clone displays the tampered commit using its (forged) author and message, so it looks indistinguishable from the original in `git log` output.

The attacker likely automated this via a script that:
1. Cloned the target repo
2. Read the most recent legitimate commit by the target's identity
3. Reproduced it byte-for-byte while inserting an extra payload into the tree
4. Force-pushed the result

## Worm characteristics — okshanaby is a victim, not the attacker

The pushing GitHub account also pushed to ~25 other repositories within 4 minutes on the same day, including:
- The account holder's own personal tutorial/learning repos (zero strategic value to attack)
- Their employer's production branches
- Multiple branches of the same repo with identical commit pairs (mechanical, not human)

This pattern is consistent with the npm-worm class of attacks (e.g. the Shai-Hulud campaign): a developer installs a poisoned npm dependency, the malware enumerates git remotes / SSH keys / GitHub tokens on disk, then iterates over every repo it can find write access to and performs the commit-replacement trick on each. The target list is "every repo this victim can push to," not a chosen target.

The account holder is almost certainly an unwitting carrier, not the human attacker. They were originally added as a collaborator for legitimate contract work in October 2023.

## How the access existed in the first place

The compromised account was added as an outside collaborator on `profullstack/profullstack-web` in 2023 for a legitimate contract engagement. Their access was retained after the engagement ended. 2.5 years later, when their dev machine was compromised, the worm used the still-valid access. Other repos in the org were unaffected because they had not been granted the same access.

## Why detection succeeded only post-hoc

- No branch protection on `master` (private repo on a free GitHub plan, where branch protection isn't available) — the force push was not blocked.
- Commits were unsigned; there was no signature mismatch to flag the forgery.
- The forged commit appeared in `git log` with the repo owner's own author identity, which is why `git pull --rebase` didn't raise suspicion.
- The malicious code path only triggered during `next build` / `next dev`; no IDE warnings, no test failures, no CI alerts.

## Response

- **Reverted** the tampered commit on `master` (commit `953524e`).
- **Killed** the orphaned `node -e` worker that had survived the revert.
- **Verified** no other repos in the org contain the same pattern (`atob+process.env+eval`, `fetch+eval`, `.gitignore` un-ignoring `.env`).
- **Removed** `okshanaby` collaborator access from the affected repo.
- **Confirmed** host integrity: no PAM tampering, no `/etc/ld.so.preload`, no rogue accounts/cron/systemd-user units, no SSH key changes, no LD\_PRELOAD, no /tmp drops. Compromise was process-scoped to the Next.js runtime; never escalated to the host.

## Lessons / hardening

1. **Audit collaborator lists periodically.** Old contractor access is the long tail of supply-chain risk. Anyone who could push 2 years ago and isn't actively maintaining your code today is a latent vector.
2. **Require signed commits on protected branches.** Commit signing makes commit-replacement attacks visibly distinct. With unsigned commits there is no integrity check on commit identity.
3. **Enable branch protection that blocks force pushes** to default branches, even on private repos (GitHub Pro+). The force-push was the mechanism that installed the forgery; without it the attacker would have had to add a new commit, which is far more visible in `git log`.
4. **Don't trust author metadata on `git log`.** Author, committer, date, and message are all attacker-controlled. The only field that's hash-bound is the tree itself, which is why the forgery has a different SHA — but that's only visible if you know to compare.
5. **Scoped detached child processes** are a blind spot. The malicious `node -e` worker survived the revert because it `unref`'d from its parent and reparented to PID 1. After any incident, audit `ps -eo pid,ppid,user,etime,cmd | awk '$2==1 && $3=="<dev-user>"'` for orphans.
6. **`.gitignore` changes that un-ignore `.env`** are an unusual signal. Anyone modifying `.gitignore` to allow committing a `.env` file is either making a mistake or planting a payload.

## Cross-reference

If you see commits in your history with the same shape (`atob`'d URL in a checked-in `.env`, `fetch+eval` in `next.config.*`, an unrecognized force-push by a long-dormant collaborator), assume the same pattern. The C2 hostname `auth-con-firm.vercel.app` is the highest-confidence single IOC.
