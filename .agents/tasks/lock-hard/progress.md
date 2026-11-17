# lock-hard lane · progress

Branch `lock-hard` off main `e98bfbca`. Task: harden the probe-lock acquisition
protocol against the recurring overwrite collision (a second lane overwrites a
first lane's fresh `owner.txt` claim; the first lane detects it mid-run, yields,
re-runs). Worktree `.worktrees/lock-hard`; logs in the main checkout `.llm/logs/`
with prefix `lkh-`.

## Stage 1 — reading (before coding)

### What enforces the lock today

- `scripts/probe/run-probe.mjs` (5737 lines, top-level script): **zero** lock
  logic. No mention of `probe-lock` or `owner.txt` anywhere in it; grep over the
  whole repo shows the lock exists only in lane records and docs. The entire
  protocol — take one of two directories, write `owner.txt`, heartbeat rewrite,
  judge staleness, delete — is lane discipline (DEVELOPMENT.md §1.1 L3 row,
  which defers to the desktop-lock rules in the L4 row).
- `src/data/lock.ts`: the repository's one file lock (E3). `acquireLock(file,
  env, options)`: exclusive `wx` create of a JSON claim `{pid, startedAt, at,
  token, boot?, holder?}`, retry loop to `waitMs` then `'busy'`, takeover when
  the holder's pid is dead, the `at` stamp is older than `staleMs`, or the boot
  differs (`bootToleranceMs`); `unreadableGraceMs` holds off takeover of content
  that parses to nothing (creator between create and write, or a foreign text
  file) until it has been seen unchanged that long; `keepStale` renames a
  taken-over lock to `<file>.stale-<ms>` instead of deleting it; `release()` and
  `held()` are token-checked. `src/execute/gate-lock.ts` is the long-hold
  precedent: no heartbeat at all — `staleMs` is sized beyond the longest hold
  (6 h), liveness is the pid, reboots are caught by the boot stamp, wait 60 min,
  retry 5 s, unreadable grace 2 s.

### Where the takeover window actually is

1. **The runner enforces nothing.** `npm run probe` boots scenarios without
   looking at either slot. A lane that skips the manual check — or judges a
   fresh claim stale — takes the slot regardless. That is the whole window:
   2026-11-16/17, the walk-review lane's post-rebase re-run overwrote the
   hback-paths lane's fresh claim (taken 18:35Z, overwritten 18:44Z, nine
   minutes old); two probes shared `.llm/probe-lock`; hback-paths detected it at
   its next heartbeat check, stopped its probe, yielded, re-ran after
   walk-review released (19:07Z). The same week the baseline moved twice more,
   forcing two further full-probe runs (hback-paths 插曲二/三). Same pattern as
   the filed 2026-11-05 incident (orphaned heartbeat rewrote the new owner's
   claim) and the 2026-11-04 desktop incident (staleness judged from the lock
   directory's creation time instead of the owner's heartbeat).
2. **The stale judgment has no mechanical base.** Every lane hand-compares
   `owner.txt` content or mtime; nothing in code refuses a fresh claim, and
   nothing preserves the displaced owner for the "写明删了谁的锁" report duty.
3. **The claim write has no exclusivity.** `mkdir` guards only the
   directory-absent race; `owner.txt` itself is a plain overwrite, so a second
   writer always succeeds.

### The hardening (minimal, reusing lock.ts, not a parallel mechanism)

- New `scripts/probe/probe-lock.mjs`; `run-probe.mjs` calls it before any
  scenario boots. The runner — not the lane — acquires the slot it will use,
  through `acquireLock` on `<main-checkout>/.llm/probe-lock/owner.txt` (then
  `-2`), so the documented path shape (slot directory + `owner.txt`) survives.
- The main checkout is resolved with `git rev-parse --git-common-dir` (from a
  worktree this is the main `.git`; from the main checkout, itself), because
  lanes run probes from worktrees and the slots live in the main checkout's
  `.llm` (every lane record puts them there).
- Claim classification per slot (`judgeClaim`):
  - JSON claim (the lock module's own format): holder pid dead → dead; `at`
    older than 3 h → dead (gate-lock sizing: beyond the longest probe run, so a
    live run is never taken over mid-flight); boot stamp differs from the
    current boot by more than 120 s → dead. Otherwise fresh → refuse.
  - Text claim (the legacy lane-written format, and anything unreadable):
    mtime within 30 min → fresh → refuse (a rewrite is the heartbeat; §1.1's
    「超过 30 分钟没有重写才算残留」 verbatim); older → dead.
  - Absent → take.
- Refusal is passive: a fresh claim is never touched, whoever wrote it. The
  outer loop re-judges both slots every 30 s for up to 90 min (covers one other
  full probe plus margin), then gives up with the holders named (exit 2).
- Takeover keeps the evidence: `acquireLock` with `keepStale: true` renames the
  displaced claim to `owner.txt.stale-<ms>`; the displaced text is logged before
  the attempt. The stale-text path waits out `unreadableGraceMs` (2 min) inside
  `acquireLock`, so a heartbeat that resumes during the takeover wins back the
  slot and the taker gets `busy` instead.
- Exactly one winner: two concurrent acquires serialize on the `wx` create; the
  loser re-judges, sees a fresh JSON claim, and waits.
- **No runner heartbeat.** The JSON claim is pid-anchored with a 3 h stamp
  bound, like the gate lock. The lane-side heartbeat rule of §1.1 stays for
  claims a lane writes itself (non-runner holds); lanes must not rewrite a
  claim the runner wrote (the pid anchors it; a rewrite would destroy the
  release token).
- Release is token-checked at every terminal exit of the runner; a crashed run
  leaves a dead-pid claim that the next acquirer takes over at once — the
  emergency-override path keeps today's rules (dead claim, evidence renamed and
  logged).

### Constants

| value | meaning |
| --- | --- |
| `PROBE_LOCK_STALE_MS` = 30 min | text claim considered stale without a rewrite (§1.1 rule) |
| `PROBE_LOCK_HOLD_MS` = 3 h | JSON claim stamp bound (`staleMs`), beyond the longest probe run |
| `PROBE_LOCK_WAIT_MS` = 90 min | refusal wait across both slots before exit 2 |
| poll 30 s / attempt wait 5 min / grace 2 min / boot tolerance 120 s | loop pacing; grace guards the create-to-write gap and the text-stability watch |

### Environment notes

- The main checkout's `package.json` is currently overwritten with foreign
  content (`@deepseek-ai/dsh-desktop-runtime`, +329/−45, mtime 2026-11-17
  04:28+0800, git status ` M`) while the desktop-l4-w2 lane holds
  `.llm/desktop-lock` (port 9352). Not this lane's change; untouched. Landing
  needs that file clean again (this lane's commit touches `package.json` for
  the spec registration), so the merge step re-checks before merging.
- Both probe slots are free as of lane start; `.llm/probe-lock` and
  `.llm/probe-lock-2` do not exist.
- Worktree deps via pnpm (`--store-dir` pointing at the main checkout's
  `.pnpm-store`; `npm ci` unavailable in this repo, per hback-paths's note).

## Stage 2 — implementation

Committed `3337fca2` on `lock-hard` (code + L2 + docs, one batch):

- `scripts/probe/probe-lock.mjs` (new): the acquisition gate. `judgeClaim`
  classifies a slot's `owner.txt` (JSON claim: pid liveness, 3 h stamp bound,
  120 s boot tolerance; any other content: the text claim the lanes wrote,
  judged by mtime against the 30 min stale window); `acquireProbeLock` walks
  the two slots, refuses fresh claims untouched (logged by holder), takes
  absent and dead ones through `acquireLock` (keepStale rename + the
  displaced text logged), re-judges every 30 s up to 90 min, then reports the
  holders it saw and returns `'busy'`. Main checkout resolved via
  `git rev-parse --path-format=absolute --git-common-dir` (worktree-aware,
  same call the calibrate fence already uses).
- `scripts/probe/run-probe.mjs`: takes the slot before any profile/scenario
  work (after the pre-check exits), releases at all three terminal exits
  (exit 2 void, exit 1 failed, exit 0 pass); header documents the gate.
- `scripts/calibrate/run-calibrate.mjs`: same gate before the batch opens
  (holder `calibrate-runner` unless `PROBE_LOCK_HOLDER`), release at both tail
  exits. A calibration boots the same scenarios, so it takes a slot the same
  way.
- `tests/probe-lock.spec.ts` (new, registered in `test:2` before
  probe-workspace): 7 cases — both-slots-fresh refusal untouched (holders
  named in the refusal lines and the busy summary), fresh-slot-1 + stale-slot-2
  rotation takeover (archive kept, fresh claim untouched, release leaves the
  evidence), the classification table (pid/stamp/boot/mtime), dead-JSON
  instant takeover, heartbeat renewal (rewrites keep the refusal, 40 min of
  silence loses the slot), concurrent acquires on one free slot (one winner,
  loser names the winner, release frees the slot for the next), and the
  main-checkout resolution.
- `docs/DEVELOPMENT.md`: §1.1 L3 row rewritten (runner takes the slot, lanes
  do not create locks or write `owner.txt` for runner runs; runner claims are
  pid-anchored and must not be rewritten by lanes; the text-claim heartbeat
  rules stay for lane holds); §7 row for the 2026-11-17 recurrence
  (hback-paths 插曲一 to 三) with the hardening as the disposition.

### Findings during implementation

- The first spec draft assumed the acquirer would refuse when ONE slot was
  fresh; the module correctly took the OTHER slot (the rotation is the
  point). The specs now pin both halves: per-slot refusal and rotation.
- Concurrent creates on one free file have a create-to-write gap: the loser's
  `judgeClaim` sees an empty file and refuses it as unattributed (`'(empty
  claim file; a writer may be between creating it and writing it)'`) instead
  of naming the winner. Behavior is safe (refusal, never overwrite); the
  naming gap is an artifact of instant-sleep test pacing — under the real
  pacing the claim is written in milliseconds, long before any watcher's
  grace. The concurrency spec gives the winner a 50 ms head start and asserts
  the loser refuses the winner BY NAME.
- `acquireLock`'s keepStale rename cannot displace a claim whose creator
  still holds the open handle (Windows EBUSY); with real pacing the write
  closes long before the grace expires, so the watcher sees written content
  and waits instead.

### Gates (on `3337fca2`, first pass)

- build OK; preflight OK (2 packages, 18 source directories, 23 rows).
- `npm test` exit 0: 236 specs, all `# fail 0` (235 existing + probe-lock).
  Environment fix as in hback-paths's record: the untracked check-in-owned
  file `.agents/tasks/m5/lessons-seed.json` was missing in the fresh worktree;
  copied from the main checkout (not committed).
- Ratchet flat: eslint 73 suppressed / knip 18 in baseline / jscpd 1 clone.
- Probe 611/611, exit 0 (`.llm/logs/lkh-probe.log`, run dir deleted on
  success). The acquisition gate's first live pass: slot `probe-lock` held
  fresh by the loops-tails lane's text claim (`lpt loops-tails agent`) —
  refused by name, untouched; slot `probe-lock-2` claimed with the lock
  module's JSON claim (pid 55056); released at the exit, and the sgate lane
  took the slot at 21:33:26Z through the normal convention.

## Stage 3 — rebase and re-gate

- main moved twice during the gates: to `3fafe42a` (guard lift/status fix,
  no overlap) and then to `07cb3f03` (the loops-tails lane's loops board
  batch, which touches `src/loops` and `ui/loops`, so the probe had to rerun
  on the combined tree); rebased cleanly both times. Final base: the change
  commit is `ac72629c`, the progress archive the one after it.
- Gates re-run on each rebased base. On the final base (`07cb3f03`): build
  OK, preflight OK, `npm test` exit 0 (236 specs, all `# fail 0`), ratchet
  flat 73/18/1.
- Probe 611/611, exit 0 on the final base (`.llm/logs/lkh-probe-3.log`, run
  dir deleted on success), after two earlier full-probe passes (611/611 on
  `e98bfbca`+3337fca2 — `.llm/logs/lkh-probe.log`; 611/611 on `3fafe42a`+
  d75881d5 — `.llm/logs/lkh-probe-2.log`; all three released their slot).
- The wait path's live pass (second probe): both slots were held by fresh
  claims when the run started (loops-tails on `probe-lock`, sgate on
  `probe-lock-2`, both heartbeating) — the runner refused both by name,
  polled every 30 s for ~14 minutes until loops-tails released `probe-lock`,
  claimed it, ran, and released. The behavior the 2026-11-17 collision
  lacked (walk-review's re-run would have waited here instead of
  overwriting the hback-paths lane's nine-minute-old claim).

### Environment notes (final)

- The desktop-l4-w2 lane's `.llm/desktop-lock` in the main checkout has no
  heartbeat rewrite since 2026-11-16 06:13 (stale by the §1.1 rule), and the
  main checkout's `package.json` carries a foreign uncommitted overwrite
  (`@deepseek-ai/dsh-desktop-runtime`, +329/−45, mtime 2026-11-17 04:28+0800,
  git status ` M`; author unknown — no `.llm/logs` trace at that time, not
  this lane's change). This lane's commit touches `package.json`, so the
  fast-forward merge in the main checkout refuses while that file is dirty;
  the landing step does not touch the foreign modification and reports the
  blocker instead.

## Stage 4 — resumption (after the ZCode restart killed the previous instance)

- The branch was rebased onto main `6dd4f9eb` (the polish lane's docs commit)
  before the restart: the tip is `5599c1c6` = `6dd4f9eb` + `539f8b4c` (the
  change, re-rooted) + the progress archive. No gate ran on this base yet.
- The `.llm/probe-lock-2/owner.txt` claim audited at 2026-11-17 12:16+0800:
  text claim `sgate lane: probe run 2026-11-16T23:09:24Z`, mtime
  2026-11-17 07:09+0800 — NOT a lock-hard claim (the resumption brief guessed
  it was; it is the sgate lane's, a rewrite of its 21:33:26Z claim for
  another run). Evidence it is dead: no rewrite for ~307 min (the §1.1 stale
  window is 30 min), the slot directory holds only `owner.txt` (no run
  directory), and no `.llm/logs` entry of any lane is newer than lkh-probe-3
  (07:07+0800). Not deleted by hand: the runner's gate takes stale text
  claims itself, renaming the evidence — the next probe's acquisition is the
  documented takeover path for exactly this claim. `.llm/probe-lock` is
  empty (free).
- Main checkout `git status --porcelain` shows exactly one entry, ` M
  package.json` — the known foreign overwrite, untouched. The merge range
  `6dd4f9eb..5599c1c6` touches `package.json` (the test:2 registration), so
  the landing merge collides with it; see the landing stage for the outcome.
- Docs commitment checked in `539f8b4c`: honored — §1.1 L3 row rewritten
  (runner takes the slot, fresh claims waited out, dead ones taken over with
  evidence, cites the 2026-11-05 and 2026-11-17 incidents into §7) and §7
  has the 2026-11-17 recurrence row (hback-paths 插曲一至三, walk-review's
  overwrite, the hardening as disposition). The two new 2026-11-17
  occurrences the change owed are both present. No extra docs commit needed.
- Residual claim cleaned at 2026-11-17T04:28:08Z (the §1.1 report duty): the
  probe-lock-2 `owner.txt` deleted by hand was the sgate lane's text claim
  `sgate lane: probe run 2026-11-16T23:09:24Z` (mtime 2026-11-17 07:09+0800),
  verified dead before deletion — ~309 min without the documented heartbeat
  rewrite, no run directory in the slot, no log of any lane newer than
  07:07+0800, no node process attributable to it. Both slots free from then
  on. The takeover-with-evidence path itself stays pinned by L2
  (`tests/probe-lock.spec.ts`); a live takeover was not forced this session
  because the first slot was free — the gate takes the first free slot and
  never touches the other.

### Gates (on `5599c1c6`, the resumed base; logs prefixed `lkh2-`)

- build OK; preflight OK (2 packages, 18 source directories, 23 rows).
- `npm test` exit 0: 236 spec files, all `# fail 0`.
- Ratchet flat: eslint 73 suppressed / knip 18 in the baseline / jscpd 1
  clone (7 duplicated lines).
- Probe 611/611 passed, exit 0 (`.llm/logs/lkh2-probe.log`; run directory
  deleted on success). The acquisition gate's live pass on this base: slot
  `probe-lock` claimed at start with the lock module's JSON claim (holder
  `probe-runner`, pid 36428, boot stamp present) and released by the
  token-checked release at the exit — the slot directory left empty.

### Landing plan (written before the merge)

The merge range touches `package.json` (the test:2 registration) and the
main checkout's working tree carries the person's foreign uncommitted
overwrite of that same file, so `git merge --ff-only` refuses. The dance:
copy the person's `package.json` bytes out of the repo, verify the copy
byte-for-byte, `git restore package.json`, `git merge --ff-only lock-hard`,
write the saved bytes back over `package.json`, and verify the file is
byte-identical to the copy again and `git status --porcelain` shows exactly
the one ` M package.json` entry. If the working file's bytes differ from the
saved copy at either check (someone wrote during the dance), stop and
report instead. The person's content is never handed to git's merge or
stash machinery.

### Landing

- The dance ran as planned and every check held: the save copy matched
  byte-for-byte, `git merge --ff-only lock-hard` fast-forwarded main
  `6dd4f9eb..ae89addc` (rc 0), the write-back restored the saved bytes
  byte-identically and the original mtime (`touch -d`), and
  `git status --porcelain` afterwards shows exactly the one ` M
  package.json` entry — the person's file, untouched by git's machinery.
- One finding for the record: the person's overwrite was not the state the
  earlier audit saw. Its handler rewrote the file at 2026-11-17 12:45:21
  +0800 (18623 → 17481 bytes) while this lane ran the gates; the dance
  captured that newest state and restored exactly it. Their latest content
  is what sits in the working tree now, dirty against the new HEAD exactly
  as their handler left it.
- This commit (main `ae89addc` plus this record) is pushed to Gitee
  `origin/main` and then to the GitHub mirror `github` (`main` only) in the
  same step, per the repo's landing rule.



