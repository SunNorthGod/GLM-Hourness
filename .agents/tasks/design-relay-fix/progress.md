# design-relay-fix progress

Lane: design-relay-regression. Worktree: .worktrees/design-relay-fix, branch design-relay-fix @ e09a269e.

## Known regression shape (verified upstream, double-checked)

- Probe 605 checks: 603 green / 2 red, deterministic (identical FAIL set across runs).
- Red scenarios:
  1. `design question`: subagent sends relay with an edit of the goal; expected refusal rule `main-agent-graph-relay`, glm-design-bypass notice, design row "partly in effect". Actual: refusal recorded as `worker-graph-readonly`, notice 0 times, row stays "生效".
  2. `design modules`: subagent sends module-a back to design; expected `main-agent-graph-stage`. Actual: `worker-graph-readonly`, same downstream misses.
- graph_edit IS refused and goal/module does NOT move — only the rule attribution is wrong.
- Green sample: Temp glm-hourness-probe-2026-11-13T12-32-30-251Z-Kcxq18 (requests.jsonl records main-agent-graph-relay, session.kind=subagent).
- Red runs: Temp ...2026-11-14T00-36-52-460Z-9i10NY (run1), ...2026-11-14T01-08-13-939Z-VAG3vS (run2). Logs .llm/logs/ugraph-main-postmerge-control.log, -control-run2.log.
- Flip point: every run through 2026-11-13T12:32Z green; from 2026-11-13T14:14Z (first walk-scenario run, f9ba3c30 onward) 18 runs red.
- Guard-side diff across window: only GRAPH_WRITE_NAMES gained graph_relink/graph_walk (graph_edit already in set). Design row + main-agent guard files zero diff.

## Stage log

- [stage 0] 2026-11-14 — worktree created off e09a269e, branch design-relay-fix. Locks clear. Next: root-cause pass.
- [stage 1] ROOT CAUSE FOUND (verified by repro harness, temp scripts/drelay-repro/*.mjs, logs .llm/logs/drelay-repro*.log):
  - Both rows register their one `tools/pre-execute` listener with `prepend: true` (design row: src/guard/main-agent.ts install closes with `{ prepend: true }`; execute row: src/guard/execute-rules.ts `installExecuteRules`). Among prepended listeners the LAST installed is outermost (cordis register unshifts).
  - Row apply order is NOT patch order: rc.1 loader's Include tree applies rows concurrently (`Promise.all(ids.map(...create))`, dsh-app-boot lib). Apply order = module resolution completion order. Both rows' injects ([commands] / [tools]) resolve at composition, so nothing re-sequences them.
  - The user-graph work (960a779d) added src/execute/walk.ts (964 lines) to the execute row's runtime import graph (dispatch.js/drive.js/brief.js import walk.js). The execute module now resolves SLOWER than the design module → design applies FIRST, execute LAST → execute's prepend is outermost.
  - Consequence: for a startActivation child (session header origin=subagent, not a dispatched-chain member), the execute row's worker-graph-readonly refuses its graph_edit BEFORE the design row can judge it. The design row's relay/stage refusals (main-agent-graph-relay / main-agent-graph-stage) never fire; glm-design-bypass notice 0 times; design row stays 生效.
  - Evidence: repro on e09a269e dist = worker-graph-readonly; repro on 39b89749 (pre-walk) dist = main-agent-graph-relay (green shape); install-order debug lines show execute-first/design-second on 39b89749 and design-first/execute-second on e09a269e; swapping the patch rows (experiment) restored green — confirming order-dependence.
  - The probe itself documents the intended layering (run-probe.mjs m7 §3.2.2 coexistence check): "the unreleased module still refuses with the module named, BEFORE the read-only rule is even asked" — the design row's rule must win the calls it owns.
- [stage 2] FIX DESIGN: in the execute row's graph-refusal branch (execute-rules.ts), a delegated caller that is NOT a dispatched-chain member (attempt undefined AND owning() undefined) YIELDS the calls the design row judges — relay quotes (relayOf), stage moves (stageCandidate), delegations writes (writesDelegations) — so the design row refuses them with its rules and fires the bypass notice. Everything else unchanged: chain members and registered workers keep worker-graph-readonly; plain subagents' other graph writes still refused worker-graph-readonly (design passes them); main agent and ordinary sessions untouched. This encodes the documented layering in code and removes the correctness dependency on module load order (works under either install order).
- Env note: probe-lock held by m7-p3 (their gates); this lane took .llm/probe-lock-2 (owner.txt written, renew as stages complete).
- [stage 3] FIX IMPLEMENTED (src/guard/execute-rules.ts + docs ORCHESTRATION §17.9 rules/faces lines, DESIGN row table): in the graph-refusal branch, a delegated caller with owner undefined (plain subagent of the main agent) runs the inner waterfall FIRST (`const inner = await next()`); the design row's denial (main-agent-graph-relay / -stage / -delegations, with its journal shape and the bypass notice) comes back as-is; only what the design row lets through is refused worker-graph-readonly here. Chain members (owner defined) keep the immediate refusal. Both repro directions verified on the built worktree: stage+relay edit → main-agent-graph-relay kind=subagent scope=dialect (log drelay-fix1); body edit without relay → worker-graph-readonly (log drelay-fix2-body). The stage-rule-allowed edge (editAttempt undefined) stays read-only — the inner-chain-first shape has no yield hole. Temp green worktree removed.
- [stage 4] GATES ALL GREEN on the branch (design-relay-fix, worktree dist):
  - `npm run build` exit 0 (build-info e09a269 dirty — untracked progress file only).
  - `npm run preflight` exit 0 (22 rows composed; logs .llm/logs/drelay-gate-preflight.log).
  - `npm test` exit 0; ratchets flat eslint 73 / knip 18 / jscpd 1 (logs .llm/logs/drelay-gate-test.log). First run failed on environment gaps, not the change: the worktree lacked node_modules (fixed by pnpm install) and the untracked .agents/tasks/m5/lessons-seed.json (copied from the main checkout, stays out of git).
  - probe `node scripts/probe/run-probe.mjs` → 605/605 passed, exit 0 (log .llm/logs/drelay-gate-probe.log, run dir glm-hourness-probe-2026-11-14T02-40-44-063Z-Ddciqy). Mid-run peek confirmed both red scenarios back green: glm-design-question journal main-agent-graph-relay|subagent|graph_edit; glm-design-modules main-agent-graph-stage|subagent|graph_edit.
- Env note: probe-lock held by m7-p3 (their gates); this lane took .llm/probe-lock-2 (owner.txt written, renewed through the probe, released before the merge-day build on main).
