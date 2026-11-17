# answer-race lane progress

## Stage 1: root cause (confirmed, not a timing race)

Probe check `exec review: after the answer the pass round is dispatched and runs`
fails with `dispatches 3`: the scripted 4th `dispatch_task task-2` (the pass
round, after `record_human_answer`) is refused `waiting_human` with
`stopped, no answer since: task-2`.

Evidence chain (artifacts `Temp/glm-hourness-probe-2026-11-17T12-38-39-163Z-Gi6PvS/glm-exec-review`):

- Stop mark `第 1 轮：挡路 1，不挡路 1 · 全审 · … · 停下` lands on the review
  task task-2 at 12:52:22.670Z (handback.ts taskReviewHandback stop path).
- `propose_to_human` creates question-1 with `parent: task-1` (the reviewed
  task — exactly what stopDraftOf tells the agent), decided at 12:52:30.861Z
  with the person's words as `relay` (record.ts `write` → engine decide).
- 12:52:34 the scripted 4th dispatch of task-2 is refused by
  `briefGate` → `waitingOn` (src/execute/brief.ts).
- `waitingOn(graph, task-2)` computes humanTimes over `subtreeOf(task-2)` =
  [task-2] only. question-1 (parent task-1) is outside that subtree, so the
  answer can NEVER lift a review stop — deterministic, any run, any timing.

Not the deferral (5a3a5a9c): record_human_answer writes the graph inside its
own tool execute (awaited engine.apply), no deferred effect involved; the
dispatch read a fresh disk graph (createGraphCache.load re-reads) 4s later.

Corroboration: the external wave's own probe runs (`.llm/logs/r2-probe.log`
18:55, `r2-probe-2.log` 19:39 local) failed the same check with the same
`dispatches 3` — the tightened pin (`dispatchComments.length >= 4`,
commit 3d9e1fb0) has never passed anywhere.

Machinery inconsistency (the bug): the review settlement reads the person's
baseline from `[reviewed.history, reviewTask.history, questions(parent ==
reviewed or reviewTask)]` (src/execute/handback.ts:798; check.ts:823 same
shape), so it unblocks and counts the next round from the answer — while the
gate refuses the dispatch that would start it. The design row (`stopped`,
EXECUTE_RULES): 停下标记之后、人回话之前不再派这件活与它的审查 — "人回话"
is the answer the stop flow itself directs onto the reviewed task.

## Stage 2: fix

waitingOn lifts a stop mark by the person's words read from the same places
the settlement reads them: the stopped entry's history, its parent's, and
questions proposed under either. (details after implementation)

## Stage 2: fix (implemented)

`src/execute/brief.ts` `waitingOn`: the person's word that lifts a stop mark
is now read from the places the settlement that wrote the mark reads one —
anywhere in the subtree (unchanged, pinned by the row-7 test's note-node
cases), plus per stopped entry: the entry's parent's history and the
questions proposed under the entry or its parent (`actor: human` or a
history item carrying `relay`), after the mark. This is exactly
handback.ts:798's set for a review stop (reviewed task + review task +
questions under either) and a superset of check.ts:823's (node + questions
under it), which the subtree scan already covered.

Why this is the design's intent, not assertion-shopping:

- The tightened probe pin (`dispatchComments.length >= 4`, 3d9e1fb0) states
  the pass round must be dispatched in-session; the stop flow itself
  (asks.ts stopDraftOf) directs the question onto the reviewed task, so the
  machinery must read the answer there. The gate was the only reader that
  did not: record.ts (decide), review convergence (latestHumanAt), the
  stop-draft and record_human_answer's own messaging all agree. The
  assertion stays as the wave wrote it; the machinery is what was broken.
- The deferral (5a3a5a9c) is exonerated with evidence: no deferred effect
  sits on the answer→unblock path; the decide write is awaited inside the
  tool; the dispatch's graph read is a fresh disk load; the wave's own two
  runs failed identically (deterministic, not a race).

L2 pin: tests/execute-brief.spec.ts, new case after the row-7 test —
`row 7, review stop: the answer on the question under the reviewed task
lifts the review task's stop`. Verified red on the old `waitingOn` (stash
run: 1 fail) and green with the fix; covers decided-question-after-mark
(the probe shape), the person's word on the reviewed task itself (the
handback fixture's way), and decided-before-mark still refusing.

Gates: build OK, preflight OK; npm test + probe results appended below.

## Stage 3: gates

- build: OK (tsc all five projects, ui, build-info)
- preflight: OK (2 packages, 18 source dirs, 23 rows composed)
- npm test (run as three chunks after the full-suite runner died twice
  mid-run — a Windows process-tree kill took the runner down without a
  summary; each chunk re-ran green in full): test:1 exit 0, test:2 exit 0,
  test:3 exit 0. Ratchets at the wave's baselines: eslint 69 suppressed,
  knip 18, jscpd 1 (7 duplicated lines); gitleaks clean.
- L2 sanity: the new pin fails on the old waitingOn (stash run: 1 fail /
  32 pass) and passes with the fix (33/33 in tests/execute-brief.spec.ts).
- probe run 1: 612/612 passed, exit 0 (.llm/logs/arace-probe-1.log). The
  failing check now reads `status done; dispatches 4; rounds 第 1 轮：挡路 1…
  | 第 1 轮：挡路 0…` — the answer lifts the stop, the pass round is
  dispatched, runs and settles done with the patch-id evidence.
- probe run 2: see below.

Commits: 06af9bc5 fix(execute) + pin; docs progress record (this file).

## Stage 4: parallel post-wave audit incorporation (.agents/tasks/postwave-audit/findings.md)

- F2 (the tightened assertion, run-probe.mjs:4636) and its "answer-visibility
  path" steer point at the same root cause fixed here; no deferral work
  needed (F4's silent-drop is real but out of scope: all six call sites are
  inside wrapped frames today — noting it for its own lane).
- The audit asks whether "answer seen but the pass dispatch refused again"
  is a deterministic outcome the pin should tolerate. It is not reachable
  by design once the mapping is fixed: after the answer lifts the stop the
  dispatch goes through; a refusal could only come from a NEW stop written
  by the pass round itself, and that state (review task doing, dispatches 4)
  already passes the check (`['doing','done']` + dispatches >= 4). So the
  assertion stays as 3d9e9fb0/3d9e1fb0 wrote it; probe run 1 shows the
  deterministic settled shape (`status done; dispatches 4`).
- probe run 2: 612/612 passed, exit 0 (.llm/logs/arace-probe-2.log, same
  `status done; dispatches 4` shape on the target check). An earlier probe 2
  attempt (22:46–22:59 local) was killed externally at ~15:00 UTC together
  with the orchestrator's cleanup — no conclusion from it, rerun instead.

## Stage 5: substrate note (coordinator relay, corrected)

The desktop app's updater staged an rc.3 release mid-lane; the coordinator
first reported the substrate as flipped, then retracted (ProductVersion
misread): the installed runtime is still 0.2.2-rc.1 (exe FileVersion, the
running instance's UA, and primary-runtime/runtime.json's
`desktopVersion: 0.2.2-rc.1` all read rc.1). Probe runs 1 and 2 both ran on
the rc.1 substrate, so the 612/612 floor stays calibrated. The rc.3
re-drift check remains a follow-up lane's item for when the person actually
restarts the app.
