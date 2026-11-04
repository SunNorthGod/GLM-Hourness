# m4-gate G1 main step — WIP status (2026-11-03, stopped before reboot)

State: all work done in the working tree, NOT committed, NOT pushed. The
working tree carries batch-2 (from the stopped agent) plus this session's
fixes. Gates re-run below. Nothing is half-written: eslint (the only
typecheck the tests get) passes over the whole repo, build and preflight
exit 0.

## The 7 originally failing tests

tests/guard-gate.spec.ts — 11/11 pass:
- (5) lifted rule does not judge / returns after restore — fixed (the test
  was missing `mkdirSync(root/docs/guard)`; writeFileSync hit ENOENT).
- (7) throwing detector fails open — repaired the TEST to the design's
  per-rule fail-open (design 0.6-finish2 §3.1 "抛错的规则放行并记下 id",
  §11 table row): [BROKEN, rule('one')] now expects 'deny' with the healthy
  rule's correction, plus note + warn-once. The batch-2 test expected the
  whole call to run, which contradicts the design text and the gate code.
- (8) rule-errors note names at most three + 等 — passes.
- (9) failed journal write counts against the session — passes (the gate
  now treats a REJECTED journal promise as 'failed', design §3.1 step 7
  "承诺被拒绝…按 'failed' 计"; the test's journal rejects instead of
  resolving 'failed').

tests/guard-rules.spec.ts — 5/5 pass:
- (1) incident table — the seed `.llm/l4-dsh/calc.mjs` was moved from
  DENIED to ALLOWED: it is the 2026-10-28 FALSE denial (DEVELOPMENT.md §7
  "把工作区内的相对路径写入判为工作区外并拒绝"), the committed
  guard-audit test pins the same spelling ALLOWED through the gate, and no
  resolve-then-check semantics can deny it while allowing 'src/a.ts'.
- (3) build-and-git exception word for word — passes (fileToolsOnly.detect
  now defaults face to NATIVE_FACE; the spec calls detect directly).
- (5) relative target — rewritten to the design-true reading
  (ORCHESTRATION.md §6.1): the base only decides what a relative spelling
  names, the roots still decide; '../elsewhere' from 'C:\ws\pkg' is INSIDE
  the root 'C:\ws' and passes; '../../../elsewhere' denies with
  "(resolves to". The batch-2 expectation (deny for '../elsewhere') was
  base-confinement, which contradicts §6.1 and the rule's declaration.
- Seeds were changed to DSH native names ('write', 'pwsh'): rules see
  natives; the rows map aliases (ORCHESTRATION.md §6.1;
  tests/guard-shell.spec.ts pins "an alias name unmapped is no shell
  tool" — do NOT add alias normalization inside the rules; the journal
  records keep the model's spellings, the records' CallSubject.tool keeps
  the native).

tests/guard-records.spec.ts — 4/4 (was already green).

## What was done beyond the three specs (all uncommitted)

- guard-gate test 3 (children never reach the rules) + loops-guard 138
  (loops files-only judges parent calls) both hold: installRuleGate gained
  `judgeChildren?: boolean`; only installLoopsFileGuard sets it.
- installRuleGate marks BOTH listeners it installs (pre-execute +
  session/disposed) — design §3.1 "给它装的每个监听器打标记"; the
  contracts test counts by it.
- guard row wires shadow.event via ctx.on('session/event') (the shadow
  tests in guard-audit need it; batch-2 left it out).
- shared/health.ts: RowHealth extends RowHealthView (the tests read
  h.health.session); notes keep their first-insertion position on update;
  the 64-session cap covers note-only sessions (a `touched` map, oldest
  first-touch evicted with its report/base/notes).
- morning-report: '- 无' stays when there are no L3 decisions and no
  denials, the auxiliary lines (晚到的拦下/只记录/缺口/读不懂) follow
  (pinned by tests/workflow.spec.ts).
- graph row's journal returns the JournalOutcome to the gate so a lost
  record is named on the graph row's health.
- Inherited build errors fixed (batch-2 never ran build): gate.ts journal
  wrapper via async IIFE; report/index.ts header optional chaining;
  rules/gate.ts deps.journal widened structurally (rowJournal fits);
  morning-report casts via `as unknown as`.
- G1 also added workspace-containment over `str_replace_editor` (design
  §3.1 line "圈禁覆盖 str_replace_editor"), sharing fileToolTargetOf with
  directory-writes (the `view` command reads, everything else writes).
- Knip: un-exported LIFTS_FILE, RuleDeny, GateRules, and the six record
  types (Followup/Request/Grant/GrantVoid/Late/Lift) — all still used
  inside their files (GuardRecord union); re-export when the G2/G3/G4
  writers import them.
- jscpd clones removed: LateRecord extends Omit<ShadowRecord,'mode'>;
  loops/guard.ts rulesOf/journalOf helpers; memory-audit brokenFs helper;
  workflow reportOf helper.
- eslint --fix applied, then every new finding fixed by hand. NO new
  suppressions. Baselines pruned with npm run lint:update: eslint
  244 → 79 (down), knip 21 (unchanged), jscpd 2 (unchanged).

## Gate state (final, 2026-11-03)

- npm run build — exit 0.
- npm run preflight — exit 0 (2 packages, 14 src dirs, 17 rows).
- npm test — exit 0: 1750 tests across 93 TAP suites, 0 failed, plus
  preflight-bundle, check-verbatim (490 verbatim), check-lint (eslint 79
  suppressed, knip 21, jscpd 2), check-secrets, and the graph smoke.
- npm run -s probe — exit 0: 213/213 checks.

## Fixes made in the finishing session (all part of the G1 step)

1. tests/dialect-wiring.spec.ts test 3 was stale: it required BOTH rules'
   exceptions to end with the ask-the-human sentence, but design
   0.6-finish2 §5.2 replaces file-tools-only's exception in G1 (the rule is
   not requestable); the batch-2 pin in guard-rules.spec.ts is the
   design-true one. The test now pins: no request channel in either
   exception, containment still ends with the human sentence,
   file-tools-only starts with the build-and-git allowance.
2. The probe harness never configured the journaling rows' `home`, so the
   new projectHomeFor order (row home → session project root → data
   service, design §2.4, pinned by tests/data-home.spec.ts) sent probe
   journals to the session project root (the repository itself) instead of
   `<scenario>/home/audit/violations.jsonl`. scripts/sandbox.mjs dataRows
   now sets home on guard, graph and loops too (memory, workflow, hourness
   already had it), and the comment there is rewritten.
3. scripts/probe/run-probe.mjs: the graph scenario overlay redefined the
   graph row's config and wiped the dataRows home — graphRow now takes the
   scenario home and all five call sites pass it. The loops probe check
   expected `mode: 'enforce'` on the journal record; G1 removed the mode
   column from GUARD_RULES (design m4-gate row 6, pinned by
   tests/loops-guard.spec.ts "record.mode === undefined"), so the check now
   pins the record present with no mode.

## Commit and push

- Commit 362e66a on m4: "feat(m4-gate): installRuleGate judges through the
  gate, the old evaluate path is gone" — 56 files (the paths listed below
  plus the repo-wide eslint assertion cleanups in src/glm-llm/*,
  src/glm-prompt/todo-reminder.ts, src/guard/shell.ts, src/memory/tools.ts,
  src/toolsearch/search.ts, their tests, and the two probe scripts).
- Pushed to origin m4: 3cba295..362e66a, exit 0. package-lock.json not
  committed (gitignored); .agents/ records stay uncommitted.

## Suggested commit paths (as committed, see the commit for the final list)

package.json (test chain + specs), src/guard/{gate,lift,rules,records,
index,graph-files,catalog,shadow}.ts, src/guard/directory-writes.ts,
src/graph/index.ts, src/loops/{guard,index}.ts, src/memory/audit.ts,
src/report/index.ts, src/shared/health.ts, src/workflow/morning-report.ts,
src/data/project-home.ts, src/rules/gate.ts, src/glm-prompt/todowrite.ts,
tests/{guard-gate,guard-rules,guard-records,guard-audit,guard-shell,
graph-guard,loops-guard,health,contracts,memory-audit,workflow,hourness,
data-home,dialect-wiring}.spec.ts,
eslint-suppressions.json (shrunk), .jscpd-baseline.json (unchanged or
shrunk), knip-baseline.json (unchanged).

Subject used so far in notes: "feat(m4-gate): installRuleGate judges
through the gate, the old evaluate path is gone".
