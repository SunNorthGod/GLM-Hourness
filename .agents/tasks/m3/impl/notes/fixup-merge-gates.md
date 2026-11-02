# M3 merge-gate fix-up — run notes (2026-11-02)

Worktree `.worktrees/m3`, branch `m3`, base `2d43b29`. Ten commits, one per root cause, no push, design row still `disabled: true`. The uncommitted step-12(a) work was never staged, stashed or reverted; its final delta is byte-identical on changed lines to the delta recorded before the run (see "dirty shared files").

## Commits in order

1. `b67968b` fix(m3): judge nested transport calls by the main agent's rules (S4-1, S5-1, S6-2, S8-3)
2. `742e404` fix(m3): the outbound check reads the -c pairs of the command line (S4-2)
3. `e3bd9c9` fix(m3): the outbound and clean checks hold for the alias expansion too (S4-3)
4. `b5e6ecb` fix(m3): the guard declaration drops the file-tools-only line for the main agent (S4-4)
5. `e70c534` docs(m3): name the dispatch-time focus gap of design-before-release in the residuals (S5-2)
6. `967138d` fix(m3): a /wish that errors after it wrote the record releases it (S3-1 R1, S3-3)
7. `0bc8a2f` fix(m3): a /wish in flight keeps the role; the loser's demoteOthers skips the record's holder (S3-1 R3)
8. `293d022` docs(m3): state the condition for the steps that read mainAgentOf (S3-1 R2)
9. `4ba6926` docs(m3): the creation-time deletion reads the mode, not the /wish log (S3-1 R4)
10. `52769eb` fix(m3): satisfy the gates in the S4-4 and R3 fixes (a lint assertion, two jscpd clones)

## Per finding

### S4-1 + S5-1 + S6-2 (+ S8-3, re-flagged as S9-2) — nested-call hole: fixed

Decision recorded: judging, not degrading row health when the tool mode is ptc (the stronger of the two prescribed fixes; no hard blocker found — outside the PTC preset nothing dispatches nested calls, and only the design row's listener changed; the guard row's `parent` pass and the rules/loops rows are untouched). One commit covers all four ids as the orchestrator ruled.

- `src/guard/main-agent.ts`: the `payload.parent !== undefined` skip removed; a nested call is judged like a direct one of the same agent (delegated sessions through `judgeDelegated`). Header comment updated; same in `src/guard/main-agent-graph.ts`.
- `src/design/identity.ts`: no edit. Its unconditional claims (no file tools, dispatched sessions read-only, relayed words the human's) hold under the PTC preset with this change; verified against each sentence.
- Docs: ORCHESTRATION §6.4 (main-agent row), §6.7 (first paragraph), §6.8 (residual bullet), §6.9 (residual); HANDOFF design row drops the PTC residual; DESIGN.md `tools.execute` note now says each listener decides how it treats a parent call.
- Tests (failing first, recorded on the parent tree):
  - `tests/design-graph-rules.spec.ts` "a nested call with a parent token is judged like a direct one: a fabricated relay is refused" — red (allowed; note the pinned test had used a nonexistent node id, which the relay rule never reads the graph for; the flipped test seeds a real proposal).
  - `tests/design-graph-rules.spec.ts` "a nested call ... is judged by the stage rule too" — red (allowed).
  - `tests/design-guard.spec.ts` "a nested call ... the main agent writes nothing and a dispatched child stays read-only (S4-1, S5-1)" — red; plus the design-before-release roots test's nested assertion flipped.
  - After: design-guard 28/0, design-graph-rules 34/0, design-stage-notice 34/0.

### S4-2 — outbound check does not read `-c`: fixed

- `src/guard/git-snapshot.ts` `outboundRefusal`: every config read now carries the invocation's `-c` pairs in front, the way `prefixOf` does for the snapshot's own calls, so `git -c remote.origin.mirror=true push` and `git -c remote.origin.push=refs/*:refs/* push` are refused.
- Test: `tests/git-snapshot-history.spec.ts` "the -c pairs on the command line count for the outbound check (S4-2)" — red on the parent tree (both pushes allowed); after 16/0 (git-snapshot 11/0, git-snapshot-files 27/0).
- Doc: ORCHESTRATION §6.7 outbound sentence.

### S4-3 — alias expansion not checked: fixed

- `src/guard/git-snapshot.ts`: `aliasRisk` renamed `aliasOf` and reshaped — the expansion is returned whenever the subcommand is an alias, with its risk possibly undefined (the old shape returned nothing for an expansion the risk table scored harmless, which is how `git p --mirror` passed without even a snapshot); `guardOne` runs `cleanRefusal` and `outboundRefusal` on the expansion before deciding on the snapshot.
- Test: `tests/git-snapshot-history.spec.ts` "the outbound and clean checks hold for the alias expansion too (S4-3)" — red on the parent tree (aliased `push --mirror` and aliased `clean -fdx` both allowed); after 17/0. The test needed `existsSync` added to the spec's imports.
- Doc: ORCHESTRATION §6.7 recognition paragraph.

### S4-4 — the "Workspace rules" line tells the main agent to use Write/Edit: fixed

- `src/guard/index.ts`: the declaration listener reads the session's `hournessMainAgent` projection (`mainAgentMode`, unreadable counts as not) and passes `file-tools-only` with an empty declaration for the main agent — its identity section holds the boundary; containment is still declared. Option (a) of the finding ("omit the line for the main agent").
- Test: `tests/guard-audit.spec.ts` "the main agent's declaration has no file-tools-only line (S4-4)" — red on the parent tree; after 27/0 (guard-sections 5/0, design-mode 60/0).
- Doc: ORCHESTRATION §6.1 declaration sentence.

### S5-2 — judged by the focus at write time: fixed (doc-only)

- ORCHESTRATION §6.8 residual list gains the dispatch-time-focus bullet (the main agent moves focus after dispatching; M7's `releaseOf` takes this over with the goal-level case). Commit `e70c534`.

### R1 — /wish errors after writing the record leaves an orphan: fixed (with S3-3 in the same commit, as the finding prescribes)

- `src/graph/main-agent-holder.ts`: the temporary-file cleanup in `claimHolder`'s `finally` and `replaceHolder`'s catch no longer throws (S3-3) — a record in place and a leftover `.tmp` beat a failed /wish and a masked rename error.
- `src/design/mode.ts` `enter()`: the catch releases the record best effort before returning the error; a failed release is that session's degraded health (`staleRecordKept`), and /wish off in the session deletes it. `src/design/index.ts` header comment names the new first deleter.
- Tests (`tests/design-mode.spec.ts`, all red on the parent tree): "a temp-file cleanup that fails does not fail the /wish (S3-3, S3-1 R1)" (the finding's failing-`.tmp`-unlinkSync reproduction now succeeds), "a /wish here that errors after it wrote the record releases it (S3-1 R1)" (broken `agents` registry makes `demoteOthers` throw after `replaceHolder`), "a record that cannot be released after the error is reported in the mover's health (S3-1 R1)" (`whileRecordsCannotBeDeleted`).
- Docs: ORCHESTRATION §3.1 (the error path and the exact windows of `mainAgentOf`) and the HANDOFF design row.

### R3 — lapsed takeover races the await demoteOthers: fixed

- `src/design/mode.ts`: a `claiming` WeakMap marks the handler's claim in flight from the first record write; cleared in the `finally` (nothing of the handler awaits after it — the stretch to `setPending` is synchronous). `standingOf` answers 'open' for a session whose claim is in flight.
- `src/design/index.ts` `demoteOthers`: reads the record per candidate and skips the session it currently names. The first cut read the record once at entry; the test caught the stale holder being demoted after the record changed hands during the gate — per-candidate reads fixed it.
- Tests (`tests/design-mode.spec.ts`, both red on the parent tree, reproducing the s1-error/s2-success scenario): "a plain /wish in another session does not steal the role while a /wish here is still moving it: it is pointed, and the mover finishes (S3-1 R3)"; "the loser's demoteOthers skips the session the record names: a /wish here that completes during another one's demote wait keeps the role (S3-1 R3)" (a held first `/wish off` parks the loser inside `demoteOthers` while a second `/wish here` completes). After: design-mode 65/0.
- Doc: the HANDOFF design row states both guards.

### R2 — mainAgentOf trusts the record alone: deferred to the wiring steps, per the finding

- No consumer of `mainAgentOf` exists on m3 or main (grep: only the mode.ts comment, tests, docs), so the real fix — a design-row reader checking `agents.get(id)` and the session mode — belongs to the steps that wire M5, M7 and the loop board. The finding's condition is now stated in ORCHESTRATION §3.1 (such a reader, or an accepted window in the consumer's design); the HANDOFF design row already tells those steps to know the window. Recorded here as a condition for those steps: read `mainAgentOf` only through a reader that verifies the session is live and its mode is on (mode off with no /wish in flight counts as none), or accept the window explicitly in the step's design.
- Commit `293d022` (doc-only).

### R4 — §3.1 deletion criterion does not match alignOnCreation: fixed

- `src/design/index.ts` `alignOnCreation` docstring and the ORCHESTRATION §3.1 sentence state the code's criterion: mode off and readable while the record names the session — whatever the log says about the /wish (finished, errored, never written).
- Commit `4ba6926` also closes the HANDOFF design row's owed-fixes list for what this branch landed; `S5-3` and `S5-4` (orchestrator process items) remain for the orchestrator.

### Follow-up commit

- `52769eb`: `npm test` flagged an unnecessary type assertion in the new `mainAgentMode` (eslint `no-unnecessary-type-assertion`) and two 6-line jscpd clones between the new R1/R3 tests; the assertion is gone and the shared setups are `moverWithBrokenRegistry` and `holdWishOffs`. Test counts unchanged (design-mode 65/0, guard-audit 27/0).

## Dirty shared files (step 12(a) coexistence)

- `package.json` and `docs/DEVELOPMENT.md`: untouched; their uncommitted diffs are byte-identical before and after the run. No new spec files were created, so no test-list edit was needed.
- `docs/ORCHESTRATION.md`: edited through the save/apply/commit/restore dance for the doc hunks of commits 1–6, 8, 9. The restore in the dances from commit 2 on reverted that round's committed edit in the working copy (the per-dance check compared only the first four lines of the diff and hid it). Found after the gates; repaired by rebuilding the working file as HEAD plus the saved 12(a) patch (`git apply` of the delta recorded before the run). Final state verified three ways: the working file contains all eight committed doc edits; its uncommitted diff's changed lines equal the pre-run 12(a) delta exactly; the committed range `2d43b29..HEAD` contains no 12(a) marker (grep for `interview-metrics`, `event-times`, `emitMetric`, `events.jsonl`, `需求访谈任务的指标` = 0).
- `package-lock.json`: absent from the worktree at the start and now; nothing in this run created or deleted it.
- No overlap occurred: the 12(a) hunks (ORCHESTRATION §10.5 area, package.json test list, DEVELOPMENT §3) touch none of the lines this run edited.

## Gates (final tree, serial, this order)

- `npm run build` — exit 0.
- `npm run preflight` — exit 0 (2 packages, 15 rows composed).
- `npm test` — exit 0; per-spec pass total 1415, 0 fail; eslint ok (243 suppressed), knip ok (19 in the baseline), jscpd ok (1 clone in the baseline), check-verbatim OK (489 verbatim, 0 deviations), gitleaks ok (staged and unstaged scanned).
- `npm run probe` — exit 0, 213/213 passed (artifacts `.llm/probe-runs/2026-11-02T07-49-13-321Z`).

The first full gate run happened while the working ORCHESTRATION.md still carried the reverted doc edits; because that repair touches one uncommitted markdown file no test or linter reads, the gates were re-run in full on the final tree after the repair, and the numbers above are that final run.
