# metrics-retire lane: metrics step 10 (ledger and workflow row retirement)

Branch `metrics-retire` (worktree `.worktrees/metrics-retire`, base main `826422cd`).
Task brief: `.agents/tasks/metrics-retire/brief.md`; design §12 step 10, §15 item 9,
§13 L3 prechecks: `.agents/tasks/metrics/design.md`. Consumer migration map and
per-item decisions: `.agents/tasks/metrics/addendum-step10.md` (commit ab948100).

## Key finding recorded before any code change

`glmHournessWorkflow` does not exist anywhere in the repo: the brief anticipated a
service the workflow row never provided. The row's only surfaces were its health
entry (`glmHournessHealth/workflow`), the row lists, and the decisions journal it
wrote. The migration map in the addendum covers every reader of the two ledgers
(`audit/suppressions.jsonl`, `audit/decisions.jsonl`); M3 design-mode does not read
decisions.jsonl (it writes the graph through the engine observer).

## Commits (each gated build/preflight/test green)

1. `ab948100` docs(metrics): step-10 addendum — consumer map, §2 per-item decisions.
2. `a0f7427f` feat(env): retire the suppressions ledger — the daily count lives in
   the metrics journal alone (step 10, first half).
3. `3355cd2c` feat(report)!: retire the workflow row — the dispatch journal is the
   metrics journal's `tool` events (step 10, second half).
4. `dc77ada0` feat(probe): the two metrics step 10 L3 prechecks.
5. `52543baf` docs: the ledger and workflow row clauses follow the retirement
   (DESIGN, ORCHESTRATION, HANDOFF, DEVELOPMENT, both READMEs, env row comment).

## What changed

- Suppressions: `src/env/suppressions.ts` returns a `SuppressionTally`, no ledger
  write; `src/env/metrics.ts` `emitSuppressionCount` emits the `count` event
  (`what: 'suppression-comments'`). The once-per-day gate reads the latest count
  event back through `src/metrics/read.ts` `countEventsSync` (best-effort, last 3
  day files, never throws) so a restart does not double-write. Status entry
  `env/suppressions` is re-sourced from the flow (entry id, wording, 48 h staleness
  unchanged, same computation as the report); the sync contract forced the sync
  reader.
- Workflow row: `src/workflow/` deleted clean; `morning-report.ts` moved to
  `src/report/` (dispatches now count `tool` events with `cat === 'dispatch'` over
  the period, `- 派遣类调用 — 次` when no journal could count). Dispatch class list
  moved to `src/shared/tool-names.ts` `DISPATCH_TOOLS` (7 names, design §4.3);
  `toolCategory` classifies by the whole class; the rules gate's
  `DISPATCH_TOOL_NAMES` stays the pinned subset. `src/memory/audit.ts` loses
  `DecisionRecord` and the decision sink; dead `dispatchPanel` code deleted from
  `src/report/panel.ts`. Rows: HOURNESS_ROWS 17 → 16, HEALTH_ROWS 21 → 20, client
  rows 23 → 22 total; patch/locale/package exports/tsconfig updated; old
  `decisions.jsonl` and `suppressions.jsonl` stay on disk untouched for the person
  to delete (docs say so).
- L3 prechecks in `scripts/probe/run-probe.mjs` (`retire:` prefix, glm scenarios):
  no `audit/suppressions.jsonl` anywhere in the run directory plus the GLM
  scenario's journal holds a suppression-comments count event; the workflow row is
  gone from the row lists, health tables, status hub and `/hourness` text, with no
  absence error.

## Gates

- Per-commit build/preflight/test green (logs `mr-build.log`, `mr-preflight.log`,
  `mr-test.log` in the main checkout's `.llm/logs/`).
- Final full `npm test` (commit-4 tree): TEST_EXIT=0, 4028/4028; ratchets
  eslint 57 / knip 18 / jscpd 1 (down from 69/18/1; `npm run lint:update` pruned
  the deleted files). Two environmental flakes seen once each and green on rerun:
  execute-reconcile timing poll, metrics-rules EBUSY rmdir teardown.
- Full probe: **626/626** (floor 624 + 2 retire checks; `mr-probe.log`, runner
  managed its lock, GIT_CONFIG_* cleared). Detail lines: `0 ledger file(s);
  1 count event(s) of what suppression-comments`; `rows 20 (no workflow); tables
  clean; hub rows 20; /hourness text clean`.

## Deferred (recorded in ORCHESTRATION §10.6)

- Row-retirement startup precheck (acceptance 17: temp profile carrying the old
  row override, bundle without the row, real start with no new errors) goes with
  the next real-host probe and desktop L4.
- Old ledger files on disk are for the person to delete.
