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
