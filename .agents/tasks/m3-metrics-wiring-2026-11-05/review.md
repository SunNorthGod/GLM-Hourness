# Review: m3-metrics-wiring, pass 2 (origin/main...35556ee)

Verdict: APPROVED (no blockers).

## What was checked in this pass

- Prior review (pass 1 on b79bf69): one blocker B1 (HANDOFF M3 row written from the branch's point of view), N1-N6 non-blocking. Pass 1 covered the code against the closed table (metrics design §4.5, `src/shared/metrics.ts` `DesignBodies`, `src/metrics/kinds/design.ts`, `checkEvent` in `src/metrics/schema.ts`), the service contract (`METRICS_SERVICE`, `emitMetric`), all holder-record writers, and acceptance 1 and 2. Those findings stand; the only change since b79bf69 is `35556ee`, one line of `docs/HANDOFF.md` (`git diff b79bf69 HEAD --stat`).
- Graph node `m3-metrics-wiring` projection.node: three acceptance items, unchanged since pass 1.
- Commit message of `35556ee`: no byte-order mark (first bytes `64 6F 63 73`, "docs").
- Recorded gates on `35556ee` (not rerun): `r2-build.log` exit 0; `r2-preflight.log` "preflight: OK" (20 rows composed); `r2-test-2.log` `# fail 0` across suites, check-lint lines `eslint: ok (73 suppressed)`, `knip: ok (18 in the baseline)`, `jscpd: ok (1 clone(s) in the baseline, 7 duplicated lines)`, so the ratchet did not rise; `design-metrics.spec.ts` 11/11. Probe not rerun for a docs-only line; last probe on b79bf69 420/420 (`probe.log`). No runtime seam changed since, so that evidence still covers the code.
- No `docs/graph` file in the branch diff.

## Prior blocker

B1 resolved. `docs/HANDOFF.md` line 151 now records the wiring in the code column (项目图 `m3-metrics-wiring`, 2026-11-06, ten kinds into the journal, `ORCHESTRATION.md` §10.6), and 「指标接线合入 main」 is gone from 还缺. It agrees with line 59 (the `design` row now ends its history with the wiring and no longer lists 「指标出口不做事」 under 未做) and with ORCHESTRATION §10.6 line 1289. No remaining text in `docs/` outside `docs/graph` speaks of the wiring as pending.

## Acceptance

1. Met (pass 1 evidence; code unchanged).
2. Met (pass 1 evidence; docs unchanged except HANDOFF line 151).
3. Met on the branch: eight locale descriptions say on by default, rows loops, M3, M4, M6 as on main. "改动在 main 上" is met by the landing step, which the task assigns there.

## Non-blocking

- N1-N6 from pass 1 stand as written (compound git line drops the `git.snapshot` event of an earlier invocation when a later one is refused; `saved` key names; `lapsed`; refusal code names vs addendum §3.12; wip commits should be squashed at landing so docs and behaviour land in one commit; calibration reader still reads run directories).
- N7. Landing will hit a content conflict in `docs/HANDOFF.md`. origin/main has moved to `14a541b` since `bb0bed3`; a trial merge (`git merge-tree`) conflicts on the loops row and the M6/M4 rows. Main's loops row appended the `m4-checks-loop-details` paragraph (`ownRules`, `detailsOf`, `DETAILS_MAX_LINES`/`DETAILS_MAX_WIDTH`); the branch rewrote the row's last sentence (「之后合入 main 的：…；还没有的：让人同意新条目的工具」). The resolution should keep both: the branch's sentence in place of main's stale 「还没有工具、页面、机器一级的运行者、脚本与检查的执行器」, then main's 2026-11-05 paragraph. The M3 row and `ORCHESTRATION.md`, `src/design/talk.ts` merge cleanly. The conflict is caught by git at merge time, so it is not a silent failure; after resolving, the landing step reruns the four gates on the merge commit.
- N8. The first `npm test` on `35556ee` failed once in `tests/data-journal.spec.ts` ("two processes appending 200 records each", a leftover `.lock.stale-<ms>`), passing on rerun. `src/data` is not touched by this branch; it is a pre-existing timing case in the shared journal lock and is worth its own graph node.
