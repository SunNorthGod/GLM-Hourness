# M3 step 12(a): interview metrics batch — progress record

Date: 2026-11-03 (finish of an interrupted run; worktree `.worktrees/m3`, branch `m3`)

## What the batch contains

The calibration METRICS code for step 12(a) (design-addendum 0.6; the new
`ORCHESTRATION.md` §10.5.1 bullet "需求访谈任务的指标"), not a calibration run:

- `tests/calibration/interview-metrics.mjs` (new): reads a run directory
  (`events.jsonl`, `event-times.json`, `human.jsonl`,
  `home/audit/violations.jsonl`, `ws/.llm/snapshots.jsonl`) plus the workspace
  project graph and computes the step-12(a) numbers: `disturbed`, `shown`
  (incl. `notVerbatim`/`partialResults`), `questions` (forms, code points,
  wait ms, marks over limit, option lines, plain words, told sentences,
  delegations, follow rate, refusal reasons, interview marks), `copiedExamples`,
  `loops`, `records`, `rules`, `snapshots`. Refusal reason classifiers
  (`proposeReason`, `recordReason`, `snapshotRefusalCode`).
- `tests/calibrate-interview-metrics.spec.ts` (new, 9 tests): pins the metrics
  and the classifiers against the code that writes the refusal texts
  (`proposal.ts`, `propose.ts`, `record.ts`, `talk.ts`, `git-snapshot.ts`).
- `scripts/calibrate/run-calibrate.mjs`: records the arrival time of each event
  line (`event-times.json`, written after the stream is flushed), separates the
  checker's `metrics` from the verdict and writes them into `result.json` as
  `interview`; adds `humanReplies` to `result.json`.
- `tests/calibration/lib.mjs` + `interview-lib.mjs` + the two interview
  `check.mjs`: `report(checks, extra)` prints an interview task's `metrics`
  next to the checks; `metricsOf` loads them from the run directory the
  workspace lives in (`<run>/ws`).
- `tests/calibrate-interview-check.spec.ts`: asserts the metrics keys appear
  and are not checks.
- `package.json`: `calibrate-interview-metrics.spec.ts` added to the `test` chain.
- Docs: `ORCHESTRATION.md` §10.5.1 new bullet for step 12(a);
  `DEVELOPMENT.md` §3 note on calibrating a worktree without touching `~/.dsh`
  (temp DSH home via `generateProfile`, copied credentials, `DSH_HOME` +
  `DSH_SANDBOX_PROFILE`, delete afterwards; do not rebuild during a run).

Completeness check: every item of the design bullet has an implementation and
at least one test; no dangling references (all imported symbols exist in
`src/` and `packages/hourness/dist/`). Nothing was added beyond the batch.

## Gates (each run serially, output logged under `.agents/gates-m3-calib/`)

- `npm run build` — exit 0 (build.log).
- `npm run preflight` — exit 0; `preflight: OK (directory table: 2 packages,
  12 source directories; dsh-glm-zcode 5 rows, dsh-hourness 10 rows; 15 rows
  composed)` (preflight.log).
- `npm test` — exit 0; 84 spec-file summaries, `# fail 0` in all of them;
  0 `not ok` lines; 1395 top-level tests (TAP plans + `ok` lines agree), 22
  nested subtests = 1417 test invocations, 1 skipped, 0 failed. New spec ran
  inside the chain. Note: the brief's "1696+" baseline does not reproduce under
  any aggregation of this log (1395 top-level / 1417 incl. nested / 1416 summed
  file summaries); earlier recorded runs on this branch by the same top-level
  aggregation were 1217 (step 6 notes) and 1253 (step 8 notes), so the suite
  grew as expected (test.log).
- `npm run -s probe` — exit 0; `probe: 213/213 passed` (probe.log).

## Commit

- `92f8e94` `feat(m3-calibration): interview metrics for step 12(a)`
  (11 files, +650/−19), parent `52769eb`, pushed to Gitee `origin/m3`
  (`52769eb..92f8e94`, push exit 0).

Not done (out of scope / not authorized): `npm run calibrate` (real model
requests, costs credits — needs explicit human authorization).
