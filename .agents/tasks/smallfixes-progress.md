# smallfixes lane progress

## Stage: rules re-read (2026-11-13)
- HEAD dff6b2e7, main, clean tree at start.
- Re-read AGENTS.md (user + repo), CHARTER, DEVELOPMENT.md, HANDOFF §10, DESIGN §5.2a.

## Stage: commit 1 done (2026-11-13)
- worker read-tree/index-write denial in worker-git judgment: 5a3c5d53.
- src/guard/execute-rules.ts: INDEX_WRITE_SUBS (read-tree, update-index) + apply --cached/--index; deny when the dispatch has no worktree (calls resolve to the main checkout) or --index-output points outside the worktree (absolute/relative/unreadable); in-worktree plain writes pass; read-tree -u still snapshot-gated.
- tests/execute-row.spec.ts: +1 test (two denial paths + in-worktree pass), 12/12 in file.
- docs/HANDOFF.md §10 item 1④ moved to fixed; docs/ORCHESTRATION.md §17 worker-git parenthetical extended.
- Gates: build 0, preflight 0, npm test 0 (3746 tests = baseline 3745 + 1), ratchets 73/18/1 unchanged. One eslint roundtrip fixed (unused destructured var in the new test).
## Stage: commit 2 done (2026-11-13)
- ablation tail cleared: a1ea9b4f (docs-only).
- Premise check before writing: production prompts already carry the §5.2a-designated texts — A2 one sentence (95cb4aaa), A3 deferral (22990cdd, survived face migration), A1/A4/A5 kept. Tests (contracts, guard-audit, calibrate-ablation: WORKSPACE_RULES_SHORT === WORKSPACE_RULES_TEXT) and probe scenarios pin the production texts; src/ sweep found no leftover experiment wording (only dated provenance comments + the deliberately kept calibration switch). No code/test change needed — instruction's removals were already done by the adoption commits.
- docs/DESIGN.md §5.2a hold clause rewritten as decided; HANDOFF §10 item 3 rewritten as cleared; §10 footer pending-decision list drops the ablation line.
- Gates: build 0, preflight 0, npm test 0 (3746), ratchets 73/18/1 unchanged.

## Stage: final probe (2026-11-13)
- Starting: unset GIT_CONFIG_COUNT/GIT_CONFIG_KEY_0/GIT_CONFIG_VALUE_0; waiting for .llm/probe-lock or .llm/probe-lock-2 (never delete); log prefix smallfix-; no rebuild during the probe. Expect 562/580, same 18 baseline labels.
- Probe done (lock held and released cleanly, .llm/probe-lock): 562/580 passed (.llm/probe-smallfix-1.log, run kept in %TEMP%\glm-hourness-probe-2026-11-12T18-57-37-348Z-DU1aCY). 18 FAIL labels classified: 13 headless exit-1 tail cluster (design modules/release, exec dispatch GLM+non-GLM x2 each, exec docs/merge/merge-upstream/modules/plan/review, guard request worker), 3 rules ticket lifecycle (rules-handover x2, rules-peak-wake), 2 upstream runtime drift (glm execution Glob order, Write over unread). Identical composition to the documented baseline (b10rr 562/580); no new reds, none touching worker-git or prompt sections.
## Stage: pushed (2026-11-13)
- origin/main (Gitee) dff6b2e7..a1ea9b4f pushed; github (mirror, proxy 7890) same range pushed. Lane complete: 2 commits, one thing each; probe 562/580 with the documented 18 baseline labels; ratchets 73/18/1 flat throughout.
