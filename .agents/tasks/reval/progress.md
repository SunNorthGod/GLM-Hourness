# reval implementation progress

Lane: reval (branch reval, base f3b7b767 design 0.2 + merge of origin/main 8be6f8ec).
Plan: .agents/tasks/reval/design.md 0.2, §12 batches R1-R4, probe, merge.

## Stage log

- 2026-11-13 setup: merged origin/main (docs-only, ort, 2 files). Read design 0.2 fully; read pins.ts, attempts.ts, dispatch.ts, handback.ts, brief.ts, gate-norm.ts, floor.ts, digest.ts, checker-config.ts, env/branch.ts, rules/store.ts, metrics kinds/execute.ts, shared/metrics.ts, execute/metrics.ts, drive.ts (rebuiltAttempt), test specs (attempts/floor/review/notice/reconcile/handback rig), run-probe.mjs glm-exec scenarios.
- Key implementation decisions:
  - Probe pins land on glm-exec-review (the scenario that actually runs dispatch_task + handback + review dispatch; design's "glm-dispatch" attribution points at the dispatch-feasibility group, which does not exercise the execute row). Negative control lands on glm-exec-docs (two workers + review brief, no policy change). The floor change mid-flight goes through probe_human_write (engine write as human, precedent in glm-exec-modules); the probe overlay row is added to exec-review's overlay to carry it.
  - execute-policy.spec.ts goes into package.json test:2 chain.
  - The 'policy' notice payload shape is asserted in execute-handback.spec.ts (the rig with the sent capture lives there; execute-notice.spec.ts is the dispatch-status notice, a different subject).

## R1 landed (commit pending at write time)

- src/execute/policy-digest.ts: four-class digest (gate=normDigest(parseGateNorm), floor=parseFloor entries+unparsed, rules=text digest with absent==empty and unreadable marker, checker=envBranch config paths); renderPolicyLine/parsePolicyLine (prefix search, whitespace-tolerant, last line wins, missing class omits its segment); policyStaleness (per-class changed/missing/unreadable, undefined line = exempt, omitted class + computable now = changed, both sides unreadable = silent); renderPolicyDrift/parsePolicyDrift for the 政策差 line.
- GATE_NORM_ID/FLOOR_NORM_ID/POLICY_CLASSES kept module-local (knip ratchet 18 holds).
- tests/execute-policy.spec.ts: 8 tests green (no-drift under unrelated activity/revision, class isolation, missing on delete/supersede, rules absent==empty and unreadable rules, round trip, whitespace tolerance, fail-closed omitted class, 政策差 round trip).
- package.json: execute-policy.spec.ts added to test:2.
- Gates: build OK, preflight OK, npm test green after copying the local (gitignored) fixture .agents/tasks/m5/lessons-seed.json from the main checkout into the worktree; eslint 73 / knip 18 / jscpd 1 unchanged.
- Worktree note: node_modules was absent in the worktree; npm install was run once (untracked, gitignored).

## R2 landed

- attempts.ts: Attempt/DispatchComment/DispatchRecord gain policy?: string; renderDispatchComment writes the policy line after pins; parseDispatchComment finds pins AND policy by prefix from the end (position independence), old-format comments parse with policy absent.
- dispatch.ts: policyDigests computed at dispatch time (rulesReadOf reads <root>/docs/rules/rules.json: ENOENT=absent, other error=unreadable), rendered into the register entry and the dispatch comment for every role.
- handback.ts: rulesReadOf helper (RulesRead from the rules file) lives here, imported by dispatch.
- drive.ts rebuiltAttempt: carries policy from the DispatchRecord (reconcile rebuild).
- tests: execute-attempts.spec.ts +2 (round trip with policy, prefix-not-position, old format + trailing junk), execute-reconcile.spec.ts +1 (rebuilt attempt carries policy), execute-row.spec.ts assertion updated (comment now ends with the policy line; fixture has no norms, so rules+checker only).
- Gates: build OK, preflight OK, npm test green (one pre-existing assertion in execute-row.spec.ts updated for the new comment shape). L2 counts: attempts 12, reconcile 12, row 11, policy 8.

## R3 landed

- handback.ts workerHandback: after the stale check, policyDigests recomputed from the loaded graph + rulesReadOf(projectRoot) and compared against attempt.policy (undefined line = exempt per design §4.2). Drift > 0: the handback comment carries the 政策差 line (policyDrift classes), a 'policy' notice (fourth event kind in notify's union) with the classes in summary and text, and execute.policy-drift {task, attempt, classes}; the done flow untouched (drift handled before the stale early-return and before the done flow).
- attempts.ts: HandbackComment.policyDrift?: readonly PolicyClass[]; renderHandbackComment writes the 政策差 line after the depth line; parseHandbackComment extracts it prefix-wise (position independent).
- metrics: execute/metrics.ts MetricEvent + shared/metrics.ts ExecuteBodies + kinds/execute.ts TABLES all gained execute.policy-drift (task id, attempt int, classes id[]); kinds header now says twenty-two kinds. Compile-time contract check held.
- Root-cause fix found by L2: my first R2 draft computed the policy digest between startActivation and registerAttempt — an async window where a started child is not yet registered. tests/execute-handback.spec acceptance-re-dispatch test failed intermittently (the test's processed() gives up when the entry is not yet set, disposes the rig, and the in-flight comment write then hits the deleted tree). Fix: the digest is computed before services.start, so start -> register stays one synchronous stretch, as §3.1.4 requires. This also protects production: a yield there would leave the child's first calls outside the write gates' register checks.
- Deviation from design §12 R3: the 'policy' payload-shape assertions live in tests/execute-handback.spec.ts (deepEqual on source.hournessExecute), not tests/execute-notice.spec.ts - that spec is the dispatch-status notice, a different subject; the handback rig owns the sent-notice capture.
- jscpd: the first draft of the drift tests cloned a 6-line setup; extracted dispatchedWithPolicy helper - ratchet holds at 1.
- Gates: build OK, preflight OK, full npm test green; eslint 73 / knip 18 / jscpd 1. L2 counts: handback 23.

## R4 landed

- brief.ts: ReviewBriefInput.policyDelta?: readonly string[]; renderReviewBrief writes the design 4.3 bullet verbatim in the context section (after the previous-round findings, before the project checks) when the delta is non-empty.
- dispatch.ts: the taskReview branch passes reviewHandback.policyDrift (the latest done handback's parsed 政策差 classes) as policyDelta; reviewTargetOf untouched (policy drift is not stale, design §8).
- tests: execute-brief.spec.ts +1 (delta section verbatim, in-context placement, absent when missing or empty; the review-input builder extracted and shared with the docs test after jscpd flagged the clone), execute-row.spec.ts +1 (staged done handback with 政策差: floor -> review dispatch passes the gate and the reviewer brief carries the delta; a later handback without a drift brings no delta).
- Deviation from design §12 R4: the review-dispatch wiring test lives in tests/execute-row.spec.ts, not tests/execute-review.spec.ts - that spec is the review.ts pure functions (normalizeVerdict, converge) and has no dispatch rig; the row spec owns dispatchTool with fakeSubagents.
- Gates: build OK, preflight OK, full npm test green; eslint 73 / knip 18 / jscpd 1. L2 counts: brief 31, row 12.

## Probe landed

- glm-exec-review (the scenario that actually runs dispatch_task + handback + review on the execute row; the design's "glm-dispatch" attribution points at the dispatch-feasibility trio, which does not exercise the row): seeds gain norm-merge-gate (so the policy line carries all four classes); the script gains a probe_human_write step between the worker dispatch and the handback sleep (the person widens norm-review-floor by one parseable class while the worker runs, the engine-write path the design names); the overlay gains the probe row to carry probe_human_write (probe-dispatch.mjs itself unchanged). reviewChecks gains the three pins: dispatch comment ends pins+policy (four 12-hex segments), handback names 政策差：floor + a policy notice reaches the holder, the first reviewer brief carries the design 4.3 delta sentence verbatim. Diagnostic fallback indices updated for the inserted step.
- glm-exec-docs: two negative checks (neither handback comment carries 政策差 and no policy notice; the reviewer brief has no delta section). probe-dispatch.mjs unchanged.
- Expected end state: the 5 new checks pass, the 18 baseline labels unchanged (567/585).

## metrics kind-list fix

- The R3/R4 full chains were cut short at the jscpd gate inside test:1, so the spec files after it (metrics-schema among them) never ran; the final chain caught it: tests/metrics-schema.spec.ts pins every namespace's kinds against the metrics design's sections, and execute.policy-drift was missing from both. Fixed .agents/tasks/metrics/design.md (count 23 -> 24, name list gains policy-drift, field table gains the row, cited to reval design 0.2 §4.5) and the pinned list in tests/metrics-schema.spec.ts. Lesson recorded: a full chain's exit code must be checked even when the known ratchets print ok.

## Probe verified

- Probe 1: 566/585 - the policy-notice check failed on a checker-side read: the recorded request messages carry only source.kind (probe-llm.mjs summarizeMessage), so source.hournessExecute is not there to read; the notice itself WAS delivered (found in the kept run dir's requests.jsonl). The shipped code is correct; the payload shape stays pinned by the L2 test on the UserNotice object. Fixed the two reval checks to match the notice text instead.
- Probe 2: 567/585 - all five reval checks pass, the 18 baseline labels unchanged, none of the failures is a reval check. Lock .llm/probe-lock taken with owner.txt, refreshed during the run, removed after. No rebuild during the probes. Logs: reval-probe-1.log, reval-probe-2.log (in this directory).
