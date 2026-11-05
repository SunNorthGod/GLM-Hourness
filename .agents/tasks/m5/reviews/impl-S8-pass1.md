# S8 (L2; lessons-2) review, pass 1

Range: 001494aabfaad30586c01f985feeda29c50ceeec..16bcf886bd1fd53a984ec88b9ec3189d36b41507 (one commit). Review level: 常 (plan S8).
Verdict: APPROVED. No blockers.

## Evidence read

- Commit message: gates on the final tree are recorded (build 0, preflight 0, test 0, probe 0 with 195/195 run twice, check:verbatim 499 verbatim and 0 deviations, check:secrets clean). Failing-first runs are recorded for `lessons-failure.spec.ts` (module missing), `lessons-row.spec.ts` (case 1, no `tools/post-execute`) and `lessons-match.spec.ts` (case 15). The suites were not re-run.
- Host contract, read from `reference/dsh-desktop-0.2.1-rc.3`:
  - `dsh-tools/lib/index.js` `postExecute` (3588-3631): the default decision is `accept`; the result's own `additionalContexts` come first and the decision's after; `block` keeps only the decision's contexts; `content` and `value` together throw. `src/lessons/failure.ts` returns `{ ...downstream, additionalContexts: [notice, ...downstream.additionalContexts] }`, which keeps `kind`, `content`, `feedback` and never sets both `content` and `value`. The `PostExecuteDecision` type in `src/shared/dsh-min.ts` matches the host's shape.
  - `prepareExecution` (3310-3380) hands a pre-execute denial to post-execute as a `post-result`; `tests/fake-rc3.ts` models the same order, and the denial text is the same as before the change.
  - `dsh-tool-pwsh` `renderPwshResult` states that non-zero exits are not errors, so a failed command arrives as `isError: false` with `value.exitCode`, `stderr.text`, `stdout.text`. `shellFailure` reads exactly those fields (tails of 4,000 and 2,000 characters, as in design 4.4 step 2). `isError` results take the text and message path.
  - `src/toolsearch/index.ts`: the `DeferredToolCall` wrapper runs its target without a `parent` token and forwards the target's `additionalContexts` with `deferContext`, then throws on error. The target's call therefore gets the reminder, the wrapper's failure carries it through, and the per-session set stops a second one for the wrapper's identical text. The in-source comment states this and it holds.

## Checks against the plan and design 4.4, 4.6

- A shell call (native `pwsh`/`bash`, `Bash` through `env.native`) with exit code other than 0 or `timedOut`, or any error result including a pre-execute denial, is matched; a call that ran through never is. Tests: first case, `failureText` unit case, denial case in the "result that is an error" case.
- At most 2 lessons per notice, longest fragment first, lessons already told left out before the cut (`matchFailure` with `skip`). Test: "two lessons at most".
- Same lesson not pushed twice in a session: history notices of source `glm-hourness-lessons` plus the process-local set. The set is updated synchronously after the single `await readLessons`, so parallel failures in one session cannot both push the same lesson. The coder's disclosed deviation (the set outlives a compaction while the process lives) follows acceptance lessons-2 item 1 ("not pushed again in a session"); a restart plus compaction can re-show it once and add a second hit for the same session, which `recentSessions` counts once.
- Hits: one `hit` per pushed lesson with session, agent, call id and native tool name, written without holding up the result; a failed write warns once and reaches the row health. The journal read-back in the spec and the probe shows the records are accepted by the fold (`WRITERS` for `hit` is `harness`, `by.session` required).
- Listener failure (unreadable journal, `deriveMessages` throwing) returns the downstream decision unchanged, warns once, sets the `failure` health note. `next()` is awaited outside the `try`, so a downstream failure propagates as in the host.
- No refusal path: the only returns are `downstream` or `downstream` with a prepended context. A `block` from a listener below stays a block (spec case). The row registers no `tools/pre-execute` listener (event-set assertion updated to `agent/created`, `agent/pre-step`, `tools/post-execute`). No rule is registered (`d-code-rules-enforce`), the row stays `disabled: true` by default (no change under `packages/`).
- Recurrence: the notice logic is from S7 and now has a test from the hits up: two sessions give nothing, the third gives one notice with `recur-notified`, a fourth session in the window gives none. The probe checks that the child gets no recurrence notice and that the main agent gets exactly one after the record.
- `match.ts`: a fragment is counted after colour codes are removed (8 or more), closing the S3 review item and S7 observation 3; test case 15 covers both `matchFailure` and `queryLessons`.
- U1 and U2: the probe scenarios `glm-lessons-failure` and `non-glm-lessons-failure` assert the reminder right after the tool result for the main agent and for the dispatched child, the unchanged failing result, no reminder for a command that ran through or for a repeat, three hits across three sessions, one recurrence notice, health loaded and no warnings. DESIGN.md section 2.4a records both as settled.
- Seeds of the earlier lessons scenarios now use run-relative times; the old fixed dates would have expired the candidate from 2026-11-30. This is a needed fix of a time bomb, in the probe only.
- Docs: DESIGN.md (rows table, failure.ts, 2.4a post-execute row, health and fallback tables) and ORCHESTRATION.md 8.6 change with the code. No persona or tone words in any added line. No new `eslint-disable`, `@ts-*` or TODO.

## Observations (not blocking)

1. `toldTo` derives the visible history on every failed call before it knows whether any lesson matches. `deriveMessages` is cached by the session (tail growth only, copy of the array), so the cost is a copy per failed call. Matching first and deriving only for non-empty matches would avoid it. No correctness effect.
2. `longestFragment` orders fragments by their written length, not their normalised length. Only a lesson with several fragments, one carrying colour codes, is affected.

## Loop state

S1 to S8 are APPROVED. S9 to S10 and later startable steps in `impl-plan.md` have not been reviewed, so the loop continues.
