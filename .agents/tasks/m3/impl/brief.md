Task: carry M3, the main agent, from its merged step 3 through to a merged main. Real code in this repository, with the full gates, step by step. An account usage limit cut off the previous run partway through step 4. M3 is the largest remaining item on the dogfood critical path; the person released its design and has switched to a fresh account to continue. Heavy: about eight steps across two worktrees, touching the agent's tool face, the guard, the project graph engine, the system prompt and the client UI.

Repository: c:\Users\29596\Desktop\Project\GLM-Hourness, base branch main (currently 419b6ea, pushed).

State, verified by the orchestrator and recorded on the project graph under orch and m3:
- Step 3 (graph node m3-1) is merged into main as 9c346fb. Its independent review (.agents/tasks/m3/impl/review-step3.md and .json) was APPROVED with zero blocking and seven non-blocking findings, and two conditions that still hold: keep the design row disabled until steps 4 and 6 are on the branch; fix the stale holder record (finding S3-1) before M5, M7 or the loop board read mainAgentOf.
- Worktree .worktrees/m3, branch m3 at 9c346fb, now behind main by graph-only commits. It holds a half-written step 4, uncommitted: modified src/guard/graph-files.ts, src/guard/rules.ts and src/guard/shell.ts, and new untracked src/guard/git-snapshot.ts and src/guard/main-agent-rules.ts. Treat it as a draft by an author who is gone: read the diff against the design, keep what is complete and right, redo what is not, and never commit a mixture you have not read. Bring the branch up to main before you build on it, and handle the uncommitted work deliberately while doing so.
- Worktree .worktrees/m3-flow, branch m3-flow at b4c23dd: step 11 (graph node m3-6, the flow bar and the /wish entry) is committed there, one commit ahead of main and behind it. It owes one L2 case that runs the plain-words check over the strings shown to the person; the check's module src/graph/plain-question.ts is now on main via step 3, so that case can be written once the branch is brought up to main.
- What remains, in the design's order: steps 4, 5, 6, 8, 9 and 10, then the persona step, then folding in m3-flow, then the calibration step, then the merge to main. Follow the design's step table for which graph node each step serves, which worktree it belongs in, and which steps need an independent review.

Authoritative design, in this order of precedence:
- c:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\m3\design-addendum.md, version 0.5, independently reviewed and APPROVED in round 5, amended to name the project-root function projectOf. Where it differs from the base design, it wins.
- .agents/tasks/m3/design.md for what the addendum does not restate.
- .agents/tasks/m3/onepage.md, which the person approved with the words 「可以复述，没问题」: nothing built may contradict it. That reply also settled that when the person answers with a short word like 「嗯」 or 「行吧」, the main agent restates 「那我记成：……」 and waits for a nod before writing the graph.
- .agents/tasks/m3/reviews/addendum-r5b.md and addendum-r5.json: two small findings, each fixed in the step it names. One concerns this repository's own graph, where the nodes orch and bottom carry a stage that the new module rules would read as an unreleased module; the orch node carries the orchestrator's note that the fix belongs to the step defining who may write a module's or a goal's stage. Resolve it there, check what it does to stage inheritance and the gates that depend on it, and record the choice in the commit message.
- c:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\design-context.md, all of it.
- The project graph, which outranks any document when newer: `node .agents/tasks/m1-l4/show-nodes.mjs m3 m3-1 m3-2 m3-3 m3-4 m3-5 m3-6 m3-main-persona orch dogfood`.

Shared modules on main that must be reused, never duplicated or renamed: src/data/project-root.ts (projectOf, gitDirOf, ensureIgnored) and src/data/lock.ts (the repository's only file lock: STALE_LOCK_MS, LOCK_WAIT_MS, LockEnvironment, realLockEnvironment, WriteLock, LockOptions). Main also carries M7's E0, E1a and E3 under src/execute.

Other runs at the same time: an M7 E3 follow-up in .worktrees/m7 (it changes src/data/lock.ts and src/execute/), and design-only runs under .agents/tasks/. Never touch .worktrees/m7. M7's later step E2 changes src/shared/tool-names.ts, which your step 6 also changes: whoever merges second folds the conflicting lines in mechanically without a new review; the same rule holds for src/data/lock.ts if the E3 follow-up merges first. Expect main to move; rebase before each merge and fast-forward the person's checkout with `git -C c:\Users\29596\Desktop\Project\GLM-Hourness merge --ff-only <branch>`, since git will not move a branch checked out in another worktree. Leave both worktrees in place.

Effort: xhigh for every code step and every review; low or medium for setup, rebases and merges.

Mandatory process from AGENTS.md, no exceptions:
- `npm run build` passes in a worktree before you change anything further in it.
- One step, one commit; the message names the graph node it serves; documentation and code in the same commit; no step split across commits. Commit as soon as a step is green: interruptions have now cut this task off three times, and committing often is what preserved finished work.
- After every step: `npm run build`, then `npm run preflight`, then `npm test`; before any merge to main, also `npm run probe`. All green. Judge npm test and npm run probe by exit code and failure count, never by stderr output, which their negative-path cases produce. If gates fail with "tsc is not a runnable program", dependencies were wiped; reinstall before concluding anything. If a probe failure looks like contention with another run's probe, wait and rerun.
- No new compiler or checker warnings; eslint, knip and jscpd baselines unchanged; suppressions carry a written reason.
- TypeScript strict with exactOptionalPropertyTypes; Node 22 strip-types compatible, no TS parameter properties; keep the type-level contract with the official DSH .d.ts files (AdapterContractCheck); do not mock DSH contracts, mocks only for network and filesystem.
- Every new plugin row is registered disabled by default, and its apply never throws: missing or malformed configuration degrades to a warn plus a no-op reported through row health.
- Write the L2 cases and L3 probe scenarios the design names, including the one step 11 owes. If one genuinely cannot be written, say which and why.
- Do not touch the person's ~/.dsh profile and do not start the desktop app; the desktop check of the persona stays a recorded to-do for the person.

Review, per norm-review-floor: every step that changes the main agent's tool face, writes user-level data or touches the decision journal gets an independent review of its diff before it merges, as the step table marks. Review against the addendum, the one-page note and design-context, with particular attention to whether the person's own words are genuinely verified rather than taken from the model's retelling, whether the main agent really has no way to write files, and whether anything holds the main agent during a peak. Fix what a review blocks on; if blocking findings on one step survive two fix attempts, stop and report.

Do not apply graph changes and do not push. Write a draft .agents/tasks/m3/graph-ops-impl.json, a plain JSON array (not an object wrapping one) of {"op":"comment","id":"<node id>","text":"..."} entries in Chinese, recording per step what was built, which commits carry it, which gates passed and which reviews ran, plus one entry for dogfood on what this unblocks and one for m7 on which of its steps E1b, E2 and E4 are now unblocked. The orchestrator applies, commits and pushes.

Report honestly: what you did with the half-written step 4, which steps merged, every gate result, every scenario you could not write, and anything in the design you had to interpret rather than follow.

Done when the steps the design lists are implemented behind their gates, the reviewed steps have passed review, main carries them, and the graph-ops draft exists.

## Orchestrator note, 2026-10-31 (after step 4 review)

Step 4 (bd91f2c) review is APPROVED with seven non-blocking findings (.agents/tasks/m3/impl/review-step4.md). The orchestrator rules that four of them are fixed on branch m3 before the merge step, each in its own commit with a failing-first test, in whichever later step first touches the same file (at the latest in the fold step):
- S4-1: under the PTC preset, nested calls dispatched by `run_code` carry `parent` and skip the main-agent rules, so the main agent can write files. Either the main agent's nested write-tool calls go through the same rules, or, when the tool mode is `ptc`, row health degrades and ORCHESTRATION §6.4 and §6.7 state the gap. Prefer the first. The claim "the main agent has no way to write files" must be true or stated as untrue.
- S4-2: the outbound check reads `remote.<name>.mirror` and `remote.<name>.push` without the command's own `-c` values; pass `invocation.configs` (or refuse when `-c remote.*` or `-c push.*` is present), with an L2 case.
- S4-3: after alias expansion, run the outbound check and the clean refusal again on the expanded call.
- S4-4: the guard's "Workspace rules" declaration still tells the main agent to use Write/Edit, which it does not have; drop or reword that line for the main agent before step 6.
S4-5 to S4-7 may be listed as residuals in ORCHESTRATION §6.7 instead.

New person decisions (2026-10-31), recorded on the graph: code rules block from the day their row is enabled, with no shadow period (d-code-rules-enforce); agents may read credential files (d-credentials-readable). The M3 rules already block, so nothing here changes; do not add any shadow mode.

## Orchestrator note, 2026-10-31 (after the S3-1 fix review)

The S3-1 fix (5d47374) review is APPROVED with three MEDIUM and one NIT finding (.agents/tasks/m3/impl/review-s3-1.md). The orchestrator rules:
- R3 (the new `lapsed` takeover races with the `/wish here` demote wait and can leave the project with no main agent; reproduced; introduced by 5d47374): fix before the merge step, with the concurrent test the review describes.
- R1 (`/wish` that fails after writing the record leaves a stale record nobody clears; reproduced): fix before the merge step, together with S3-3, and correct the "until that session next reads its role" wording in ORCHESTRATION §3.1 and HANDOFF.
- R2: M3 provides the reader the other modules need: a function next to `mainAgentOf` that checks the named session's mode (mode off and no pending `/wish` reads as none), so M5, M7 and the loop board do not each re-derive it. The loop-board implementation (run wf_e3f665460875b14b, FEAT-012 `holder.ts`) is told to cross-check the mode itself until this lands on main and then switch to it.
- R4: reword ORCHESTRATION §3.1 to the code's criterion.
`npm run probe` is still owed for 5d47374 before merge.

## Orchestrator note, 2026-10-31 (after the step 5 review)

Step 5 (e48fc70) review is APPROVED with four non-blocking findings (.agents/tasks/m3/impl/review-step5.md). S5-1 is the same hole as S4-1 (nested calls carrying `parent` skip the whole tools/pre-execute listener under the PTC preset); fix it once, before merge, for the main agent and for dispatched subagents alike. S5-2 is also fixed before merge: the design-before-release check judges a subagent's write by the module recorded when the work was dispatched, not by the root session's focus at the time of the write. S5-3: drop or qualify the "Next:" lines that name tools arriving in step 6 until step 6 lands. S5-4: the orchestrator records the commit's interpretations on the graph as agent-decided.

## Orchestrator note, 2026-11-01 (addendum 0.6)

The person decided on 2026-10-31 how the main agent asks the person (graph decision d-ask-three-gates, a trial: 「都没问题。先这样改和试行吧，我看看效果」). The addendum is now 0.6 (.agents/tasks/m3/design-addendum.md; 0.5 kept as design-addendum-0.5.md), approved in review round 3 (.agents/tasks/m3/reviews/addendum-v06-review.md, nine NITs N-19 to N-27 to handle during implementation). Build step 6 and later steps against 0.6. Read its version line, the changed sections (§2.2, §2.8, §3 opening, §3.2, §3.3, §3.4, §3.5, §3.7, §3.14.5, the 「这类你定」 delegation) and the step table rows for step 6 (m3-5) and step 9, which list the code that changes and the code that becomes dead: remove the dead parts (the fixed four-label fields and their format checks) rather than keep them beside the new shape. The record keeps its fields; the text the person reads follows the four kinds; the harness checks only the hard limits named there.
