# m4-review-fixes lane progress

Branch `m4fx` off main @ `4e557c69`, worktree `.worktrees/m4fx` (node_modules
junctioned to the main checkout, unlinked at teardown). Gate logs live in the
main checkout under `.llm/logs/mfx-*.log`.

## Fixes (one commit each)

- D1 `c2239c82` — docs(m4): gate clause 1's "declaration lists every unlifted
  rule" half-sentence was superseded by the person-approved ablation A2
  adoption (`95cb4aaa`, DESIGN.md §5.2a). Sentence rewritten whole in both
  clause documents (`.agents/tasks/m4/onepage-done.md` clause 1,
  `.agents/tasks/m4/design.md` §1.2 clause 1) to the fixed one-line
  declaration; no patch note. `docs/ORCHESTRATION.md` §6.4 checked: it has
  no such sentence and already records the A2 history (:276, :917), so it
  needed no change.
- D2 `0f045ae7` — guard: the stale "Steps from now on do not list the rule
  in the system prompt" clause dropped from `LIFT_MESSAGE`
  (`src/guard/lift.ts`); the true half (this session's prompt cache is
  rebuilt once) kept. No test pins the dropped clause (grep over tests/ and
  src/).
- D3 `a4d97835` — tests: the three rule tables' id union pinned in
  `tests/contracts.spec.ts`.

## D3 finding: the review's disjointness premise does not hold

Measuring the actual tables overturns review.md D3's "ids disjoint,
compared by hand": `handback-cause` is present in both `GUARD_RULES` (row
`execute`, the catalog registration) and `EXECUTE_RULES` (the source
table), as the `execute-rules.ts` header states. The other eight execute
ids and all ten main-agent ids are disjoint from everything. The added
assertion pins the three pairwise intersections: guard x main and
main x execute must stay empty, and `handback-cause` is the only catalog
registration of an execute source-table rule, so any future collision
still fails. Design §1.2 clause 6's "the three tables share no ids" reads
as forbidding cross-namespace collisions, not the deliberate registration
of the same rule in its source table and the catalog.

## Gates

- build: exit 0 (`.llm/logs/mfx-build.log`)
- preflight: exit 0 (`.llm/logs/mfx-preflight.log`)
- test: exit 0, all three segments (`.llm/logs/mfx-test.log`). One
  worktree-only prerequisite: `.agents/tasks/m5/lessons-seed.json` stays
  out of git by design; copied from the main checkout before the rerun
  (first run failed 3 setups on the missing file, not on any change).
- ratchets: eslint 57 suppressed, knip 18 baseline entries, jscpd 1 clone
  — exit 0 (`.llm/logs/mfx-lint.log`)
- probe: 626/626 passed, 0 fail, 0 skip, exit 0
  (`.llm/logs/mfx-probe.log`, exit code in `.llm/logs/mfx-probe-exit.txt`);
  runner-managed lock (`.llm/probe-lock`) claimed and released by the
  runner, never touched by the lane; GIT_CONFIG_COUNT / GIT_CONFIG_KEY_0 /
  GIT_CONFIG_VALUE_0 cleared for the run
