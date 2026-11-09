# habits-prompts: review

Workflow wf_7bd410e5bb88654f, step build-loop/review, first pass.
Reviewed: `git diff origin/main...HEAD` on branch habits-prompts, HEAD 4598fa7 (one commit, 10 files, +102/-37), merge base 7d9355e.
Read: the commit message, `.agents/tasks/habits-prompts/code-report.md`, report `.agents/tasks/habits-framework/report.md` 3.1 (H4a, H6/H7, H9, H1) and 3.3, unchanged callers in `src/graph/tools.ts` (`reworkNoticeAfter`, `writeTool`) and `src/graph/reopen.ts` (`reopensAfter`, `thirdReworkState`, `reopenNotice*`), `src/loops/run.ts` around the save after `loop-done`.
Suites not re-run (step instruction).

Blocking classes (d-failure-plans): unmet acceptance item, irreversible loss, missing failure plan.

## Acceptance, item by item

| Item | Evidence | Result |
|---|---|---|
| (a) L2: second reopen carries the sentence, first none, third only the question notice | `tests/graph-loop-entry.spec.ts` new test: rounds 1..REOPEN_LIMIT through `graph_status`; first `undefined`, second `=== SECOND_FIX_NOTICE`, at round 2 no `question-1` and no board run, third starts with `Filed question question-1` and does not contain the sentence. Count-restart test expects the sentence at the second reopen of the new window. | met |
| (b) identity has the reliability sentence, within 3200 | `tests/design-mode.spec.ts`: sentence asserted in `TALK_GUIDE` and `MAIN_AGENT_IDENTITY`; whole cap 3200 with reason next to the assertion (Q3). Measured 3078 (code-report). | met |
| (c) graph_propose description has the intent sentence for norm nodes | `NORM_INTENT_NOTE` in the propose description only; `tests/graph-tools.spec.ts` pins it there and absent from every other graph tool. Text matches the brief (intent and basis, not a list; measurable checks to a check line of a tool node or a line of norm-merge-gate). Tool description, not identity. | met |
| CHARTER and ORCHESTRATION in the same commit as the behavior | Both in 4598fa7. CHARTER 0.9: §9 user-global row now persona and speaking style only; paragraph under the table lists the six engineering habits as framework defaults with their levels per report 3.1 and the IDE habit at prompt level only, tracked files kept. No other CHARTER text still says personal habits stay out (`git grep` on HEAD docs: only the quoted human words of 2026-10-30 in §9's lead, which are a citation). ORCHESTRATION §2.4 reopen clause rewritten whole; §3.1 identity clause and persona citation rewritten; §6.4 table row rewritten. `tests/graph-reopen.spec.ts` cited in §2.4 exists. | met |
| Gates green, ratchet not rising | Commit message and code-report: build 0, preflight 0, npm test 0 (final run; earlier failures and their causes recorded), check-lint 0 with eslint 73 / knip 18 / jscpd 1, probe 0 at 420/420 on 4598fa7 (artifacts `.llm/probe-runs/2026-11-05T15-50-45-468Z`). | met |
| Commit message says M7's merge must take 3200 | "M7's merge must take 3200 (and the talk cap 2000)". | met |
| `.worktrees/m3`, `docs/graph`, `C:\Users\29596\.dsh` untouched | Branch diff has no `docs/graph` path. `.worktrees/m3/tests/design-mode.spec.ts` still at 1800/3000. The m3 worktree has uncommitted edits to `docs/HANDOFF.md`, `docs/ORCHESTRATION.md`, `docs/DESIGN.md` written at 00:15, after this commit (23:44); their diff is M7 E8 text and contains no habits-prompts text, so they belong to the m7 lane. `~/.dsh/profiles` last written 2026-10-29; `~/.dsh/storages` is host runtime storage, not profile config, and nothing in this lane writes it (the probe runs under its own DSH home). | met |
| No persona tone in files or commits; no BOM | Scan of the changed files and the commit message for tone markers: none. First three bytes of all 10 changed files at HEAD: no BOM. | met |

## Behavior checks beyond the tests

- `reworkNoticeAfter` keeps the existing guards in order: not `to: doing` or relayed returns nothing; last history entry must be done->doing; an open third-rework question returns nothing; only then the count. `reopens.length === REOPEN_LIMIT - 1` returns the constant before the filing branch, so the second reopen files nothing and records no board run. Third and later keep the unchanged filing path, including the retry-on-next-reopen after a failed filing.
- The rename `thirdReworkAfter` -> `reworkNoticeAfter` leaves no stale reference in src, tests or docs.
- No new failure mode: the new branch returns a constant inside the existing try; a graph load failure already produced `reopenNoticeFailed` on every reopen before this change.
- A window holding a human-relayed reopen as its second entry gives the LLM no second-fix sentence (relayed reopens count but never notify). This is the documented reading in ORCHESTRATION §2.4 and matches the third-rework path; within the brief.
- `SECOND_FIX_NOTICE` is a constant next to `reopenNotice` rather than a function; it takes no input, so this meets the module placement in the brief.
- `tests/loops-run.spec.ts` change: test-only. The stated cause holds on reading `src/loops/run.ts`: the `loop-done` record is written before `await inbox.save()`, and `untilDone` returns on the record; `savedState` now polls for `last[entry]` with the 5 s bound already used by test 15.

## Non-blocking findings

1. Two caps rose beyond the literal human decision: the talk part 1800 -> 2000 (Q3 named only the whole) and the graph_propose description 700 -> 900. Both are forced by the added sentences (talk 1939, propose 860), reasons are written next to the assertions, and the commit discloses them. ORCHESTRATION §3.1's merge note says only "m7 分支上同一断言还是 3,000，合入时取 3,200"; the m7 branch also carries the talk cap at 1800 (`.worktrees/m3/tests/design-mode.spec.ts:95`). The commit message covers it; the doc sentence could name 2,000 as well.
2. The loops-run test fix for an unrelated flake is in the feature commit. AGENTS.md rule 7 asks for one matter per commit; a separate `test(loops): ...` commit would have kept the history single-purpose. No behavior effect.

## Verdict

APPROVED. No blocker in the three classes.
