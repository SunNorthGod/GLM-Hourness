# Rules board thin slice: peak mode level, 少做 cap and the glmHournessPeakMode service

Branch `rules-slice` (9396492, d032e54; base 322fd4a; main is at e752cab and moved only under `docs/graph/`, so the merge is clean). The slice implements design 0.10 §16.1: a per-project peak level (无影响 / 少做 / 不做, default 少做) that only the person changes through `/rules peak`, the 少做 cap as the constant `PEAK_REDUCE_GLM_WORKERS` (1) handed out as `glmWorkerCap`, and the service `glmHournessPeakMode` (`stateFor`, `stateForProject`, `peakHoldFor`) with its contract in `src/shared/peak-mode.ts`. The level is exported to `docs/rules/rules.json`; journal, snapshot and lock live in `<root>/.llm/rules/`. The row `glm-hourness/rules` ships `disabled: true`, gates and delays nothing, and has no dispatch logic. The gate record in the commit messages (build, preflight, test 730/0, probe 128/128, lint/knip/jscpd baselines unchanged) was read, not re-run.

Requested checks, all holding: no `.dsh`/`userHome` reference in `src/rules/` and the probe asserts nothing lands in the user-level directory; `apply` degrades to warn plus health on a bad `config.dir`, a failing command registration, a host without `provide`, an `on` that throws, and a taken service name (one test pins all five warnings); the patch entry is `disabled: true`; DESIGN.md, ORCHESTRATION.md §16, HANDOFF.md and DEVELOPMENT.md changed in the code's commit and carry no tone words (scanned over every added line and both commit messages); the F91/F92 fix is in `design.md` §10.7, §13 and §20; `graph-ops-slice.json` is an array of 8 Chinese `comment` ops on `rules`, `dogfood`, `d-rules-peak-slice`, `m7`, `m6`, `m3`, `m5` and `schedules`, all existing nodes.

Watch for: the slice's stored shapes are a subset of design §7.2 and the digest chain cannot absorb the full board's extra collections without a rule the design does not have yet (likely); the project-root function and the lock sit in `src/rules/` although design §7.3 and the dogfood seam ruling name `src/data/` (confirmed); `.llm/` is not added to `.git/info/exclude` in projects other than this one (confirmed).

**Verdict**: APPROVED

## High-level view

The main agent is out of every path: the row listens to `agent/created` and `session/disposed` only, registers no tool gate and no step hook, and the service members read memory and the pricing service without writing. The cap and the hold are filled by the same function (`peakModeState` / `peakHoldOf`), so the reminder and the dispatch tool cannot disagree about either. Storage follows the design's journal plus snapshot with one pure `applyRecord` for write and replay; the 5-seed property test and the two-process writer test pin the part that is hardest to get right.

"Strict subset, nothing to rewrite" holds for source files and not yet for stored data. `ProjectState`, the journal digests and `rules.json` are the subset the slice uses, so what the slice writes today is not valid input for a state shape with the full design's required collections. Separately, the project-root function and the lock, which two designs call shared, were built under `src/rules/`. Both are cheap to settle before the full board starts and dearer after M5 and M7 have written their own.

Three smaller gaps: `.llm/` is not made ignored in other projects, a one-time recovery leaves the row degraded with no stated way out, and the `agent/created` handler awaits a lock that can be held for two seconds.

<details>
<summary>Issues (7)</summary>

1. **Stored shapes vs the full board (likely)**: `ProjectState` and `RepoRules` omit design §7.2's `root`, `rules`, `proposals`, `signals`, `detectors`, `tickets`, `nextTicket`, `scripts`, `notices`; every journal `snapshot` is a digest of the subset. Decide in design 0.11 between fields that are absent when empty (digest-stable) and a version bump with a migration `base` record, and write it into §7.2 before R1 starts.
2. **Shared infrastructure placed in `src/rules/` (confirmed)**: `project-key.ts` is the function design §7.3 names `src/data/project-root.ts` ("whoever builds first builds it, the later one imports"), and the dogfood ruling says a slice that needs a lock creates `src/data/lock.ts` first. Preferably before merge, move `project-key.ts` to `src/data/project-root.ts`; add to the `m7` node (only `m5` mentions it) that E3's lock must be reconciled with `src/rules/lock.ts`.
3. **`.llm/` not ignored outside this repo (confirmed)**: design §7.1 has `.llm/` appended to `.git/info/exclude`; the slice leaves that to M5. Append it in the write path, or make "`.llm/` is ignored" a condition for enabling the row in any other project.
4. **`agent/created` can wait two seconds on the write lock (likely)**: the event is serial and the handler awaits `settle`, which waits up to `LOCK_WAIT_MS` when it must persist and another host holds the lock. Report health after the settle without awaiting it, or state the caveat in ORCHESTRATION.md §16.1.
5. **Recovery state never clears (confirmed)**: `state.recovered` with `snapshot-modified` or `journal-shorter` keeps the row degraded on every report, and that message names no remedy. Add the sentence the `unresolved` message already has.
6. **Cap written as a literal in the words table (confirmed)**: `PEAK_LEVEL_WORDS.reduce.half` says "至多 1 个" instead of using `PEAK_REDUCE_GLM_WORKERS`; design §3.6 wants text and enforced number to be one constant. Interpolate it.
7. **§16.1 list vs what was built (confirmed)**: §16.1 lists `builtin.ts` with `GLM_PEAK_PRICING` and the per-level entries, and design §7.4 gives `openRulesBoard` a `projectDir`; neither was built (no caller; documented in ORCHESTRATION.md §16.6). Amend §16.1 so R1 starts from the actual list.

</details>

<details>
<summary>Details</summary>

### Stored shapes against the full board's state

`model.ts` states the intent: the state holds what the peak level needs, and the other collections "join as further top-level fields". That works for `applyRecord` and `stateProblem`, which the full board extends. It does not work for bytes already on disk. Each record carries `snapshot = stateDigest(applyRecord(prev, record))`, a hash of `canonicalJson` over the whole state. A full board whose `emptyState()` has `rules: {}`, `tickets: {}` and the rest computes a different digest for the first slice record, so replaying a slice-written journal would report `digest-mismatch` for every line, and its `stateProblem` would reject the slice's snapshot. `rules.json` has the same property: design §7.2's `RepoRules` lists the collections as required.

ORCHESTRATION.md §16.3 acknowledges it ("读到旧快照要在核对摘要之后再补默认值，否则这一片写下的记录重放不过"), but that remedy is not a rule anywhere in the design and does not cover replay: old records are digests of the old shape and new records of the new one, so replay would have to know where the shape changed. Two clean options: fields absent when empty keep every old digest valid, or a version bump with a `base` migration record is explicit but ends 0.10's "no version 1 archive to migrate". Leaving it open costs little today, because the level is also in `rules.json` and deleting `.llm/rules/` restarts from that file (the tested `fresh-start` path); the cost grows with every day the slice runs.

The commit message and ORCHESTRATION.md §16 say the full board "does not rewrite or delete anything here"; that sentence needs the qualifier. Dropping `root` is sound (a path inside the digest is a liability) and the `rules` graph op already asks the next draft to drop it. Design §7.5 also says a valid snapshot has `version` 1 while `ProjectState.version` is 2; the slice uses 2 and the text should be corrected in the same pass.

### Project root and lock built under `src/rules/`

Design §7.3 says the project-root function is the same one as M5's `src/data/project-root.ts`, built by whoever implements first. The dogfood seam ruling (design-context, "Dogfood implementation order and runtime paths") says E3 creates `src/data/lock.ts` and that the slice, if it needs a lock, creates it first. The slice built `src/rules/project-key.ts` and `src/rules/lock.ts`. The lock has some cover, since design §7.4 itself says "在 `src/rules/lock.ts` 里重写", but the ruling is later and aims at one lock implementation; if E3 lands its own `src/data/lock.ts` the repository holds two near-identical file-lock modules and jscpd will see them. `project-key.ts` has no such ambiguity: `projectOf` and `gitDirOf` are not rules-specific, and moving the file now is a rename plus two import lines. The `m5` graph op describes the placement; the `m7` op should too, because E3 is where it collides.

### Runtime files without an ignore entry

`write()` creates `<root>/.llm/rules/` for any project with a `.git`. Design §7.1 relies on M5's `projectDirOf` to append `.llm/` to `.git/info/exclude`; no `projectDirOf` or `ensureIgnored` exists in the tree, and §16.3 says the slice left it out. This repository's `.gitignore` has `.llm/`, so dogfood is unaffected. In another project the journal, snapshot, `repo-written.json` and `rules.lock` show as untracked and `git add -A` commits them, which d-rules-in-repo rules out for runtime state. Exposure is small: the row is disabled, and `.llm/rules/` is created only by `/rules peak <level>` or by a settle with something to persist, never by opening a session (`rules-store.spec.ts` and `rules-row.spec.ts` assert the root holds only `.git` after looking). About fifteen lines using `gitDirOf` close it.

Not tested: `.git/info/exclude` after a first write.

### Session creation waits on the write lock

`agent/created` is `serial` in DESIGN.md's event table and the listener awaits `settle`. `settleProject` returns at once when the read found nothing to persist, the normal case. When a recovery, a start from `rules.json` or an owed file write is pending it calls `acquireLock`, which retries every 25 ms for `LOCK_WAIT_MS` (2000). Two hosts opening sessions in one project right after a pull can make one agent's creation wait. It is not a peak-level effect, so `d-main-agent-peak-exempt` is not breached, but the documentation's flat statement that nothing in the row delays an agent is stronger than the code.

Not tested: lock contention inside the `agent/created` path; the `busy` branch of `settleProject` has no case.

### Smaller departures

`projectHealth` adds the `snapshot-modified` and `journal-shorter` texts to `problems` whenever `state.recovered` has that reason. `recovered` is replaced only by a later `recovered` record and the slice has no `/rules recovery`, so the row reports `degraded` in every session from then on; the `unresolved` message ends with the way out (delete `.llm/rules/`), these two do not.

`PEAK_LEVEL_WORDS.reduce.half` and the `/rules peak 少做` reply say "至多 1 个" as text, and `tests/peak-mode.spec.ts` pins the names and the intro's key sentences, not the halves, so changing the constant would leave a wrong sentence and a green suite. Different wording from the §9.1 strings is allowed by the design as long as the meaning matches; the number should be derived.

§16.1 includes `builtin.ts` with the default rule and the subsidiary entries. The task's scope list does not, and without `judge`, the rules page or a gate they would have no caller, so leaving them out matches "no stubs". The difference is recorded in ORCHESTRATION.md §16.6 and the `d-rules-peak-slice` op; §16.1 should be amended so the next step does not look for them. `openRulesBoard({projectRoot, rulesDir})` lacks the `projectDir` of design §7.4; adding it later is additive.

</details>

<details>
<summary>File map</summary>

Source, new: `src/shared/peak-mode.ts` (contract, cap, hold, words), `src/rules/model.ts` (state, record, `effectivePeakMode`, rules-file shape), `src/rules/store.ts` (`applyRecord`, journal, snapshot, replay, recovery), `src/rules/engine.ts` (the one write), `src/rules/repo.ts` (`rules.json` export, start from file, outside change, git-busy deferral), `src/rules/lock.ts`, `src/rules/project-key.ts`, `src/rules/permissions.ts`, `src/rules/peak.ts` (service and clock), `src/rules/row-health.ts`, `src/rules/index.ts` (row and `/rules peak`).
Source, changed: `src/shared/pricing.ts` (`nextPeakChange`), `src/shared/health.ts` (`rules` in `HOURNESS_ROWS`).
Wiring: `scripts/packages.mjs`, `packages/hourness/{cordis.patch.yml, package.json, tsconfig.json, locale/rules/*}`, root `package.json` test list.
Tests: `tests/peak-mode.spec.ts`, `rules-model.spec.ts`, `rules-store.spec.ts`, `rules-engine.spec.ts`, `rules-row.spec.ts`, `rules-helpers.ts`, one line each in `contracts.spec.ts` and `health.spec.ts`; probe scenarios `rules-peak` and `rules-peak-hourness` in `scripts/probe/`.
Docs: `docs/ORCHESTRATION.md` §16, `docs/DESIGN.md` (row table, interface table, health, degradation), `docs/HANDOFF.md` (component table, counts), `docs/DEVELOPMENT.md` (probe profiles).
Outside the branch: `.agents/tasks/rules/design.md` (F91/F92), `.agents/tasks/rules/graph-ops-slice.json`.

Full diff: `git -C .worktrees/rules-slice diff main...HEAD`.

</details>
