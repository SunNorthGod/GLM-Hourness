# walk-review lane · progress

Branch `walk-review` off main `cd43ec57`. Task: close the ROADMAP borrow item 19 gap from our side — reshape the walk-review harness so the verdict schema it sends is FLAT, letting screenshot/terminal walk verdicts land on the rc.1 runtime; repin `glm-exec-walk` to the landing behavior.

## Stage 1 — reading (before coding)

Facts gathered:

1. The review path sends `WALK_REVIEW_SCHEMA` (`src/execute/walk.ts:574`): `{steps: [{id, ok, why}]}` — one property whose value is an array of objects. `reviewFlow` starts it on the spawn backend (`provider: 'spawn'`, `outputSchema`, `delivery: 'caller'`, `walk.ts:677`), up to 3 tries; `reviewOf` parses `settlement.structured.steps` and requires every approved step id of the flow.
2. The acceptance review rides the SAME spawn backend (`dispatch.ts:617/623`, `REVIEW_SCHEMA` = flat multi-property object: scalar `verdict`/`commit`, arrays inside properties `findings`/`checked`/`lessons`) and its verdicts land. Primary evidence, probe run `glm-hourness-probe-2026-11-14T03-07-53-721Z-83U0G7` (surviving run dir, 2026-11-14):
   - glm-user-graph session `hz-goal-1-acc-a1-be1bwz` (REVIEW_SCHEMA): exactly 1 request, scripted `structured_output` in round 1, verdict captured — goal-1.json carries `验收审查交回 … APPROVED` and the goal closed `done`.
   - glm-exec-walk, same run: 6 reviewer sessions (3 tries × 2 jobs), each exactly 1 request with the scripted `structured_output` in round 1, and no verdict ever landed — `walks.jsonl` shows `review_failed` twice, no evidence lines. Session `hz-flow-shot-a1-q5hr9c` (job 1, try 1, correct script, array args) is the cleanest data point.
   - Both schemas pass rc.1's `assertObjectJsonSchema` subset (dsh-tools `shared-DTdn5dXO.js`: type/properties/required/additionalProperties/items/enum/const + annotations) and the tool is registered with the full schema in both cases (visible in requests.jsonl). The discriminator on this evidence is the payload geometry: flat multi-property objects land; the array-shaped single-property payload does not.
3. The rc.1 spawn backend is not in the exported manifest (desktop composition, not `reference/`), so the race's mechanism cannot be read from source. The fix stands on the L3-pinned discriminator above, not on a mechanism theory.
4. HANDOFF (用户图 row + 近期进展 8 + 已知问题 29 context) and ROADMAP borrow item 19 record the same conclusion; probe scenario `glm-exec-walk` is pinned to the broken behavior (walkChecks items 3/5/6: review never settles, second dispatch walks the flow again, goal stays open).

## Reading adopted (the change)

- Reshape the reviewer's schema to a FLAT record with indexed fields, one triple per approved step, in the order the prompt lists them: `step_<i>` (string, the step id — the echo keeps the design's id check), `ok_<i>` (boolean), `why_<i>` (optional string, one line of at most 120 code points). All properties are scalars at the top level; no array anywhere in the schema. This is strictly flatter than the proven-landing REVIEW_SCHEMA geometry (which carries arrays inside properties), so it keeps maximum distance from the failed shape while preserving every review semantic: verdict per live approved step, coverage required (schema `required` + the parse check), id echoed and matched, `ok` maps exit 0 / false-or-missing maps 1, `why` into the note, missing field or schema mismatch fails the activation (retry up to 3, `review_failed` after).
- `WALK_REVIEW_SCHEMA` (module constant) is replaced by `walkReviewSchemaOf(flow: FlowView)` — the schema depends on the flow's approved steps, and the review prompt is built per flow already. The prompt's "Done when" line names the new flat shape.
- `reviewOf` parses the indexed fields; `reviewFlow` passes `walkReviewSchemaOf(spec.flow)` as the `outputSchema`. Nothing else in the review path changes (role registration, boundaries, tries, budget, evidence rule).
- Probe `glm-exec-walk`: the reviewer round script submits the flat args; the expectations repin to the landing behavior — one reviewer activation, `start,evidence,flow-end(passed),end` in the journal, walk evidence on the graph, the walk-done tell says passed, the second dispatch sends the acceptance review and the goal closes done (mirroring glm-user-graph's chain, which already runs green with a 命令 flow).
- Design docs (`.agents/tasks/user-graph/design.md` §2.7's `{steps: [{id, ok, why}]}` contract, D25, U5b row) stay as the released design record; the living records (HANDOFF rows, ROADMAP 19, ORCHESTRATION.md §17.15's `WALK_REVIEW_SCHEMA` mention) get the deviation in the same commit.

## Stage log

### Stage 2 — first attempt (flat indexed schema) and its falsification

- Implemented the flat reading: `WALK_REVIEW_SCHEMA` replaced by a per-flow `walkReviewSchemaOf` (one `step_<i>`/`ok_<i>`/`why_<i>` scalar triple per approved step), prompt/parser/tests/probe/docs reshaped accordingly.
- Full probe run 1 (`glm-hourness-probe-2026-11-16T17-01-26-580Z-n4VjB0`, kept): **606/611** — the five exec-walk checks failed with the OLD broken shape: 7 reviewer sessions across 2 jobs, every flow-end `review_failed`, no evidence. The flat schema changed nothing: the geometry hypothesis is falsified by direct experiment.
- Evidence digging in the kept artifacts: the whole job spends ~445 ms including all 3 tries — the "settlement" `reviewFlow` reads comes back in milliseconds, before any child could run a tool. That pointed away from any teardown race.

### Stage 3 — the real root cause (read from the exported service source)

- `startActivation` resolves **at the child's acceptance** and returns the activation receipt `{childId, messageId?, result: Promise<SubagentResult>, dispose}` (`dsh-subagent` `startLocal`: "resolve at initial inbox acceptance"; the receipt carries `result`, not `structured`). The settled `{output, stopReason, structured?}` rides the activation's `result` promise (`finishDisposal` → `captureLocalResult`).
- `reviewFlow` did `const settlement = await deps.start(...)` and read `.structured` off the receipt — undefined forever, every try fails instantly, regardless of schema shape. The L2 doubles modeled the settled result instead of the receipt, so L2 never saw this.
- Why the acceptance review always landed: `dispatch.ts` hooks the same receipt's `result` promise (`activation.result.then(settlement => onHandback(...))`) and reads `structured` off the settled value. The "flat vs array" contrast in the borrow item was dispatch-path vs walk-path reading paths, not schema shapes; the "teardown race" attribution came from conflating the headless runner's exit-shape findings (HANDOFF 已知问题 23/29, real but unrelated).
- Fix at the root, in `reviewFlow`: `const settlement = await activation.result` then `reviewOf(settlement, ...)`; a rejected settlement spends a try (parity with the dispatch's error handback). `WalkStart` now returns `Promise<SubagentActivation>` (type exported from `src/shared/dsh-min.ts`; `dispatch.ts`'s runtime read retyped to the same). The schema goes back to the design contract `WALK_REVIEW_SCHEMA` (`{steps: [{id, ok, why}]}`) — the flat reshape was unnecessary, reverted; the role/prompt/tries/budget untouched.

### Stage 4 — L2 after the fix

- `tests/execute-walk.spec.ts`: the doubles return the receipt shape (`activationOf(settlement)` helper whose `result` settles with the given fields; one case rejects the result promise). New coverage: the multi-step 截图 verdict (both steps judged by the named verdicts), the missing-step verdict (coverage check fails 3 tries → `review_failed`), the rejecting settlement (3 tries, no unhandled rejection). 23 cases pass; ratchet flat 73/18/1.
- The probe script's `walkReviewRound` is back on the design schema's args; the repinned checks (verdict lands first try, journal `start,evidence,flow-end(passed),end`, evidence on the graph, walk-done tell, acceptance dispatch, goal done) stay as written in stage 2 — they are behavior checks, not schema checks.

### Stage 5 — gates (second pass), all green

- build OK (`wkr-build.log`), preflight OK (`wkr-preflight.log`), `npm test` OK (`wkr-test.log`, ratchet 73/18/1 flat).
- Full probe: **611/611** (`wkr-probe.log`, run dir deleted on success — same count as the floor, new pass shapes for glm-exec-walk: 1 reviewer request, journal `start,evidence,flow-end(passed),end`, evidence on the graph with the copy's digest note, walk-done tell says passed, second dispatch = acceptance review APPROVED, goal done, exit 0).
- Probe lock `.llm/probe-lock` held with owner rewrites throughout, released after the run; `GIT_CONFIG_*` unset in the environment.
- The kept artifacts of the falsifying run (`glm-hourness-probe-2026-11-16T17-01-26-580Z-n4VjB0`) stay under the system temp dir as the misdiagnosis record until tmp cleanup.

## Disposition

- Committed on `walk-review` as `cf80ff5f`, rebased onto main `943f5559` (→ `93873eda`), all gates re-run on the rebased base (build/preflight/test green, ratchet 73/18/1, probe 611/611 — `wkr-*.log`), fast-forward merged into main and pushed to both remotes (origin + github, `943f5559..93873eda`).
- The change: walk.ts root fix (reviewFlow settles `activation.result`) + schema back to the design contract, dispatch.ts/dsh-min.ts type tightening, L2 doubles on the receipt shape + 3 new cases, probe repinned, ROADMAP 19 / ORCHESTRATION §17.15 / HANDOFF §8 row + §10 item 10.
- Remaining: desktop L4 (real-image judgment, U6/U7 batch) — unchanged; the runtime's own end-of-turn teardown behavior (HANDOFF 已知问题 23/29) is a separate, real upstream fact unrelated to this path.




