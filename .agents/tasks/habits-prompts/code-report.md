# habits-prompts: code step report

Workflow: wf_7bd410e5bb88654f, step build-loop/code.
Worktree: .worktrees/habits-prompts, branch habits-prompts, base origin/main cf0ed57, fast-forwarded to origin/main 7d9355e (graph-only commit that opened habits-prompts and edited the hourness non-goal).
No review.json at start: first pass, implementing the task.

## Progress

- Report file created.
- Read report .agents/tasks/habits-framework/report.md 3.1 (H4a, H6/H7, H9) and 3.3; graph nodes habits-prompts, d-habits-into-framework (show only).
- Measured before the change: MAIN_AGENT_ROLE 1137, MAIN_AGENT_TALK 1767 (cap 1800), MAIN_AGENT_IDENTITY 2906 (cap 3000); graph_propose description 661 (cap 700 in tests/graph-tools.spec.ts).
- Consequence found: the talk part cap (1800) is also exceeded by one more sentence (about 170 characters); it rises to 2000 with the whole to 3200 (role 1137 + 2 + 2000 fits 3200). graph_propose needs its own cap above 700 for the norm sentence.
- Code edits done: src/graph/reopen.ts (SECOND_FIX_NOTICE, header comment), src/graph/tools.ts (reworkNoticeAfter returns it at REOPEN_LIMIT - 1; NORM_INTENT_NOTE in the graph_propose description; output-schema notice description), src/design/talk.ts (reliability sentence), src/design/persona.ts (header comment cites the rewritten CHARTER §9).
- Measured after: role 1137, talk 1939, whole 3078 (caps 1500 / 2000 / 3200); graph_propose description 860 (cap 900).
- Tests: tests/graph-loop-entry.spec.ts (new test: first none, second SECOND_FIX_NOTICE with nothing filed and no board run, third only the question notice; the count-restart test now expects the sentence at the second reopen of the new window), tests/design-mode.spec.ts (caps 2000/3200 with reason; sentence pinned in TALK_GUIDE and the identity), tests/graph-tools.spec.ts (graph_propose cap 900 with reason; norm sentence present only in graph_propose).
- Docs: CHARTER.md version 0.9 with its status line, §9 storage-table row rewritten plus one paragraph under the table (engineering habits are framework defaults, levels per report 3.1); ORCHESTRATION.md §2.4 reopen clause rewritten whole, §3.1 identity clause (talk guide content and caps) rewritten, §3.1 persona clause citation updated, §6.4 rules table row rewritten.

## Decisions taken in this step

- The second-fix sentence uses the same counting window as the third-rework question (reopensAfter since the last closed question), so after the human answers a question, the second reopen of the new count carries it again; the existing third-fix notice already words its window the same way ("about to get its third fix").
- A relayed reopen (the human's own) carries no sentence, like the third-rework path.
- A subagent caller gets the same sentence (it is the one that changes code).
- While a third-rework question is open, a reopen carries nothing (unchanged behavior; the sentence check sits after the open-question check).
- The talk-part cap (1800) is raised to 2000 together with the whole (3000 to 3200): Q3 named only the whole, but the sentence cannot fit under 1800; the role cap 1500 is unchanged.

## Test failures met during npm test

- jscpd (lint ratchet) flagged the first draft of the new graph-loop-entry test as a clone of the third-reopen test (6 lines). Rewritten without the duplicated block; ratchet back to eslint 73 / knip 18 / jscpd 1.
- tests/loops-run.spec.ts test 12 ("a person's adopted script entry runs through the shared executor ...") failed twice inside the full npm test (state.last[script.id] undefined, expected 'ran') and passed 4/4 run alone. Cause: src/loops/run.ts writes the loop-done record and only then awaits inbox.save(); untilDone returns on the record, and the test read state.json directly, so under load it read the file from before the save. Test 15 of the same file already waits through savedState for this reason (its comment says so); test 12 did not. Fix at the cause, test only: test 12 waits with savedState until state.last has the entry; savedState reads pending and last. No src change.
- tests/lessons-seed.spec.ts (3 tests) failed with "lessons-seed.json does not exist": the operations file .agents/tasks/m5/lessons-seed.json is git-ignored by design (the spec says to write it into the checkout), so a fresh worktree lacks it. Copied from the main checkout into this worktree (untracked, ignored). Not a code change.

## Gates

(filled in below as they run)

- Commit 4598fa7 (feat(graph,design): second-fix notice, report reliability, norm intent) on habits-prompts, pushed to origin/habits-prompts. Gates before commit: build 0, preflight 0, npm test 0, check-lint 0 (eslint 73, knip 18, jscpd 1). Probe next.
- npm run -s probe on 4598fa7 under .llm/probe-lock (owner "wf_7bd410e5bb88654f build-loop/code", refreshed every 5 min, refresher stopped before the lock was deleted): exit 0, 420/420 passed; artifacts .worktrees/habits-prompts/.llm/probe-runs/2026-11-05T15-50-45-468Z. Lock released.
- Final: commit 4598fa7 on origin/habits-prompts. Gates: build 0, preflight 0, npm test 0, check-lint 0 (eslint 73 / knip 18 / jscpd 1, unchanged), probe 0 (420/420). docs/graph not written (brief: the orchestrator records graph state). Not landed on main.
