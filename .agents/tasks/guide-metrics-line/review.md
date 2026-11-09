# Review: guide-metrics-line (436141f, branch guide-metrics-line vs origin/main)

Verdict: APPROVED. No blockers in the three blocking classes.

## Acceptance items

| Item | Evidence |
|---|---|
| One line for the metrics board, same place and style as rules/loops | `ui/src/graph/Guide.tsx` `MetricsLine`: `Part` titled 指标板, `glmg-meta` text, `glmg-actions` link 去看指标板 › calling `onOpenBoard('metrics')`; same structure as `LoopsBlock`. |
| Text equals the metrics board's GUIDE_LINE | Renders `metrics.guideLine`; the board sets `guideLine: GUIDE_LINE` (`ui/src/metrics/board.ts` line 276). L2 asserts `<div class="glmg-meta">${GUIDE_LINE}</div>` is present. |
| Ordered after the loops board | Rendered right after `LoopsBlock`, before 去哪看进度. L2 asserts the section order. |
| Absent when the row is disabled or there is no GUIDE_LINE | Guard `metrics.available && metrics.guideLine !== null`. Board not registered (row disabled) resolves to the unavailable state, the same path the existing rules/loops blocks use. L2 covers unregistered, `available: false` with a line, and `guideLine: null`; each equals the page before the board registers. |
| Six blocks and footer unchanged | Diff touches no existing block or footer text. L2 asserts that the present page minus the metrics section is byte-equal to the six-block page. |
| Panel design doc and metrics design §11 item 19 in the same commit | `.agents/tasks/plain-ui/design.md` §6.4 gets one added bullet; `.agents/tasks/metrics/design.md` §11 item 19 is rewritten as settled. Both are in 436141f. |
| L2 tests for present and absent cases | `tests/graph-panel-render.spec.ts`, new test; `render-spec.log` shows 6/6 pass including it. |

## Gates (from commit message and logs, not rerun)

- build: `build.log`, exit 0.
- preflight: `preflight.log` OK.
- npm test: the first run failed 3 cases in `tests/lessons-seed.spec.ts` because the gitignored `.agents/tasks/m5/lessons-seed.json` was missing from the worktree. That is unrelated to this change, and the commit states the cause. The rerun in `test.log` has no failures.
- probe: `probe.log` 420/420 passed.
- lint ratchet: the commit message records eslint 73 / knip 18 / jscpd 1, all unchanged. There is no separate log file.

## Constraints

- Four files changed, none under `docs/graph` or `~/.dsh`.
- None of the four files starts with a BOM.
- No persona words in the files or the commit message.

## Non-blocking notes

- The lint ratchet result is recorded only in the commit message; there is no log under this task directory.
- `ui/src/graph/Panel.tsx` line 240 passes `onOpenBoard={() => {}}` in one panel state, so 去看指标板 does nothing there. This is pre-existing and the rules and loops links behave the same way, so it is out of scope.
