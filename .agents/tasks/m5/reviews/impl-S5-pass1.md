# Review of S5 (D1; m5-3), pass 1

Range: `7dc790a..2a1ac01` (one commit, `2a1ac01`). Review level: normal (plan section 1). Verdict: APPROVED, no blockers.

## What was checked, and against what

Sources read: `impl-plan.md` S5 entry; `design.md` 0.7 sections 1.2 (m5-3), 3.5 (written-out text, Z1 to Z9, L1, L2, test spec); the whole diff (8 files): `src/glm-prompt/{zcode-memory-text,localize,index}.ts`, `src/shared/tool-names.ts`, `scripts/check-verbatim.mjs`, `scripts/probe/run-probe.mjs`, `tests/glm-prompt.spec.ts`, `docs/DESIGN.md`; unchanged callers: `memorySectionApplies`, `rewriteDialectSections` use, the other users of `dialectSections` (`tests/dialect-wiring.spec.ts`, `tests/s5.spec.ts`), the probe lines that use `MEMORY_SECTION_LINE`.

Evidence taken from the record, not re-run: the commit message and the implementer's report give `npm run build` 0, `npm run preflight` 0 (13 source directories, 15 rows), `npm test` 0 (eslint 228 suppressed, knip 21, jscpd 2, all at baseline), `npm run check:verbatim` 0 (499 verbatim, 0 known deviations, 299 lines), `npm run probe` 0 with 165/165 (same count as the S4 head), `npm run check:secrets` 0. Failing first is recorded: the parent tree fails `tests/glm-prompt.spec.ts` with `ERR_MODULE_NOT_FOUND` for the mirror file, and a one-word edit of the mirror ("Link liberally" to "Link freely") turns `check:verbatim` red. `git status` is clean at `2a1ac01`; commit author equals the base's author.

Two read-only spot-checks, because the acceptance text says "verbatim":

1. The mirror against the pristine bundle `reference/zcode-3.17.1/zcode.cjs` (`buildMemoryContent`, the function around the offset where "Link liberally" occurs). The ten lines in `ZCODE_MEMORY_LINES` (heading, both fences, `name:`, `description:` with the comma, the indented `type:` line, the body line, the link line, the kinds line with `` `user`: ``, the single Z7 to Z9 line) are the bundle's strings character for character. The bundle's Z2 and Z6 lines, with the directory and `MEMORY.md`, are not mirrored. The three differences that DESIGN.md section 5.9 claims against the 3.16.2 source (comma in `description:`, colon in the kinds line, sentence break in Z7/Z9) are real: `reference/ZCode/.../sections/memory.ts` has the dash forms and the single sentence.
2. `buildMemorySectionDsh(true)` against the fenced text in design.md section 3.5, loaded and compared programmatically: equal, 2,213 characters; `buildMemorySectionDsh(false)` equals that text without the final empty line and L2, 2,114 characters, 19 newlines (21 with L2).

## Plan review points

- Full text, length and newline count: pinned in `tests/glm-prompt.spec.ts` as a literal copy of the design text plus the two lengths and two newline counts; spot-check 2 shows the literal and the design agree.
- Z5 `project` sentence in place: it is inside the kinds line, which the sentence test and the literal text both require.
- Verbatim gate: the mirror file is in `MIRROR_FILES`; the gate and `tests/check-verbatim.spec.ts` (import-block check over every mirror file) passed per the record. Lines shorter than the gate's 13-character minimum (`# Memory`, the two fences) are covered by the full-text test, as design 3.5 says.
- Whitelist test: the lines that are not empty, not one of Z2/Z6/L1/L2 (each at most once, L2 only when asked for) and not the `body: ` line are compared, after the two Z7 words are put back, with the mirror lines one to one and in order. An added or reworded sentence in the section fails it; without L2 the L2 sentence would land in the remainder and fail. The test does what design 3.5 asks.
- `replaceOnce`: throws unless the text occurs exactly once; uses a replacer function, so `$` sequences in the replacement are inert. It runs at module load for Z7; a mirror edit that changes the two phrases fails the build and the specs at once, not a session.
- Condition: `wanted` is judged on `next()`'s own tools, before the alias rewrite and tool search. No memory tools: no section (L2 irrelevant, so a child agent with `lessons_query` but no memory tools still gets none). Memory tools and `lessons_query`: the section with L2. Memory tools only: without L2. A start-plan assembly has no memory section in `sections`, so the swap does nothing there. Tested through `installDialect` with the fake host for the last two cases; the first is the existing test.
- `d-code-rules-enforce`: no listener, rule or guard entry is added.
- Probe: `MEMORY_SECTION_LINE` is the new first sentence; its three uses (memory scenarios by route, worker child absent, `glm-only` absent versus `glm` present) assert what m5-3 item 4 says.
- No remaining use of the old section: no match for `MEMORY_SECTION_DSH`, "persistent memory in this workspace", "Memories decay" or "memory_store refuses" in `src`, `tests`, `scripts`, `packages`, `ui` or `docs`. The S4 observation that the dialect text must not lag behind the S4 tools is closed by this step.
- Constraints: strict TypeScript, no parameter properties, no regex literals or division in the mirror file, no persona or tone words in the added lines (grep), `git diff --check` clean, no baseline file touched, the new export `LESSONS_QUERY_TOOL` is used by `index.ts`.

## Observations that are not blockers

1. `docs/DESIGN.md` section 5.9, the bullet "镜像文件：整份文件都是逐字声明的源文件（…）", lists five files and still omits `src/glm-prompt/zcode-memory-text.ts`, which `MIRROR_FILES` now has. The new table row in the same section names the file, so the document is complete in substance; the enumeration is one entry short. `tests/dialect-wiring.spec.ts:76` keeps the comment "ledger ⑧: memory home is .llm", which describes the old section. Both are for the merge step, which already edits `docs/DESIGN.md` for the M6 and M3 overlap.
2. Merge: `src/glm-prompt/index.ts` conflicts with M6 (`a3eb0ac`) at the `tool-names.ts` import line and, through the `installDialect` signature M6 changed, possibly in `tests/glm-prompt.spec.ts` (the new test calls `installDialect(rt.agent, {})`). The merge step should rerun the gates and the probe after folding. S7 must register `lessons_query` under `LESSONS_QUERY_TOOL` (and reuse the constant, not a second literal) and keep it resident, otherwise the lessons sentence never appears.

## Verdict

The section equals the written-out design text, the mirror equals the 3.17.1 bundle, the conditional sentence follows the tools of the step, and the recorded gate results cover the plan entry. No reachable correctness, security or data failure found. APPROVED.
