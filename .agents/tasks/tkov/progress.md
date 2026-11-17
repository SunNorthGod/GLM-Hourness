# tkov — takeover-mutex lane progress

Branch `tkov` off main `0c5ebd21`, worktree `.worktrees/tkov`.
Task: post-wave audit F1 (`.agents/tasks/postwave-audit/findings.md` §F1) — `.takeover` mutex double-hold.

## Stage 0 — reading (before coding)

### The takeover section, whole

`src/data/lock.ts` two cooperating pieces:

1. `withTakeoverLock` (lines 154–176): serializes stale-lock takeover of `targetFile`
   via an exclusive sidecar `targetFile.takeover`.
   - try `open(takeoverFile, 'wx')` → success = mutex held;
   - on failure, `stat(takeoverFile)`; if `Date.now() - mtimeMs > staleMs` (default 5s)
     → `unlink(takeoverFile)` then re-`open(wx)`;
   - both paths failing → `{acquired: false}` for the round (caller retries);
   - `finally` unlinks `takeoverFile`.
2. The eviction site in `acquireLock` (lines ~254–274): under `withTakeoverLock`, re-`stat`
   the lock file and compare the quadruple `mtimeMs/birthtimeMs/size/ino` against the read
   `holder`; only on a quadruple match `rename(file, <file>.trash-<uuid>)` (or
   `.stale-<now>` with `keepStale`) — atomic — then unlink the trash. `removed` gates the retry.

The stat-quadruple recheck + atomic rename inside the mutex is the real safety net for the
lock file itself; F1 does not touch it and this lane keeps it intact.

### Root cause of the F1 double-hold

`unlink` acts on the **path**, not on the file that was `stat`ed. Interleaving:

1. X: `open(wx)` → EEXIST; `stat` says stale (leftover of a crashed holder).
2. Y: same, `stat` says stale (the same leftover), before X unlinks.
3. X: `unlink` removes the leftover; `open(wx)` succeeds — X holds the mutex, action runs.
4. Y: `unlink` — deletes **X's fresh file** (path now resolves to X's file, mtime fresh,
   but Y already made its evict decision from the stale observation); `open(wx)` succeeds —
   Y holds it too.

Both enter the takeover action concurrently. Harm bounded today by the quadruple recheck
(the second contender's action finds the lock file gone or changed and renames nothing),
but the mutex promise is broken and a fresh `.takeover` is destroyed by a contender that
only ever observed the stale one. Secondary liveness blip (ENOENT between unlink and
re-create → `acquired:false` for the round) is pre-existing and benign.

### Fix (derived from the existing machinery)

Same pattern the lock-file eviction already uses: re-verify the stat before evicting, and
evict by atomic `rename` to a unique trash name instead of `unlink`:

```ts
if (takeoverInfo !== undefined && Date.now() - takeoverInfo.mtimeMs > staleMs) {
  const current = await stat(takeoverFile).catch(() => undefined)
  if (current !== undefined
    && current.mtimeMs === takeoverInfo.mtimeMs
    && current.birthtimeMs === takeoverInfo.birthtimeMs
    && current.size === takeoverInfo.size
    && current.ino === takeoverInfo.ino) {
    const trash = `${takeoverFile}.trash-${randomUUID()}`
    await rename(takeoverFile, trash).then(() => unlink(trash).catch(() => {}), () => {})
  }
  takeoverHandle = await open(takeoverFile, 'wx').catch(() => undefined)
}
```

Correctness walk:

- Rename moves **the observed stale file** (path still resolves to it at rename time iff
  nobody replaced it) or fails ENOENT; a fresh file created by another contender is never
  destroyed — the re-stat sees its fresh identity and the evict branch is skipped.
- Two contenders re-stat the same stale file: both renames race, exactly one succeeds, the
  other gets ENOENT; then exactly one `open(wx)` succeeds (either the evictor's re-create or
  the other contender's create in the rename→re-create gap). The mutex is held by exactly one.
- `Date.now()` (not injected clock): matches the current implementation of
  `withTakeoverLock`, which takes no environment; unchanged.
- Trash is unlinked right after (empty file; crash window leaves a `.takeover.trash-<uuid>`
  orphan — same cosmetic class as F10 on the lock file, no functional impact: staleness is
  judged on `.takeover` only).
- Quadruple (not mtime only) to match the eviction site's re-verify style; the
four-way same-millisecond + ino-reuse collision stays negligible, as the audit accepts.

Docs: no doc describes the `.takeover` mutex (`grep -rn '\.takeover\|withTakeoverLock' docs/`
→ no hits; DESIGN/ORCHESTRATION "takeover" hits are the unrelated bootstrap takeover).
No doc change needed.

### Test design (L2, deterministic replay — red before the fix, green after)

New `tests/data-lock-takeover.spec.ts` (withTakeoverLock had no direct spec; the fs-patch
mechanism follows `tests/data-journal.spec.ts:355` — assign the wrapper on
`fs.promises.unlink`, call `syncBuiltinESMExports()`, then restore + re-sync).

Key trick: patch `fs.promises.unlink` so the **first** unlink whose path is the takeover
file itself parks on a promise (later ones run at once). This deterministically replays the
interleaving for both the old and the new implementation:

- old impl: contender Y parks just before its evict-unlink (its stale observation already
  made); contender X then runs, evicts, creates, enters its action; test releases Y's
  parked unlink → Y deletes X's fresh file → Y creates → **both actions run** → assertion
  "exactly one enters" fails (red = reproduction).
- new impl: Y's evict is rename-based; no unlink of the takeover path happens during the
  evict, so nothing parks; Y acquires, X sees a fresh file → `acquired:false` → exactly one
  action (green).

The X-start trigger is `Promise.race([parkedUnlinkReached, yEnteredAction])`: old impl the
park fires first; new impl Y just acquires and enters. Both proceed without deadlock.
Assertions: exactly one `acquired:true`, `maxInside === 1`, plus the cleanup assertions
(no `.takeover`, no `.trash-*` left after release) and a fresh-`.takeover`-is-respected
regression case.

Register the spec in `package.json` `test:2` next to `data-journal.spec.ts`.

## Stage log

- Stage 0 done (reading above).

- Stage 1: spec written — `tests/data-lock-takeover.spec.ts`, three cases.
  Red verified 3/3 runs on the unfixed implementation: `exactly one contender
  enters the takeover section, got: x,y`. The deterministic replay parks the
  first unlink of the mutex path; the parked contender's unlink really deletes
  the fresh file the other contender created while it waited (an earlier
  wrapper draft returned without unlinking and silently skipped the evict —
  the diagnostic run caught it; the parked unlink must really run).
- Stage 2: fix applied — re-verify the stat quadruple right before eviction,
  evict by atomic rename to `.takeover.trash-<uuid>` and unlink the trash,
  then re-attempt the exclusive create either way. Spec green 5/5 runs.
  Registered in `package.json` `test:2` ahead of `data-journal.spec.ts`.
- Stage 3: gates on the branch (pre-rebase): build OK, preflight OK, full
  `npm test` green. eslint: 4 new findings fixed (one redundant type assertion
  on the patched unlink, three `require-await` actions), back to the 69
  baseline; knip 18, jscpd 1 unchanged. Test-env note: the worktree needed the
  git-ignored `.agents/tasks/m5/lessons-seed.json` copied from the main
  checkout for `tests/lessons-seed.spec.ts`.
- UNFREEZE received: main at 4a9750af (answer-race fix 06af9bc5, touches
  `src/execute/brief.ts` — no overlap). Next: commit, rebase, gates, probe
  612/612, ff-merge, push origin/main + github main.
- Rebased onto main 4a9750af: branch commit is aeb94f4d (was f200cc3f).
  Gates re-run on the rebased branch: build OK, preflight OK, full `npm test`
  green (log has zero `not ok`; eslint ok at 69 suppressed, knip ok at 18,
  jscpd ok at 1 clone — all three ratchets unchanged).
- Full probe started against the rebased branch, log at the main checkout's
  `.llm/logs/tkov-probe.log`, runner holds its own slot. Expected 612/612.
- Probe: 612/612 passed, exit 0 (tkov-probe.log, ~24 min). Landing:
  ff-merge to main, push origin/main and github main.
