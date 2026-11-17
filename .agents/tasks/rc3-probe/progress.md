# rc3-probe lane progress

Repo main at ec51d46f. Lane: run the full 620-check probe on the newly installed DSH desktop 0.2.2-rc.3, triage reds as drift-vs-defect per FACTS §3 rc.1 precedent, land outcome.

## Stage 1: environment verification (2026-11-18)

- Installed app confirmed 0.2.2-rc.3: `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar` contains `"version": "0.2.2-rc.3"` (read-only grep of the asar binary, multiple hits; `app-update.yml` channel nightly). cordis in the asar dependency tree still 4.1.0.
- Probe lock slots `.llm/probe-lock` and `.llm/probe-lock-2` both empty (no owner.txt, no JSON declaration) before build — safe per DEVELOPMENT §5.10.
- FACTS §3 rc.1 transition rows located (exit-1 tailOk shapes line 245, rules-vote cancelled lifecycle line 246, fs-observation drift line 247; deferred-tool availability / structured_output rows referenced from DESIGN).
- `DSH_DESKTOP_DIR` consumption verified: `scripts/sandbox.mjs:59` — `const desktop = process.env.DSH_DESKTOP_DIR ?? join(LOCALAPPDATA, 'Programs', 'DeepSeek Harness')`; it must contain `DeepSeek Harness.exe`. The rc.1 export `reference/dsh-desktop-0.2.2-rc.1/` is a node_modules-style export tree, not an install dir (no exe), so pinning to it for attribution will NOT work as-is; would need a real rc.1 install dir. Noted for later.

## Stage 2: gates (2026-11-18)

- `npm run build` exit 0 — `.llm/logs/rc3-build.log`.
- `npm run preflight` exit 0 — `.llm/logs/rc3-preflight.log` (2 packages, 23 rows composed).
- `npm test` exit 0 — `.llm/logs/rc3-test.log`; verbatim OK, eslint 69 suppressed, knip 18, jscpd 1 (ratchets unchanged), gitleaks clean.

## Stage 3: probe run 1

- Probe started, claimed `.llm/probe-lock` itself (pid 29540), log `.llm/logs/rc3-probe-1.log`.
- Pin-class map gathered while waiting:
  - `tailOk` in run-probe.mjs:4522 already accepts both exit 0 and the rc.1 exit-1-with-stdout-done shape, so headless exit-shape drift alone should not red the drive scenarios.
  - rules-vote lifecycle pins at 5746/5750 pin ticket terminal state `cancelled` with `clearedAt < closedAt` (rc.1 saw root session end). If 0.2.2-rc.3 returns to the 0.2.1-rc.3 shape (`cleared`), these two red as drift.
  - fs-observation: FACTS 247 says 0.2.2-rc.1 ships `dsh-fs-observation-policy` disabled; the "rc.3" named there is 0.2.1-rc.3 (evidence `reference/dsh-desktop-0.2.1-rc.3/`). Whether 0.2.2-rc.3 enables it by default decides the write-before-read pins.
  - structured_output handback and DeferredToolCall pins live in the exec/dispatch scenarios (line 1243+).
- Result: **465/620, exit 1** — 155 reds. Kept artifacts `glm-hourness-probe-2026-11-17T19-46-34-411Z-TLFafs`.

## Stage 4: triage of run 1 (2026-11-18)

Two root causes confirmed with read-only evidence from the installed 0.2.2-rc.3 asar (extracted with Electron node mode to a temp dir; no rc.3 reference export exists yet):

1. **`subagents.startActivation` contract flattened** (substrate drift → our code broke). 0.2.1-rc.3/0.2.2-rc.1 nested `parent`/`prompt`/`cwd`/`agentOptions`/`outputSchema`/`maxDepth` under `spec.request`; 0.2.2-rc.3 takes them at the top level (installed asar `dsh-subagent/lib/index.js` startActivation :3018–3036 reads `spec.parent.id`, `spec.maxDepth`, `spec.outputSchema`; `startLocal` :1478–1576; `assertCapabilities` :3269+). Evidence of the break: `dispatch-failed "Cannot read properties of undefined (reading 'id')"` in glm-dispatch/dispatch.jsonl and `dispatch_task` refusals `the subagent could not be started: ... reading 'id'` in exec scenarios. Explains ~130 of the 155 reds (every scenario with dispatched workers/children: exec dispatch/plan/review/docs/merge/merge-upstream/modules/skeleton/walk/user-graph/drive-cascades, dispatch (a)(b), goal-agent children, memory worker, host instructions, graph live, guard request worker, lessons-failure via `started === undefined`, design child scenarios).
2. **`agents.roots()` removed** (substrate drift → silent role-layer death). 0.2.1-rc.3's `AgentRegistry.roots()` (top-level agents) is gone in 0.2.2-rc.3 (installed asar `dsh-agent/lib/index.js`: `get` :720, `list` :727, no roots). Only `src/design/index.ts` required it via `service(ctx,'agents',['get','roots'])` → whole service rejected → `isMain` silently undefined (try/catch) → every face-policy source resolved NO_REMOVALS → the entire role face layer died: Write/Edit/ask_user_question stayed on the main agent's face, propose_to_human/record_human_answer stayed on ordinary faces (design idle/main/one-main/persona checks), while the dialect layer kept working (aliases replaced natives). Identity section still applied (projections path, no agents dependency) — matches the observation exactly.
   - Note: rc.1-era probe stderr stayed clean (no FACES_NOTE warning) because the registry service itself was provided; only the design row's source went dead through the rejected agents service.

Also found while tracing: `waitForChildren` renamed to `waitForTreeWork` (rc.3 subagent :3086–3088) and service-level `listChildren` gone (moved inside rootOf/namesO) — both were pinned in `SubagentsService` but never called by our code; `probe-dispatch.mjs` had two live `ctx.agents.roots()` calls (goal-created note, probe_wait_goal target search).

Face-count arithmetic cross-check: ordinary GLM face 18 = natives(16) + 2 design tools (policy dead); main face 23 = ordinary + 5 main-only tools (execute 4 + takeover 1). Non-GLM 58/63 same pattern. No independent native-face growth indicated.

Unexplained-after-root-causes (to re-triage on run 2): env-checks-ceiling (4), goal (c) (4, driver admitted round 1 but no request — session log has header only, no step events; projcache shows no model selection), exec-drive goal creation, loops-peak (2), rules-peak-stop journal shapes, dispatch settlement duplicates.

## Stage 5: fixes (2026-11-18)

- `src/shared/dsh-min.ts`: `SubagentStartSpec` flattened; `SubagentsService` reduced to called members (interrupt/startActivation/resolveMaxDepth/registerProvider) — stale `waitForChildren`/`listChildren`/`sendMessage` pins dropped with comment; `DesignAgentsService.roots()` → `list()` with comment citing installed 0.2.2-rc.3 asar lines.
- Spec-building sites flattened: `src/execute/dispatch.ts:645`, `src/execute/walk.ts:729` (+ `WalkStart` type), `src/execute/gate-provider.ts:127`, `scripts/probe/probe-dispatch.mjs:171`.
- `src/design/index.ts`: `service(..., ['get','list'])`; `demoteOthers` iterates `registry.list()` (subagents filtered by the existing origin check).
- `scripts/probe/probe-dispatch.mjs`: two `ctx.agents.roots()` → `list()` with origin filter (goal-created `root` note, probe_wait_goal target).
- Test fakes/assertions to the flattened shape and `list`: tests/execute-repo.ts (startActivation like rc.3's startExternalNamed), execute-row.spec.ts (fake + 4 assertions), execute-handback.spec.ts, execute-reconcile.spec.ts, execute-walk.spec.ts, execute-check.spec.ts, design-host.ts, design-mode.spec.ts.
- Gates after fixes: build exit 0 (`rc3-build2.log`), npm test exit 0 (`rc3-test2.log`, ratchets unchanged: eslint 69, knip 18, jscpd 1).

## Stage 6: probe run 2 (2026-11-18)

- **608/620, exit 1** — `.llm/logs/rc3-probe-2.log`; the two root-cause fixes recovered 143 of 155 reds. Artifacts `glm-hourness-probe-2026-11-17T20-38-44-163Z-z5rGom`.
- Remaining 12, three clusters, all triaged to root cause:
  1. **rules-peak-stop (7) + rules-peak-stop-exit (1) — drift**: 0.2.2-rc.3's goal-round-driver no longer drives a delegated session. Its `drive()` waits on `subagents.waitForTreeWork(agent)` (renamed from 0.2.1-rc.3's `waitForChildren`, whose rc.1 body had no gate), and rc.3's `waitForTreeWork` → `rootOf` throws UNAUTHORIZED for a session whose header origin is `subagent` (0.2.2-rc.3 dsh-subagent rootOf ≈:2258–2270); the driver catches and disarms the goal. Run-2 evidence: stop-created (origin subagent, goal armed) → stop-paused ok:false with the goal disarmed and 0 rounds, no request ever reaching the provider; the probe row's `goal/changed` listener records no disarm event. Adaptation: `probe_stop_goal` wakes the GLM stop child directly (`followup`, the same notice the non-GLM child gets) so the board's refusal + goal pause still fire inside the child's own call; runner re-pins: `roundsStarted === 0`, no goal-round message in any child request (was `roundsStarted === 1`, round 2 of the driver). V13's check is already two-branch (row-unloaded vs runner-left) and needed no change.
  2. **exec dispatch plain subagent (2) — drift**: 0.2.2-rc.3's `subagent` tool still renders `started subagent <name>` but `<name>` is the tree name (agent-1, …), not the child's session id (0.2.2-rc.3 dsh-tool-subagent render; the subagent tool also gained a `name` parameter with default names by dispatch order). The runner matched the captured name with `bySession` → empty. Re-pin: the plain session is the scripted session left over once the main session and the dispatched worker are excluded; the `started subagent` render text stays pinned.
  3. **exec plan send_message (2) — drift**: 0.2.2-rc.3's model-facing `send_message` takes `{agent: <tree name>, message}` (addressing via `subagents.resolveName`; dsh-tool-subagent-control) where rc.1 took `{agent_id: <child id>, message}`; validation error `missing required property "agent"`. Same-tree delivery semantics widened: rc.3's `deliverToMember` refuses only targets outside the sender's tree ("target belongs to another subagent tree"), so the sibling message (rc.1: UNAUTHORIZED) now delivers. Re-pin: worker1 → `agent: 'agent-1'` (task-2's child, dispatched first), main agent → `agent: 'agent-2'`; the sibling check pins the delivery confirmation instead of the refusal.
- Coordinator intel (desktop lane `.agents/tasks/desktop-l4-new/progress.md`, commit b049b3ef) recorded: (a) rc.3 `bind.ts:438` reconcile cannot see `lastDelivery` on the outer task row — OUR adaptation gap, owned by the loops/desktop lane (this lane's loops-peak is green on run 2 and does not exercise the tell-main chain); (b) rc.3 schedule-notification flood with two live boards (multi-board only; each probe scenario runs one scratch board); (c) rc.3 session journals may carry malformed JSON lines (this lane's checks parse probe-written jsonl, not session journals); (d) rc.3 removed `useAnchoredPosition` — desktop UI (GLM pill, wish button, panel) fails to render; the headless probe does not cover it, so the FACTS baseline note scopes the floor to headless behavior.
- Gates after re-pins: build exit 0 (`rc3-build3.log`), npm test exit 0 (`rc3-test3.log`, ratchets unchanged).

## Stage 7: probe run 3 (2026-11-18)

- **618/620, exit 1** — `.llm/logs/rc3-probe-3.log`; artifacts `glm-hourness-probe-2026-11-17T21-21-09-275Z-bugc1x`. Remaining 2, both in rules-peak-stop, one root cause:
  - **the post-resume wake to the delegated child never landed — our adaptation gap (defect class, fixed at the root)**. `releaseStop` resumes the goal, then delivers the wake; `wayTo` (src/rules/wake.ts, the wake table the rules and loop boards share) sends an idle agent with an active goal an **inject** — on 0.2.2-rc.1 the goal driver's round 2 carried that inject into a request; on 0.2.2-rc.3 the driver starts no round for a delegated session (stage 6, cluster 1), so the injected notice sits in an inbox nobody reads and the child never continues (run-3 evidence: ops create,pause,resume correct, ticket done with resumedAt, but 0 wakes in the session and the goal never completed). Fix in `wayTo`: a delegated session never gets the inject — an idle delegated agent is followed up (root sessions keep the inject; their driver still rounds). The wake text/dedup pins unchanged.
  - L2 updated: tests/rules-tickets.spec.ts six `wake:inject` pins for sub-1 flipped to `wake:followup`, plus a new WAYS-style case pinning the delegated-with-active-goal → followup rule; the inject pins for the root agent stay.
  - Collateral caught by L2: `tests/execute-helpers.ts` noticeHost's fake agent carried no `session` (out of the `LiveAgentLike` contract); `wayTo` now reads the header's origin, so the fake got the session member.
- Gates: build exit 0 (`rc3-build4.log`/`rc3-build5.log`), npm test exit 0 (`rc3-test5.log`, ratchets unchanged: eslint 69, knip 18, jscpd 1).

## Stage 8: probe runs 4 and 5 (2026-11-18)

- Run 4 crashed in the runner itself: the design-interview result reader hit `goal.body` undefined (`(goal.body ?? '').split` added at run-probe.mjs:4261 by the orchestrator; the crash was a runner null-handling bug, not a host or bundle defect). The design-interview scenario itself did not fail — the same scenario ran clean in run 5, so the earlier stage-4 "unexplained" interview crashes stand as collision noise, no action.
- Run 5: **618/620, exit 1** — `.llm/logs/rc3-probe-5.log`; artifacts `%TEMP%\glm-hourness-probe-2026-11-17T22-27-29-703Z-Nf9FlS`. The stage-7 wayTo followup fix landed: the wake now reaches the delegated child (run 3 had 0 wakes, goal never resumed its work; run 5 delivers it). The two remaining reds, both in `rules-peak-stop`, triaged in stage 9.

## Stage 9: triage of run 5's two reds and the fix (2026-11-18)

Ground truth from run 5's `rules-peak-stop/requests.jsonl` + `dispatch.jsonl` and read-only greps of the installed 0.2.2-rc.3 asar:

1. **`/rules peak 无影响 … woken at once … told to carry on` — our runner accounting defect (fixed), not host drift, not wayTo ordering.** The wake was delivered exactly once, as a followup, and rode the child's first post-resume request (request index 2, ~75 ms after the lift). The evidence `0, 0, 1, 1 wake(s) per request` is accumulation: each request's message list carries the whole history (scripted runs never compact), so the single wake counts in requests 3 and 4 and the stage-6 `stopWakeCount` (a sum over requests) read 2. Fix: the session's wake total is the count in the last request's history; evidence prints the last request's wake texts (no double print) plus the session total. The stage-7 wayTo decision stands: followup is the earliest channel that reaches the child (steer is for a running agent; the child is idle at delivery), so "woken at once" = "rides the next request".
2. **`the goal ends complete after that round …` — host drift (re-pinned).** 0.2.2-rc.3's dsh-goal grants `update_goal complete`/`blocked` authority through exactly two paths (`completionAuthority`): a direct human turn (`hasDirectHumanInput`) — which returns false for **every** session whose header origin is `subagent`, regardless of the message source — or the exact current goal round (`isMatchingGoalRound`, needs a user/message with source kind `goal` carrying goalId/revision/round). rc.3's driver starts no rounds on a delegated session (stage 6 cluster 1), so both paths are structurally unreachable: a delegated session's goal can never reach `complete` on rc.3. Run-5 evidence: the child's `update_goal complete` was refused with `Error: complete and blocked require a direct human turn or the current goal round` (child request 4), the goal stayed `active` with activation `disarmed` (the driver's failed drive disarms it right after the resume), while every ticket conjunct held (state done, signature, sessionId, pausedGoal id + revision 2, resumedAt). Re-pin: goal stays active + disarmed after the lift and the complete attempt is refused with the host's authority sentence; the ticket half unchanged.
- Both changes are runner-only (scripts/probe/run-probe.mjs): the stopWakeCount accounting block (with its comment rewritten for the rc.3 shape) and the rewritten check. No production code moves, so no L2 flips; the wayTo inject pins for root agents in tests/rules-tickets.spec.ts stay as stage 7 left them.

## Stage 10: gates, probe run 6, floor reached (2026-11-18)

- Gates on the stage-9 tree: build exit 0 (`rc3-build6.log`), preflight exit 0 (`rc3-preflight6.log`), npm test exit 0 with 3963 ok / 0 not ok (`rc3-test6.log`); ratchets unchanged (eslint 69, knip 18, jscpd 1), gitleaks clean.
- Probe run 6: **620/620, exit 0** — `.llm/logs/rc3-probe-6.log`; artifacts `%TEMP%\glm-hourness-probe-2026-11-17T23-06-34-188Z-t1y19X`, ~22 min. The rc.3 headless floor stands at 620/620 (docs/FACTS.md §3 row).
- The two re-pinned checks passed with the designed evidence: `0, 0, 1, 1 wake(s) per request, wake at request 2, 1 in the session` (one wake, delivered at the first post-resume request) and the active+disarmed goal with the host's completion-authority refusal.
- The lane's working-tree adaptation is landed in cluster commits (stage 5 contract adaptation, stage 6 probe-plugin wake, stage 7 wayTo, stage 6/8/9 runner), plus the FACTS/HANDOFF baseline record.


