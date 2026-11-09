# m3-metrics-wiring step report (wf_4a9f7c0523d33a93)

Branch `m3-metrics-wiring` (worktree `.worktrees/m3-metrics-wiring`), from main `bb0bed3`. Pushed to origin after each piece.

## Commits

- `cb4c442` the design row's sink (`src/design/metrics.ts`), `quotedMessage` in talk.ts
- `f455bdb` the design and git snapshot events go through the metrics service; the fields follow the closed table (`DesignBodies`)
- `829212f` L2 `tests/design-metrics.spec.ts` (11 cases); the subagent relay carries its stage move (`attemptOf`)
- `2c2915c` the spec is in the `test:2` chain; four settings descriptions (design, env, rules, metrics, zh and en) now say on by default
- `f34cbf9` docs: ORCHESTRATION §3.1, §10.5.1, §10.6 (new item "设计循环的十类事件"), DESIGN §2 row table, HANDOFF rows design, loops, M3, M4, M6, metrics; calibration reader comment
- `b79bf69` `snapshotEvent` stays module-local (knip)

## What changed

- `emitMetric` no-op replaced by `designMetricSink(ctx)` / `emitDesign(lookup, agent, event)`. The events reach `glmHournessMetrics` with `by: design`, filed under the session id and cwd. With no service, nothing is handed in and nothing is logged. A service that throws does not reach the caller (`emitMetric` in src/shared swallows the error).
- The ten kinds are typed as `BodyEventOf<DesignBodies>`, so a field outside the closed table does not compile. The five call sites the journal would have refused whole are fixed: `reason`→`code`, `codePoints`→`units`, `delayMs`→`ms`, `restated`→`noted`, `store`→`where`, `session`→`sessionKind`. The missing `pending` and `again` are added, and the stray `page`, `node` and `question` are dropped.
- New emit points:
  - `design.holder-moved` (`wish`, `here`, `takeover`, `unreadable`, `off`, plus `lapsed` when a record is deleted because its /wish did not take effect)
  - `git.snapshot` (`guardGit` now returns `saved: [{entry, ms}]`)
  - `git.snapshot-refused` (the refusal code)
- Shared helpers in `src/shared/metrics.ts`: `toMetricsId`, `metricsWhereOf`, `BodyEventOf`. Ids taken from outside text are written as `other` when they are not id-shaped, and as `none` when a required one is missing.
- `git.snapshot-refused.code` uses the code names in `git-snapshot.ts` (`ignored-files`, `too-big`, …). These differ from the names in addendum §3.12's table; the code wins, and this is written in ORCHESTRATION §10.6.
- `execute.*` and `operate.*` stay with M7 (§10.6 says so).

## Gates

- `npm run build` 0, `npm run preflight` 0, `npm test` 0 on `b79bf69`. Before that, knip caught one export, fixed in `b79bf69`. One run showed lessons-seed setup failures; a rerun after the fix exited 0.
- The 13 affected design and git specs pass; `design-metrics.spec.ts` passes 11/11.
- `npm run probe`: see below.

## Not done here

- Merging to main and the graph status (notification: do not push main, do not write docs/graph). Acceptance 3 ("改动在 main 上") is met when the landing step merges this branch.
- The calibration metrics (`tests/calibration/interview-metrics.mjs`) still read the run directory; reading the journal instead is a follow-up.

- Probe on b79bf69: 420/420 passed (lock .llm/probe-lock-2 held and released by this step). Build, preflight and npm test exit 0 on the same commit.

## Acceptance -> evidence

1. Each design-loop kind handed in, passes the closed table; no service, nothing handed, no warning: `tests/design-metrics.spec.ts` (11 cases through the journal's own `checkEvent`), green in `npm test` on `35556ee`.
2. ORCHESTRATION names the design-loop events with emit points: §10.6 item "设计循环的十类事件"; `execute.*` / `operate.*` left to M7.
3. Settings descriptions (design, env, rules, metrics, zh and en) say on by default, matching `cordis.patch.yml`; HANDOFF rows loops, M3, M4, M6 as on main (M3 row fixed in round 2). "On main" is met by the landing step.

## git.snapshot and M7

`git.snapshot` and `git.snapshot-refused` come from the guard row's git snapshot rule (`src/guard/git-snapshot.ts`, already on main), not from M7's execution line, so they were wired here. Only `execute.*` / `operate.*` are left to M7.

## Round 2 (review B1)

- `35556ee` HANDOFF M3 row written as it reads on main: the code column records the wiring (项目图 `m3-metrics-wiring`, 2026-11-06, ORCHESTRATION §10.6); 「指标接线合入 main」 removed from 还缺.
- Gates on `35556ee` (logs in `logs/`): build 0 (`r2-build.log`); preflight 0 (`r2-preflight.log`, a first run overlapped the build and was rerun alone); npm test 0 (`r2-test-2.log`). check-lint ratchet inside test: eslint 73, knip 18, jscpd 1, no rise. Probe not rerun: a one-line docs change, no runtime seam.
- The first test run (`r2-test.log`) exited 1 on `tests/data-journal.spec.ts` "two processes appending 200 records each ...": a `.lock.stale-<ms>` file was left in the scratch dir. The test is in `src/data`, which this branch does not touch, and the rerun passed with no change. It looks like a timing flake in the shared journal lock (a writer took over a lock older than `STALE_LOCK_MS` under load). Not fixed here; worth a separate look.
- Pushed to origin only; origin/m3-metrics-wiring = `35556ee`.
- Non-blocking N1–N6 from the review were left as they are (N5: landing should squash the `wip` commits).
