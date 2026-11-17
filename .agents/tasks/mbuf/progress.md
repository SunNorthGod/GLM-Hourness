# mbuf lane — startup metrics buffer misattribution + silent drop (postwave-audit F3)

Base: main 0c5ebd21. Worktree `.worktrees/mbuf`, branch `mbuf`.

## Stage 1 — design reading (before coding)

### What the buffered events are

The only emitters that reach the execute row's default sink with neither `dir`
nor `sessionId` are the two `execute.loop-contribute` emissions in
`src/execute/link.ts` → `src/execute/loop-link.ts:465` (accepted) and `:475`
(refused), fired from `attach()` when the loop board's service arrives (the
apply-time `inject([LOOPS_SERVICE])` and the per-`agent/created` hand-over).
They are process-level facts: the row's hand-over of its entries/actions to
the board (M7 design 0.6 §3.16 table; §6.2 failure table「交条目」names 行健康
+ `execute.loop-contribute` as the noise channels). No computation consumes
them (checked `src/metrics/calc.ts`, `board-view.ts`, `report/`, `workflow/`,
`read.ts` consumers) — they are stream diagnostics only.

### What the designs say about attribution

- Metrics design `.agents/tasks/metrics/design.md` §3.5 + §7.3, ORCHESTRATION
  §10.6 (metrics row, `src/metrics/index.ts` `projectOfWhere`): an event's
  project is `where.dir` first, else the session's cwd (via `agents.get`), both
  through `projectOf`. Events that resolve to no project are **counted, not
  written** — per kind into the metrics row's health line「无项目的事件 N 条」
  and the `/hourness` coverage line (`MetricsCoverage.noProject`).
- "First project that speaks" appears in no design. The wave commit 52f6a1c2
  invented it, and its implementation has a second, worse edge the audit did
  not spell out: the flush is keyed on `!contributedProjects.has(key)`, so on
  a multi-project host the buffer is re-armed after the first flush and every
  later new project inherits whatever naked facts accumulated since the last
  flush. Single-project hosts — the designed shape — are correct today.
- Pinned acceptance that constrains the fix:
  - `tests/execute-metrics.spec.ts:356,362`: metrics row health must NOT
    contain「无项目的事件」on a healthy single-project host.
  - `tests/execute-metrics.spec.ts:374`: the buffered `execute.loop-contribute`
    must land in the project journal via METRICS_SERVICE.
  - `scripts/probe/run-probe.mjs` (metricsChecks, line ~5266): metrics health
    must be 生效 with no「无项目」, and stderr must be clean of plugin lines
    (F9) — this rules out both "flush naked events with empty `where`"
    (counter entry → health carries 无项目 → red) and any `console.warn` from
    the execute row at dispose (stderr-clean → red). The metrics scenario
    loads the execute row (it ships enabled) with no dispatch at all, so a
    buffered `loop-contribute` with no flush is its steady state; the health
    snapshot is taken before dispose, so a dispose-time hand to the §3.5
    counter is both design-conformant and probe-green there.

### Decision

"First project" is correct only where it is not a guess: on a single-project
host. Process-level facts have no project owner; any project journal is a
best-effort home, and the §3.5 counter is the designed home for facts whose
sender cannot name a context — but parking healthy-host startup facts there
degrades every host's metrics health, contradicting the pinned acceptance.
So:

1. One attribution anchor for the row's lifetime: the first event whose `dir`
   resolves to a project root fixes it (`anchor ??= projectOf(dir).root`), and
   the whole buffer flushes there. No re-anchoring: later naked facts go to
   the same anchor immediately instead of waiting to be inherited by the next
   new project (kills the re-arm misattribution).
2. Dispose is no longer silent: leftovers flush to the anchor if one exists;
   otherwise, when the metrics service is present, they are handed in with an
   empty `where` — the §3.5 counter counts them into the metrics row's health
   (visible). Without the service the hand-over is the same accepted no-op any
   sender has before the row activates (「行激活前 emitMetric 是空操作」;
   cf. ORCHESTRATION line on loop records: 指标行不在时这些记录不落盘).

## Stage 2 — implementation

`src/execute/index.ts`: the default sink keeps one attribution anchor for the
row's lifetime (`metricsAnchor`), fixed by the first event whose `dir`
resolves to a project root. The buffer flushes there once; later naked facts
go to the anchor immediately (no re-arm, no second-project inheritance); at
dispose leftovers flush to the anchor, or — when no anchor was ever
resolved — are handed to the metrics service with an empty `where`, which
counts them into the no-project health line (§3.5). Without the service the
hand-over is the accepted pre-activation no-op. The per-platform lowercase
key set (`contributedProjects`) is gone: one scalar anchor needs no key
folding, and the metrics row folds root casing itself.

## Stage 3 — L2 (tests/execute-metrics.spec.ts)

- the buffer flushes to the first project the row serves; a later naked fact
  follows the same anchor; a second project inherits nothing (journal reads
  of two temp repos); the counter stays empty and dispose adds nothing;
- a dispose with no project ever spoken shows `无项目的事件 1 条
  （execute.loop-contribute）` in the metrics row health;
- without the metrics row the dispose hand-over is the accepted no-op.
Shared scaffolding extracted (`LOOPS_FAKE`, `injectOf`,
`startRowWithLoops`, `withRowAndMetrics`, `waitUntil`) so the existing
row-level L2 keeps its shape.

## Stage 4 — gates on branch (fb303e95, base 0c5ebd21)

- build OK (tsc strict + tests tsconfig), preflight OK, `npm test` exit 0;
- ratchets held: eslint 69 suppressed, knip 18 in baseline, jscpd 1 clone /
  7 lines in baseline;
- worktree note: fresh worktrees need `npm install` (npm layout, like the
  answer-race worktree; `package-lock.json` is gitignored) and the
  out-of-git `.agents/tasks/m5/lessons-seed.json` copied from the main
  checkout, or `lessons-seed.spec.ts` fails setup.

## Stage 5 — rebase onto main, probe, land

Main unfroze mid-lane twice: first at 4a9750af (the answer-race fix
06af9bc5), where the branch was rebased and the full probe ran 612/612
(`.llm/logs/mbuf-probe.log`); then main moved again to 532eac69 (the
takeover-mutex lane), so the branch was rebased once more (fix 15e976be,
progress 2a9e54cb), build / preflight / `npm test` rerun green (eslint 69,
knip 18, jscpd 1) and the full probe rerun 612/612 on that exact tip before
landing. ff-merged to main (532eac69..2a9e54cb), pushed to `origin/main`
(Gitee) and `github main`, both fast-forward.
