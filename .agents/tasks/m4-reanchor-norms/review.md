# Review: m4-reanchor-norms (branch side)

Branch m4-reanchor-norms, base origin/main c254b91 (main tip 596f31e is a graph-only commit after it); commits 7f261f9 (behavior, L2, L3 check and scenario, ORCHESTRATION §2.5) and 23550c4 (FACTS row, ORCHESTRATION host-instructions item). Worktree clean.

## Evidence

- Item (1): `src/graph/reanchor.ts` `goalNorms` takes the focus's goal (`goalOf`), its subtree without the goal, keeps type `norm`, status approved/doing/done, `liveOf`, id order; `reanchorLines` adds a header line plus one `- <id>: <title>` line per norm, only when a goal was projected and norms is non-empty. `src/graph/reminder.ts`:181 computes norms only when `reason === 'compaction'` and the graph was read; the extra lines stay out of `graphProjection.digest`, so the next step and ordinary steps are unchanged (same cache argument as the violations part).
- L2 (`tests/graph-reminder.spec.ts`): absent (goal without norms gives text equal to the first projection), present (exact text with norm-docs under a feature and norm-tests under the goal; dropped, proposed and other-goal norms left out; digest unchanged), ordinary step (new norms add nothing before compaction; step after re-anchoring adds nothing; changed and goal-round notices carry no norms). gates/test.log and gates/reminder-spec.log: the test passes, fail 0.
- L3: probe run 2026-11-05T22-40-10-793Z, 426/426 (gates/probe.log), including the glm-graph-compact norms check (goal hourness, 5 norms, 0 in other projections) and the existing denials/non-goals check.
- Item (2): scenario `glm-compact-instructions` (own DSH home with user AGENTS.md marker, workspace AGENTS.md marker, compaction every step, one dispatched child); three checks PASS: baseline in first request, after each of 4 checkpointed requests (8 compactions), and in the child's first request. FACTS.md §3 row records the measured result with source and mechanism; ORCHESTRATION.md §2.5 states it.
- ORCHESTRATION.md §2.5 marks the norms section implemented in 7f261f9, the same commit as the behavior.
- Gates: build exit 0, preflight exit 0, npm test exit 0, lint ratchet eslint 73 / knip 18 / jscpd 1 (not risen), probe 426/426. Commit messages state the cause of the one lint fix (clone reused via helper). No BOM in changed files; no tone words in files or commits; docs/graph untouched.

## Non-blocking notes

- The brief says "id prefix norm-"; the code selects by node type `norm`. Engine-generated norm ids are `norm-<n>` and all norms in the project graph carry the prefix, so the two coincide in practice; type is the stricter criterion.
- 23550c4 is docs-only; its gates are the 7f261f9 tree runs plus the probe run, as stated in the commit message.

## Blockers

None.
