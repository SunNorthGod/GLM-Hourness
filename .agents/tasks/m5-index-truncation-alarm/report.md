# Landing report: m5-index-truncation-alarm

Verdict: LANDED

Workflow wf_8924e7a9cdb716c0, step land, project-graph node `m5-index-truncation-alarm` (parent m5).

## Review

- Review rounds: 1 (`review.json`, `review.md`).
- Final review verdict: APPROVED, no findings, no blockers.

## Commits on main

| sha | subject |
| --- | --- |
| `78f77ef9` | feat(memory): count index truncation and empty memory_query in the metrics journal |
| `adebb190` | Merge remote-tracking branch 'origin/main' into m5-index-truncation-alarm (merged `870d223a`; one conflict in `docs/HANDOFF.md`, M5 row: kept origin/main's lessons-enable wording and the branch's index-truncation sentence) |
| `6b0b8085` | Merge remote-tracking branch 'origin/main' into m5-index-truncation-alarm (merged `42a5f307`, graph-only commits that landed on main during the first gate run; no conflicts) |

main fast-forwarded `42a5f307..6b0b8085`. Local main: `6b0b8085130cc3cb7485aa791aaa7db9afda06bf`.

## Remotes

- `git ls-remote origin main`: `6b0b8085130cc3cb7485aa791aaa7db9afda06bf`
- `git ls-remote github main`: `6b0b8085130cc3cb7485aa791aaa7db9afda06bf`

Both match local main. github push succeeded on the first attempt (`9349f84b..6b0b8085`).

## Gates

Run 1 (worktree at `adebb190`):

| gate | exit |
| --- | --- |
| npm run build | 0 |
| npm run preflight | 0 |
| npm test | 0 |
| node scripts/check-lint.mjs | 0 |
| npm run -s probe | 0 (437/437) |

origin/main moved to `42a5f307` during run 1, so the branch merged it (`6b0b8085`) and the gates were rerun from the start.

Run 2 (worktree at `6b0b8085`, the sha that landed):

| gate | exit |
| --- | --- |
| npm run build | 0 |
| npm run preflight | 0 |
| npm test | 0 (no failing test lines) |
| node scripts/check-lint.mjs | 0 |
| npm run -s probe | 0 (437/437) |

Main checkout after the fast-forward: `npm run build` exit 0.

Lint ratchet (both runs): eslint 73 suppressed (baseline 73), knip 18 (baseline 18), jscpd 1 clone, 7 duplicated lines (baseline 1). None rose.

## Probe lock

Both probe runs held `c:\Users\29596\Desktop\Project\GLM-Hourness\.llm\probe-lock-2`; `.llm\probe-lock` was held by wf_5f5345b05e5c4e89 (code, ablation calibration) throughout. owner.txt named wf_8924e7a9cdb716c0, step land, node m5-index-truncation-alarm. The lock was released after each run.

## Where the two counts are shown

A new row in the metrics board's 记录范围 (coverage) facts group: 「记忆索引截掉与查询落空」 (`src/metrics/board-view.ts`, `memoryRow`), current and previous window values with sample counts. The counts come from the `memory.index-truncated` and `memory.query-empty` events (`ORCHESTRATION.md` §8.3, §10.6). Because this is a new board row, a desktop L4 check of the metrics board is owed.

## Cleanup

- Worktree `.worktrees/m5-index-truncation-alarm`: `node_modules` was a plain directory, not a junction. `git worktree remove` failed with "Filename too long" (exit 255); the directory was then removed with `rd /s /q` (exit 0) and `git worktree prune` (exit 0). The worktree no longer appears in `git worktree list`.
- Local branch `m5-index-truncation-alarm` deleted (was `6b0b8085`).
- `origin/m5-index-truncation-alarm` did not exist (`git ls-remote` returned nothing); nothing to delete.
- Main checkout tracked files clean before the fast-forward; no files in the main checkout edited outside the fast-forward. docs/graph not written by this step.
