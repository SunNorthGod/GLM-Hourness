# m7-handback progress

Lane: two graph nodes, one branch (`m7-handback`, from main `2818d130`).
Worktree: `.worktrees/m7-handback`, `node_modules` is a junction to the main checkout's.

## Node m7-habits (reopened-node cause + standing brief sentences)

- `src/execute/brief.ts` `renderBrief`: Constraints gains a standing sentence (delete stranded code and no-longer-true text, rewrite stale clauses wholesale, no IDE- or tool-specific directories or configs; committed ones stay) on every write brief; a task with `reopenCount(task, undefined) >= 1` gains the find-the-cause sentence with the last reopen's reason (`reopensAfter(...).at(-1)?.reason`, cut to 300 code points). `renderReviewBrief` gains `cause` in the input and one context line (the accepted handback's cause + the symptom-only non-blocking instruction).
- `src/execute/schemas.ts`: `HANDBACK_SCHEMA.properties.cause` (optional string).
- `src/guard/execute-rules.ts`: `EXECUTE_RULES` ninth gate `handback-cause` (enforce); the pre-execute listener refuses a registered worker's `structured_output` when the row's cached graph shows the task reopened and `cause` is empty/blank, with the four-part correction; the lift record is consulted (`liftedRulesOf(project)`); an unreadable graph passes (the handback must not wedge).
- `src/guard/catalog.ts`: `GUARD_RULES` gains `execute:handback-cause` (`liftVia: 'any'`) so both lift paths (a sentence to the main agent, `/rules lift`) work today.
- `src/execute/attempts.ts`: `HandbackComment.cause`, rendered as the `原因 <cause>` line (newlines flattened) between the depth and the 改动 lines, parsed back.
- `src/execute/handback.ts`: the settled handback's non-empty `cause` lands in the summary comment (the annotation on the node).
- `src/execute/dispatch.ts`: the review brief input carries `reviewHandback.cause`.
- Placement deviation from habits-framework report §3.1 (recorded in the m7 design's revision log): the refusal fires at the `tools/pre-execute` boundary of `structured_output`, not in the settle-time semantic validation — the worker fixes the call in the same session instead of the whole attempt being voided; the cause annotation is the `原因` line of the summary comment (the idempotency mark) rather than a separate comment, so a crash and rerun neither loses nor duplicates it.

## Node m7-handback-path-check (deterministic handback path check)

- `src/execute/floor.ts`: `isTestPath` (test directory segments or test-shaped basenames, case-insensitive), `acceptancePathsOf` (backtick spans of the acceptance that name a path by shape: no whitespace, repository-relative, a `/` or a `.` — commands, identifiers and enum values do not count), `pathEscalationReason` (all changed paths test files, or the acceptance names backtick paths and none was touched by `floorPathIn`; an unreadable change escalates nothing).
- `src/execute/handback.ts`: in the done flow, when the floor has no hit, `pathEscalationReason` runs on the same change list; a declared `full` stands, `light`/`skip` rise to 全审 with the reason in the `有效深浅 全审（…）` annotation; the loop event's `floorHit` stays empty (not a floor class). The dispatch-side refusal (`floor_requires_full`) is deliberately not extended — the node scopes the check to the handback processing.
- The 2026-11-05 reading digest's C2 basis; limitation recorded on the node and in the design: only backtick paths are read, and only those shaped like paths.

## L2 pins

- `tests/execute-brief.spec.ts`: the reopened brief (sentence + reason, within `BRIEF_LIMIT`), the standing sentence on both, the review brief's cause line.
- `tests/execute-attempts.spec.ts`: the 原因 line round trip (depth present and absent).
- `tests/execute-handback.spec.ts`: the cause lands on the node; two escalations (all-test change, untouched acceptance paths) and one non-escalation (declared light stays light).
- `tests/execute-row.spec.ts`: `handback-cause` refusal + journal record + retry accepted + never-reopened passes + lifted rule passes; `EXECUTE_RULES` nine gates.
- `tests/execute-floor.spec.ts`: the three pure functions' tables.
- `tests/contracts.spec.ts` / `tests/rules-builtin.spec.ts` / `tests/rules-view.spec.ts`: catalog 12 entries, `execute:handback-cause`, the page's row set.

## L3

- `scripts/probe/run-probe.mjs` `glm-exec-review` extended: after the pass round the main agent closes task-1 (`graph_status` to done with evidence) and reopens it with a reason, dispatches the rework — the brief carries the cause sentence, the causeless `structured_output` is refused, the retry with the cause is accepted and lands as the 原因 line; task-2 commits only a test file (declared light) and its handback escalates to 全审 with 改动全在测试文件里. The whole scenario extension lands with the second commit (one scenario, assertions read both flows).
- First probe run findings (both fixed in the scenario):
  - The tester's fixture must be a `.json` file: M4's `scratch-only` refuses a quick dispatch's new script-shaped file (`.ts` is in SCRIPT_EXTENSIONS) and the approved-plan exemption needs an approved plan, which a `quick` dispatch skips; `.json` is data and passes, and `isTestPath` reads the `tests/` directory segment.
  - `glm-exec-merge`'s rework worker hands back on a reopened task too (the reopen is already in that scenario), so its handback carries a `cause` — without it `handback-cause` refused the call, the handback was lost, and the trunk advance correctly kept the task in progress with 审查还没过.
- Probe floor: see `.llm/logs/hb-probe.log` result line (the runner manages its own lock; `GIT_CONFIG_*` cleared before the run).

## Gates

- build / preflight / test logs: main checkout `.llm/logs/hb-build.log`, `hb-preflight.log`, `hb-test.log`, exit codes direct.
- Ratchets: eslint 69 suppressed, knip 18 baseline, jscpd 1 clone — all unchanged.

## Commits

1. `feat(execute): <m7-habits>` — the cause flow and the standing brief sentences, code + L2 + docs.
2. `feat(execute): <m7-handback-path-check>` — the deterministic path check, code + L2 + docs + the probe scenario extension.
