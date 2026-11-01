# Review: option-card table change (branch `card`, commit 799fab1)

Scope: `git diff main...card` (merge base c49478f), 15 files. Blocking standard: docs/DEVELOPMENT.md §1.1 row "评审挡路的标准" (unmet acceptance criterion; irreversible loss without prevention; failure that cannot be discovered, recovered from, or traced). AGENTS.md rules checked for the commit and the docs.

Verdict: APPROVED. No blockers.

## Acceptance criteria against the code

| Brief item | Evidence | Result |
| --- | --- | --- |
| Row: label <= 20 code points, gain and cost one line <= 60, no consequence on new or edited rows | engine.ts `optionRefusal` (codePoints, shortLine, consequence refused); format.ts `option` keeps consequence optional for old files | met |
| dimension {name <= 12, one cell per option key <= 20}, at most one, all-equal refused | schema.ts `CardDimension` (single object); engine.ts `dimensionRefusal` (missing, extra, long, trimmed all-equal); format.ts `cells` shape | met |
| crux one line <= 60; verdict one line <= 120, named keys exist, recommended key named | engine.ts `questionRefusal` crux/verdict branches, `verdictKeys` regex matches OPTION_KEY_PATTERN shape | met |
| weight one-way / two-way, required for human questions, no counter | schema.ts `WEIGHTS`; format.ts `oneOf(WEIGHTS)`; engine.ts weight branch; no counter coupling | met |
| No why / counter fields | not in NODE_FIELDS / PROPOSE_FIELDS; mutation.ts refuses as unknown; tests cover `node.why`, `node.counter` | met |
| Agent questions exempt from crux, verdict, weight; row and dimension rules still apply | `deciderOf(node) === 'human'` gates the three required checks only | met |
| Old questions not migrated, load, render, decide | format shape only; decide path does not call `questionRefusal`; spec 27 loads, renders and decides pre-card open and done questions; docs/graph/nodes has no new-field usage, format change only loosens option shape | met |
| Refusal on propose and on edits of card fields, with field and hint | `planPropose` runs with `touched = () => true`; `planEdit` passes set fields; every refusal is `invalid` with `node.`/`set.` field and a hint | met |
| Tool descriptions and graph_propose schema explain the table card next to recommend-last | tools.ts propose/edit descriptions, option row schema `key, label, gain, cost`, dimension/crux/verdict/weight descriptions; graph-tools.spec test 3 | met |
| ORCHESTRATION.md §2.6, §4.2, §5 rewritten, docs/graph untouched | diff replaces the old paragraphs and rows; `git diff --stat` has no docs/graph path; docs match code (field paths, limits, decider-only edit exemption, panel deferral) | met |
| L2 tests that fail on today's code | main-check-graph-engine.log (tests 8, 9, 27 among 18 failures), main-check-graph-store.log (2, 38-42), main-check-graph-tools.log (3 among 17) | met |
| One commit, plain technical English, what / why / gates, probe statement | `git log main..card` has one commit; message has What, Why, new tests and how they fail on main, gates, "Probe not run" with reason | met |
| Gates, baselines | build.log exit clean (tsc both projects, build-ui); preflight.log OK; test.log: chain ends with graph:smoke ok, 588 pass / 0 fail summed over all specs, no `not ok`; eslint 250 suppressed, knip 21, jscpd 2 clones / 16 lines; no baseline or checker config file in the diff | met |

## Engine paths checked for reachable failures

- Propose: `questionRefusal` runs only on a format-clean node; malformed input is refused by commit with its format issue. No write happens on refusal (spec asserts node count unchanged).
- Edit: format errors map to `set.<path>` through `requestFields`; card checks run after the no-change check; `crux: null`, `verdict: null`, `weight: null` on a human question are refused; replacing an option re-checks dimension cells and verdict keys (spec 27).
- `Object.hasOwn` guards dimension lookups, so option keys such as `constructor` cannot read prototype values; option key pattern excludes `__proto__`.
- Canonical form: option fields written conditionally; dimension cells sorted by code unit, and JSON enumeration order is deterministic for integer-like keys, so load-then-write stays byte-stable (graph-store.spec round-trip).
- Consumers of `consequence`: only ui/src/graph/common.tsx, which now falls back to gain and cost. Projection spreads all node fields, so graph_show carries crux, verdict, weight and dimension.

## Non-blocking notes

1. Base is stale. The branch forks at c49478f; main is at ba3bdaa (split steps 0-8 and later docs). Rebasing will conflict at least in docs/ORCHESTRATION.md, scripts/probe/run-probe.mjs, tests/graph-tools.spec.ts, tests/graph-panel-model.spec.ts and ui/src/graph/model.ts. Main's restructured probe seeds its question with `consequence` (run-probe.mjs line 579 on main); keeping that line after the rebase makes probe seeding throw. Gates must be re-run on the rebased commit before merge.
2. A decider-only edit that hands an agent question to the human is not checked, so such a question can wait for the human without crux, verdict or weight. This is a documented trade-off (§2.6, commit message): it is visible on the card and fixable by a human edit or a relayed LLM edit.
3. The decision queue entry (`graph_open` / `queueEntry`) carries options and recommend but not crux, verdict, weight or dimension. The docs describe the queue the same way, and graph_show has the full card. If the orchestrator should present cards in chat from the queue alone, that is a follow-up proposal.
4. The panel shows each row as "得到 …；代价 …" and does not yet show crux, verdict or the dimension column. This is deferred to m8-plain-language by d-option-card.
