# M4 stop report (finish2, second pass)

Verdict of the second decisions re-review of `.agents/tasks/m4/design.md` 0.6: CHANGES_REQUESTED. The two allowed passes are used up, so the module stops here.

Review: `.agents/tasks/m4/decisions-review-finish2.md`. First pass kept as `decisions-review-finish2-pass1.md`. Gate: `.agents/tasks/m4/decisions-gate-finish2.json`.

## Closed

F13, F14, N15, N16, N17 (round 3) stay closed. F15 and N18, N19, N20, N21, N22, N23 (first finish2 pass) are closed: the text and the test cases are in the design, and I re-counted the D1 figures (104 code points in the sentence; 35 items and 7,953 characters in the seven task rows) and the `ownRules` line lengths (longest 65 of 80).

## Open

| Id | Level | What is open |
| --- | --- | --- |
| F16 | MEDIUM | The morning-report reconciliation added for F15 does not say it reads the whole violation journal. The report reads only the current calendar day (`src/report/index.ts:50-54`, `src/workflow/morning-report.ts:132-141`), so every rule lifted before today would be reported as mismatched every morning. The inputs for reading `docs/guard/lifts.jsonl` (project root) are also not defined for `reportFromFiles`. L2 cases 11 to 14 all lift and reconcile on the same day and cannot catch it. |
| N24 | NIT | D1 sentence lacks the reason and its cost sentence refers to an item the person has not seen. |
| N25 | NIT | `ownRules` fifth line is 35 code points, the design says 33. |
| N26 | NIT | L2 case 11 commit order is unclear (two commits are needed). |
| N27 | NIT | Root comparison in `lift-files-only` has no path normalisation; Windows drive-letter case can let a worktree target through. |
| N28 | NIT | The `checkoutRootOf` addition is not recorded in 13.3 or 18. |
| N29 | NIT | After a change of computer the reconciliation reminder repeats every morning per rule. |

## What is needed

One more small fix pass on `design.md`, no new design decision and nothing for the person:

1. §3.10: reconciliation and the 'rules lifted' line read the whole journal (lift records only, last one per rule); add `ReportOptions.root`; record it in §2.2 and the §13.1 G3 row; extend L2 case 14 with a lift dated three days back and a second case where the file was swapped to an older version.
2. N24 to N29 as listed in the gate file; each is a sentence or a number.
3. A third review limited to §3.10, §3.5 L2 and §17, then `onepage.md` and `onepage-done.md` can be written.

The orchestrator decides whether a third pass is run, since the two-pass limit is reached. No ruling or person decision is blocking: the fix follows from the existing report design.

Nothing was run. No graph write, no commit. `graph-ops-decisions.json` is unchanged; `graph-ops-finish2.json` is still to be written by the final report step.
