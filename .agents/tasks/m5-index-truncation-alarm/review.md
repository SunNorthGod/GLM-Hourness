# Review: m5-index-truncation-alarm

Branch `m5-index-truncation-alarm`, one commit `78f77ef9` on `origin/main` `7e08c8b7`. Reviewed `git diff origin/main...HEAD` (13 files) against the graph node task and AGENTS.md. Suites not re-run; gate evidence read from the commit message.

Verdict: APPROVED. No blockers.

## Requirement check

1. `memory.index-truncated`: `src/memory/index.ts` installIndex emits only when `renderIndex` returns `cap` (set only when `kept < ordered.length`), so no event when nothing is dropped. Same path serves session start and post-compaction (history without an index notice); `again` is `indexed.has(session.id)` read before this step's add, so false at first index, true after a compaction. Fields `eligible` (`ordered.length`, active and not faded), `shown` (`listed`), `dropped` (`eligible - listed`), `chars` (listed entry lines plus separators), `cap`. `cap` derivation in `src/memory/recall.ts`: the loop stops at `kept === INDEX_MAX_LINES` only for the line cap; a char break leaves `kept < 200`, so `'chars'` is correct. Session goes to the envelope `sid` via `metricsWhereOf(session)`. No name, description or body field exists in the kind table.
2. `memory.query-empty`: `src/memory/tools.ts` query emits when `matches.length === 0`, after refusals and the both-unreadable `io` failure (those throw first, so no event for a rejected call). Body `mode`, optional `type`, `searched` (candidates after the type filter). The query words are not in any field.
3. Closed table: `src/metrics/kinds/memory.ts` with `Expect<Equal<BodiesOf<Tables>, MemoryBodies>>`, registered in `src/metrics/kinds/index.ts`, `MemoryBodies` in `EmittedEvent`; `'memory'` already in `METRICS_BY`. Both emit sites go through `env.emit`, which is `emitMetric` (absent service: `metricsOf` returns undefined, no warning; throwing service: caught). `tests/metrics-schema.spec.ts` pins the namespace and total.
4. Display: no existing board or weekly-report line lists recall numbers (the weekly report is not merged; memory `stats` counts writes, not recall). The commit adds `calc.ts` group `记忆` (two count rows) and one coverage-group row `记忆索引截掉与查询落空` on the board, and says so in the commit message and ORCHESTRATION §10.6. `/hourness` unchanged (`FACT_GROUP_TITLES`). Label 12 code points, values and integer samples pass `metrics-board.ts` shape checks.
5. L2 `tests/memory-metrics.spec.ts` (wired into `test:2`): line cap and char cap in `renderIndex`, truncated vs fitting index on the row, compaction `again: true`, empty vs non-empty `memory_query` (focus with type, name), every event through `checkEvent` against `METRICS_KINDS`, marker strings absent from events, service absent and throwing on both paths. Docs: ORCHESTRATION §8.3 bullet, §10.6 count 90 to 92 and a bullet, HANDOFF M5 row; DESIGN row table correctly untouched (no new row).

Gates recorded in the commit: build 0, preflight 0, test 3277/3277, lint ratchet unchanged.

## Non-blocking notes

- The new board row and the `记忆` calc group have no direct assertion (the task's L2 list does not require one; the desktop check is recorded as owed in HANDOFF).
- HANDOFF metrics row (line 159) still says 「90 种闭表」 for the step-1 batch; the authoritative count in ORCHESTRATION §10.6 is updated.
