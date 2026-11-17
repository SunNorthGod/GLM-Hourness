# Post-wave audit findings — wave 4be028e8..0c5ebd21 (7 commits, main frozen at 0c5ebd21)

Audit date: 2026-11-17. Method: static reading of the wave diffs, current code, DSH harness reference (`reference/deepseek-harness/packages/core/tools/src/pipeline.ts`, `reference/dsh-desktop-0.2.2-rc.1/`), docs cross-check. The probe was NOT run (main's known red is owned by the parallel answer-race lane; tree frozen). No code was changed; this doc is the deliverable.

Known race NOT re-audited (owned elsewhere): the recorded human answer not seen by a dispatch ~4s later in the exec review scenario.

## Findings

### F1 — should-fix · `.takeover` mutex can be double-held via the stale-eviction unlink race · confidence: high (code-read, deterministic interleaving)

`src/data/lock.ts:154-176` (`withTakeoverLock`). Two contenders that both find a stale `.takeover` can each delete the other's fresh file:

1. X: `open(wx)` fails → `stat` says stale (leftover from a crashed process).
2. Y: same, `stat` says stale (same leftover), before X unlinks.
3. X: `unlink(takeoverFile)` (line 164) removes the leftover; `open(wx)` succeeds — X holds the mutex.
4. Y: `unlink(takeoverFile)` — deletes **X's fresh file**, not the one Y statted; Y's `open(wx)` succeeds — Y holds it too.

Both now run the takeover action concurrently. Consequence is bounded today: the action itself re-verifies the lock file identity (`stat` at `src/data/lock.ts:228-237`: `mtimeMs`+`birthtimeMs`+`size`+`ino` against the read) before the atomic `rename`, so no wrong lock file is removed even with a broken mutex — the stat identity is the real safety net, the `.takeover` file only narrows the window. But the mutex's serialization promise is not held, and the eviction can delete a file created milliseconds earlier (not the stale one observed).

Also a liveness blip: a contender whose `stat` lands between X's unlink and X's create gets ENOENT and returns `acquired:false` for the round (retried later; benign).

Suggested direction (for the fixing lane, not this audit): evict the stale mutex by `rename` to a unique trash name instead of `unlink`-then-create — rename is atomic and either moves the stale file or fails with ENOENT, so a fresh file is never destroyed by a contender that only observed the stale one; combined with re-`stat` before the rename to confirm the mtime is still the stale one. Or use kernel-level locking (mkdir / LockFileEx). Residual risk that remains acceptable: a four-way stat-identity collision (same `ino`/`mtimeMs`/`birthtimeMs`/`size` in the same millisecond after delete+recreate) — negligible.

### F2 — should-fix · the tightened exec-review probe assertion is hard-coupled to the known answer-race window · confidence: high on coupling, medium on post-fix sensitivity

`scripts/probe/run-probe.mjs:4636`. Before the wave the check accepted "pass round not yet run" (`reviewNode.status === 'done' || roundComments.length >= 1`); after, it demands

```
reviewNode !== undefined && dispatchComments.length >= 4
  && ['doing','done'].includes(reviewNode.status)
  && (reviewNode.status !== 'done' || roundComments.length >= 2)
```

`dispatchComments` counts `第 N 次派发` comments on the review node (`run-probe.mjs:4610`); the 4th is the pass-round dispatch that only happens after the recorded human answer is (belatedly, timer-driven) seen. If the known race fires, the dispatch is refused `waiting_human` again, the count stays 3, the review task stays `todo` — red. This is the same racy class as the known red: the assertion requires async machinery (a timer-driven re-dispatch after `record_human_answer`) to have settled inside the run, within an unguaranteed window.

Two sub-points for the fixing lane:
- Even after the answer-visibility fix, the assertion does not tolerate the deterministic alternative "answer seen but the pass dispatch was refused again" — if that state is reachable by design, the probe will flag it red rather than distinguish it from the race.
- The sibling checks in the same scenario (`run-probe.mjs:4635`, unchanged) already pin the refusal and the recorded answer separately, so the information the tightened check adds is only "the pass round began". Keeping `['doing','done']` is good (tolerates the child still running at exit); consider also tolerating `dispatchComments === 3` with an explicit second `waiting_human` refusal when that outcome is judged deterministic.

### F3 — should-fix (low harm) · startup metric buffer mis-attributes and silently drops · confidence: high (code-read)

`src/execute/index.ts:144-163`. The execute row's default metric sink buffers events that carry neither `dir` nor `sessionId` (max 8) and replays them against the **first project that emits anything**, stamped with that project's root. On a host serving two projects, whichever emits first inherits the other's startup events (mis-attribution, not corruption). If no project ever emits, the buffer is dropped at dispose with no flush and no health note — invisible loss (pre-wave these events went nowhere because the sink was undefined, so this is a strict improvement with two new rough edges). Suggest: flush + count the leftovers in the row's health on dispose, and note the first-project attribution in a comment at least.

### F4 — note · `deferPreExecuteEffect` drops effects silently when no frame exists · confidence: high

`src/guard/gate.ts:123-126`: `if (frame !== undefined) frame.effects.push(effect)` — outside a `withPreExecuteFrame` the effect vanishes without a warning. All six current call sites are inside wrapped listener bodies (guard gate 250/330, execute-rules 472/544/586, rules gate wraps without deferring), and DSH passes the same `exec` object through the whole waterfall (`pipeline.ts:200`, one `exec` reference), so keying by payload identity is sound. But the API's failure mode is invisible; a future caller outside the waterfall loses its record. A one-time `console.warn` (or a comment stating the precondition) is cheap insurance.

### F5 — note · partial commit then catch: `onDeny` runs for effects whose `onAllow` already ran · confidence: high that the path exists, high that it is currently benign

`src/guard/gate.ts:147-166`: if an effect's `onAllow` throws mid-loop, the catch runs `onDeny` for **all** effects, including ones already committed. Only the guard grant effect has `onDeny` (`outcome.release()`); `GrantBook.consume` deletes the grant from the map (`src/guard/request.ts:146-149`), so a subsequent `release` (which only clears `inUse`) cannot resurrect it — benign double transition. Today no `onAllow` can throw (execute-rules `record` is reject-safe via boolean contract and `recordIncoming` is sync; guard's grant write is `writeJournaled`, which swallows; `options.allowed` is row-supplied — verify when adding rows). Dormant; deserves a comment pinning the invariant "onAllow must not reject".

### F6 — note · followup writes through the rules row's journal swallow losses without counting · confidence: high

`src/rules/gate.ts:370` (and the per-denial `write` at `src/rules/gate.ts:190-193`): `void deps.journal.violation(record, sessionCwd).catch(() => {})`. The guard gate's equivalent (`writeFollowup` → `writeJournaled`, `src/guard/gate.ts:362-384`) counts `failed` against session health (`lose`). A settled follow-up written via the rules row can vanish silently. Inconsistent with the "a lost record is never silent" design line (guard gate header, §3.1 step 7).

### F7 — note · rc.1 async projection registration leaves a startup window that degrades fail-open · confidence: high on mechanism, low on real-world hit rate

`src/shared/row-support.ts:87-176` (`registerSessionProjection`), `src/design/index.ts:464-505`. Between `register()` and the promise settling, `stateOf` falls back to the service's own `stateOf` (rc.1-deprecated but synchronous, semantics unchanged per DESIGN §2.4a). On a host whose service `stateOf` does not yet know the key, the read returns `undefined`; `src/guard/main-agent.ts` then judges the call as `ordinary` with a one-time degraded report — fail-open with a note, not silent. This is a window of the same family as the known answer race but confined to startup (apply → register settle), self-heals per call afterwards, and every failure is named on health. Acceptable as-is; worth knowing when reading rc.1 logs.

### F8 — note · `setMetricSink(undefined)` semantics changed · confidence: high

`src/execute/metrics.ts:56-77`: `emitMetric` now uses `sink ?? defaultSink`, so resetting the custom sink to `undefined` no longer mutes metrics — it falls back to the row default. All in-repo callers and tests were updated in the wave; any external or test harness relying on "undefined = record nothing" would silently start emitting. Documented in the new docstring; flagging for release notes.

### F9 — note · probe stderr-clean breadth · confidence: high on mechanism, undetermined on flake rate

`scripts/probe/run-probe.mjs:4461-4468` (`pluginStderrClean`) is now required by dozens of checks plus `tailOk` (line 4469) in all branches. It fails the scenario on any stderr line containing `dsh-glm-hourness/`, `dsh-hourness/`, `dsh-glm-zcode/`, or `glm-hourness/` — including a warning emitted once by a fire-and-forget path near shutdown. Every current warn path is caught/handled in the wave (registerSessionProjection observes rejections, `lose()` goes to health not stderr), so this is deterministic today; the risk is that one future benign warn flips many checks simultaneously. Not the known race class — stderr is read from the final file after exit.

### F10 — note · orphan lock archives · confidence: high

`src/data/lock.ts:239-244`: the non-`keepStale` takeover renames the dead lock to `.trash-<uuid>` then unlinks; a crash between the two leaves `.trash-*` files forever (no sweeper). `.stale-*` is by design when `keepStale`. Cosmetic.

### F11 — note · rules followup write pins cwd at note time · confidence: high

`src/rules/gate.ts:190-193`: `sessionCwd` is captured when the denial is noted and used when the denial settles, possibly much later; if the session moved to another project in between, the follow-up record lands in the old project's journal. Edge case; the guard gate's own path resolves the journal per payload at settle time.

## Verified clean

- **Deferral semantics (5a3a5a9c)**, audit focus 1: all deferred effects commit on outer-allow and drop on denial:
  - guard gate: grant record write (`onAllow`) / `outcome.release()` (`onDeny`); `options.allowed` (`onAllow`). Release-on-deny matches pre-wave behavior including for `ask`/`cancel` decisions (both take the non-allow branch, same as before).
  - execute-rules: `recordIncoming` and `record('allowed')` on outer allow; git snapshot moved to `beforeAllow` — runs after the whole waterfall allows but still **before the tool body executes** (DSH dispatches the body only after `prepare` resolves the waterfall: `pipeline.ts:185-246`), so snapshot-before-command ordering is preserved; a snapshot refusal converts to a deny decision and releases the grant via `onDeny`.
  - rules gate: wraps `withPreExecuteFrame` without deferring; blocked-retry ticket call is awaited inside its own body.
  - Frame keying is sound: one `exec` object through the waterfall; batch pre-executes are ordered (only dispatch/body overlap), so no deferred write is read by an overlapping pre-execute; grant `markInUse`→`consume` cannot double-spend.
  - Turn boundaries: follow-up settle/notes are synchronous in the listener; deferred effects live strictly inside the pre-execute promise; `session/disposed` settles pending denials and flushes the journal as before. No new flush loss introduced (pre-existing fire-and-forget journal writes racing a headless exit are unchanged by this wave).
  - The known-race class: no other deferred-effect-read-before-commit window found besides F2's assertion coupling (F4/F5/F7 are adjacent but not instances of lost correctness).
- **Takeover mutex (251ad33a)**: exclusive-create `.takeover`, stat-identity re-verification (`mtimeMs/birthtimeMs/size/ino`) inside the mutex, atomic rename, token-guarded release, heartbeat (mtime/birthtime advance) resets the unreadable grace clock, bounded `unreadableGraceMs`. Main TOCTOU closed; residual items are F1 and the negligible stat-collision.
- **Walk (251ad33a)**: review bounded by `WALK_REVIEW_MS` per flow, abort-responsive via `Promise.race` + attempt-scoped `AbortController`, timer/listener disposal in `finally`, `forgetAttempt` on every path; `stepExits` now requires `step.ok === true` AND a judged pass when a review ran; aborted flows map to `not_run`. Sound.
- **Probe runner mechanics (3d9e1fb0)**: lock taken before run-dir/profile creation with `bindProbeLockExit` releasing on every exit path and SIGINT/SIGTERM; slot probing no longer stalls on a busy slot 1; exit code aggregated and released in `finally`. The 45s calibration time bound and `dispatchChild.length > 0` are pre-existing, not new racy assertions. The only new async-settle-dependent assertion is F2.
- **Docs vs behavior (0c5ebd21)**, audit focus 3 — all spot-checks pass:
  - Row counts: `packages/hourness/cordis.patch.yml` lists 17 host rows (+ client row `ui`), `packages/glm/cordis.patch.yml` 4 host rows (+ `glm-ui`) — 21 host + 2 client = 23; matches HANDOFF and DESIGN/FACTS §2.5 (and `src/shared/health.ts:23-40` `HOURNESS_ROWS`/`GLM_ROWS`). `operate` `disabled: true` confirmed in the patch.
  - rc.1 contract statements verified against `reference/dsh-desktop-0.2.2-rc.1/`: `tools.register(definition, options={when?})` (`dsh-tools/lib/index.js:433-446`), `tools.executable` (`:530`), `tools.execute` batch input + `BatchSettlement.result` (matches `src/shared/dsh-min.ts:130/142/365`; all in-repo `tools.register` call sites still single-arg), `sessionProjections.register` awaitable handle (matches `registerSessionProjection`), `schedule` `create(request, actorSessionId)` default target `new_once` (`dsh-schedule/lib/index.js:~2237`), user-questions intent `plan-review|approval` (typert declaration), `dsh-base/cordis.patch.yml` ships `dsh-fs-observation-policy` `disabled: true`.
  - Build/metrics claims: `package.json` build runs `tsc -p tests/tsconfig.json` (tests enforced in build); `npm run metrics` + `scripts/metrics/cli.ts` exist (ORCHESTRATION §16 table accurate); script timeout text uses `timeoutSeconds` (`src/rules/script-run.ts:75`); the `agent.inject` whitelist addition names `src/rules/wake.ts:82` — verified (`agent[how](notice)`).
- **Graph statuses (0c5ebd21)**, audit focus 5 — see recommendation below; landing evidence checked: m7-9's commit `47782092` exists, `tests/report-metrics.spec.ts` exists, rollback exclusion landed in `src/report/metrics.ts` (e6665f01, `rollback !== true` filters on deploys/lead/restore); m7-6/7/8 landing comments document the leftover work and L4 items.

## Graph status recommendation (m7-6..m7-9)

Keep the wave's edits — no misrepresentation found.

- **m7-6 `doing`**: correct. Reopen reason is real and now actionable: the morning report's "用了哪些模型" section lacks a durable source, and this wave (52f6a1c2) wired execute events into METRICS_SERVICE — the prerequisite landed, the section itself is still owed; plus operate row ships disabled pending batch L4.
- **m7-7 `doing`**: defensible. Patrol code and the `operate.patrol` entry are in main; cold-session delivery verification rides batch L4, which the node body itself scopes as "到点投递随 L4" — keeping `doing` until that verification is the honest reading of its why (每晚自动…问题第二天一早就知道).
- **m7-8 `doing`**: defensible. Weekly + ladder + floor-proposal data path landed (a09fcf38 closed the floor-proposal data source); L4 收尾 pending.
- **m7-9 `done`**: correct. Its acceptance ("四个数按固定口径算出，写进指标流水") is fully met, evidence recorded (commit + L2 spec, 11 cases; probe 608/608 claimed in the landing comment), and the restore-time half of L4 is explicitly documented as no-durable-source rather than invented. The asymmetry with m7-6..8 (`done` here, `doing` there) tracks the acceptance text, not oversight: m7-9's L4 item is presentation of numbers that already exist in the stream; m7-6/7/8's L4 items are part of what the node promises.

Minor nit, not a status issue: m7-6..8's reopen `status` history entries carry `actor: "llm"` with no evidence refs; if the repo's convention wants evidence on status moves (m7-9 has them), consider backfilling refs to the wave commits (5a3a5a9c..0c5ebd21) that closed the prerequisites.
