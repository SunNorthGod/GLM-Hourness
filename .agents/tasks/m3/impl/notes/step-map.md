# M3 step map

Source: .agents/tasks/m3/design-addendum.md §4 (step sections) and §0/§1 row 16. Order: 3, 4, 5, 6, 8, 9, 10, persona (all in .worktrees/m3, serial); 11 in .worktrees/m3-flow (parallel); then 12(a), 12(b). Step 7 is cancelled (number kept).

Pre-step (addendum §4 opening): both worktrees were written to sit at eb614ab and fast-forward to main. Actual state: both at 1094725, an ancestor of main dc49e11; main moved by graph/docs commits only (d710a87, 56607fc, eb3e392, dc49e11). Run `git merge --ff-only main` in each before step 3 / step 11.

| Step | Subject | Commit names node | Worktree | Independent review |
| --- | --- | --- | --- | --- |
| 3 | Main agent mode, holder and identity (isMainAgent new reading, role tool face) | m3-1 | .worktrees/m3 | yes (norm-review-floor 1) |
| 4 | main-agent-no-write, git snapshot, main-agent-ask | m3-1 | .worktrees/m3 | yes (norm-review-floor 1 and 3) |
| 5 | Stage reminders and design-phase read-only (design-before-release guard, src/graph/modules.ts) | m3-3 (also serves m3-6) | .worktrees/m3 | yes (norm-review-floor 1) |
| 6 | Proposal-style pending, propose_to_human and record_human_answer `question` kind; graph engine format and permissions; R5b-N1 (orch/bottom stage) per the step defining who may write a module's or goal's stage; R5b-N2 (plain-question guide blank lines) | m3-5 | .worktrees/m3 | yes (norm-review-floor 1 and 2) |
| 7 | Cancelled | none | none | none |
| 8 | Confirm-requirements branch, calibration tasks and run isolation | m3-2 | .worktrees/m3 | yes (norm-review-floor 1, 2, 3, 4) |
| 9 | Release branch and five-column gate fix (module release gate) | m3-3 (also serves m3-4) | .worktrees/m3 | yes (norm-review-floor 1 and 2) |
| 10 | Remove L1/L2/L3 from the decision journal (DecisionRecord drops `level`; DEVELOPMENT.md §1.1) | m3-5 | .worktrees/m3 | yes (round-3 M2, norm-review-floor) |
| persona | `m3-main-persona`: output-style.ts, persona.text config, roleFace section, prompt assembly | m3-main-persona | .worktrees/m3 | no (floor items 1-4 do not apply); desktop L4 item 8 left as a to-do for the person |
| 11 | Flow bar and /wish entry (ui/src/flow, ui/src/wish) | m3-6 | .worktrees/m3-flow | no |
| 12(a) | Calibration runs (after persona and m3-flow are merged into m3; temp dir, persona.text empty) | no code commit expected; evidence goes to graph-ops | .worktrees/m3 | no |
| 12(b) | Merge and batch L4 (design row default-enabled in the first commit after merge; persona.text empty) | m3 (the addendum names no single sub-node) | .worktrees/m3 | no |

Notes for later steps
- Where a step serves two nodes the commit message names both; the first listed is the primary.
- Step 12(b) ordering: the addendum says the orchestrator confirms the person has reworded the old acceptance conditions before 12(b) merges.
- Reuse src/data/project-root.ts and src/data/lock.ts (rules slice follow-up) instead of writing new ones.
