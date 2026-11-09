# probe-run-dir-outside-repo report

- Base sha (origin/main): 125f88935d7fc7766f113f568c72fc4617ad3d82
- Branch: probe-run-dir-outside-repo
- Worktree: C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\probe-run-dir-outside-repo
- Dependencies: node_modules is a junction to the main checkout's node_modules (same commit as origin/main, same lockfile), matching the other worktrees.
- tests/lessons-seed.spec.ts input: .agents/tasks/m5/lessons-seed.json copied read-only from the main checkout.

## Conflict note

Branch ablation (.worktrees/ablation, not merged) also edits scripts/probe/run-probe.mjs and scripts/sandbox.mjs. Whoever lands second resolves the conflict.

## Part 1: what holds freshly written files under the repository tree (read only)

Method: no tool installed, no system setting changed, no exclusion added, no process stopped. A PowerShell loop (`replace-loop.ps1`, kept in this directory, not in the repository) writes a target, waits 40 ms, writes a staging file and calls kernel32 `ReplaceFileW` (the call DSH fs-local makes); on a failure it asks the Restart Manager (`RmGetList`) which processes hold the target. The loop's directories were deleted after each pass.

Results, 500 iterations each:

| Directory | Failures (Win32 1175) |
| --- | --- |
| worktree `.llm\replace-loop` | 10, 11 |
| worktree `.llm\rl-plain` | 16 |
| worktree `.llm\rl-nm\node_modules\pkg` | 19, 12 |
| main checkout `.llm\replace-loop-main` | 9 |
| `%TEMP%\glm-hourness-replace-loop` | 0 |
| `%TEMP%\glm-hourness-gitrepo-test\sub` (a git repository) | 0 |
| `C:\Users\29596\glm-hourness-replace-loop` | 0 |
| `C:\Users\29596\Desktop\Project\glm-hourness-replace-loop` (parent of the repository) | 0 |
| `C:\Users\29596\Desktop\Project\ark-headless\.glmh-replace-loop` (another git repository, not open in an editor) | 0 |

Every failure was 1175, and the Restart Manager reported no holder for any of them: the handle was closed again by the time of the query.

Candidates checked:

- Windows Defender: real-time protection, on-access protection and antivirus off, AMRunningMode `Not running`; services WinDefend and WdFilter stopped. Not the holder.
- 360安全卫士: registered with Security Center as an antivirus product (productState 335872); no 360 process was found running.
- Windows Search: WSearch and SearchIndexer run; the crawl scope includes `C:\Users\` but the index has no row under the repository, the worktrees or `%TEMP%`; `Desktop\Project` outside the repository gave 0/500. Not supported by the data.
- OneDrive: OneDrive.Sync.Service runs, but the Desktop is `C:\Users\29596\Desktop`, not under OneDrive, and the parent directory gave 0/500. Not supported by the data.
- Filter drivers: `fltmc` needs elevation (access denied); among file system filter services bindflt, CldFlt and wcifs are present. Not examined further.
- `openfiles` needs the system global flag "maintain objects list" (a system setting), so it was not used. No handle tool is installed.
- Kiro: the repository root is the open Kiro workspace (recent folder `Desktop/Project/GLM-Hourness`, `kiroAgent.enableCodebaseIndexing: true`), with many Kiro node services running; the worktrees are inside it.

Conclusion: the failures appear only inside this repository's tree (main checkout and worktree alike, git or not, node_modules or not) and not in any other directory tried, including the parent directory and another git repository. The holder that fits the data is the Kiro workspace's file watcher or codebase indexer; this is an inference, not confirmed by a handle query. The process stayed unidentified.


## Part 2: change

Commits on branch probe-run-dir-outside-repo (pushed to origin only):

- c4ec40ae fix(probe): run each probe in a directory under the system temp dir. `scripts/sandbox.mjs` gains `openRunDir` (mkdtemp `glm-hourness-probe-<stamp>-*` directly under os.tmpdir()) and `removeRunDir` (unlinks every junction inside first, refuses anything that is not a direct prefixed child of the temp root). `scripts/probe/run-probe.mjs` opens the run directory there after the profile guards; a run with every check passing deletes it, any other exit keeps it and prints `probe: run artifacts kept in <path>` on stderr. The metrics-concurrent child imports the library by file URL (the temp dir need not share a drive with the checkout). Each scenario still runs in a git repository of its own (`scenarioWorkspace` unchanged). Docs: DEVELOPMENT.md §3 and a §7 row, FACTS.md §3 row on the 1175 finding, HANDOFF.md `.llm/` line. L2: tests/probe-workspace.spec.ts (location, no repository above it, deletion does not follow a junction, refusal of other directories). No other script reads `.llm/probe-runs`.
- acc3661a fix(probe): give each scenario's runtime its own TEMP. Cause: rc.3's workspace-write sandbox allows writes under the workspace and the runtime's os.tmpdir() (dsh-sandbox `writableRoots`); with the run directory under %TEMP%, the guard-request scenarios' "outside the workspace" targets became writable and 3 checks failed (419/422 on c4ec40a, first round runs 1-2, logs probe-r1-*.log). Fix: TEMP/TMP of the runtime set per scenario.
- f13596ba fix(probe): put each scenario's runtime TEMP beside the scenario directories. Cause: acc3661 used `<scenario>/tmp`, which is inside the workspace of scenarios that name no directory; rc.3's Windows ACL sandbox refuses a temp root inside the workspace (`assertTempRootOutsideWorkspace`), so sandboxed shell calls failed (408/422, probe-r2-1.log). Fix: `<run dir>/runtime-tmp/<scenario>`.

## Gates

| Commit | Gate | Exit | Log |
| --- | --- | --- | --- |
| c4ec40a | build | 0 | build.log |
| c4ec40a | preflight | 0 | preflight.log |
| c4ec40a | probe-workspace spec | 0 (5/5) | spec.log |
| c4ec40a | check-lint | 0 (eslint 73, knip 18, jscpd 1) | lint.log |
| c4ec40a | npm test | 0 (3187/3187, graph:smoke ok) | test.log |
| acc3661 | build / preflight / spec / lint / npm test | 0 / 0 / 0 / 0 (73/18/1) / 0 (3187/3187) | build-2, preflight-2, spec-2, lint-2, test-2 |
| f13596b | build | 0 | build-3.log |
| f13596b | preflight | 0 | preflight-3.log |
| f13596b | check-lint | 0 (73/18/1, no rise) | lint-3.log |
| f13596b | npm test, run 1 | 1: one failure in tests/loops-* "two processes appending to the change record at once ..." (sequence 1 twice); not touched by this change | test-3.log |
| f13596b | npm test, run 2 | 0 (3187/3187, graph:smoke ok) | test-4.log |

The loops concurrent-append failure is an intermittent race in existing code, unrelated to the probe run directory; reported, not fixed here.

## Probe: 3 consecutive full runs on f13596b

Lock `.llm/probe-lock` taken 08:55:42 (owner.txt `wf_15841f21cb194d57 build-loop/code`, rewritten every 5 minutes), removed 09:22:54 after the runs.

| Run | Exit | Result | glm Edit alias | glm Read after it | Log |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 422/422 | PASS | PASS | probe-1.log |
| 2 | 0 | 422/422 | PASS | PASS | probe-2.log |
| 3 | 0 | 422/422 | PASS | PASS | probe-3.log |

All three run directories (under %TEMP%) were deleted by the runs themselves. The five directories of the earlier failed runs (c4ec40a, acc3661) remain under %TEMP% as designed (`glm-hourness-probe-2026-11-05T23-*`, `...-2026-11-06T00-19-*`, `...-2026-11-06T00-29-*`).

A second round on acc3661 (08:19-08:29, probe-r2-1.log, 408/422) was stopped after its first run because that commit had the TEMP-inside-workspace defect; its lock was released before the f13596b round. The other probe process seen at 08:30 belonged to the lane holding .llm/probe-lock-2 and was not touched.

## Landing (wf_15841f21cb194d57 land)

### Main checkout before the landing

At 09:28 the main checkout (main b58a2b1) had a tracked edit in docs/DESIGN.md (mtime 08:58, not from this step: duplicated heading, §2.2 rows for design, loops, transcript and ui deleted). The step stopped and reported. The orchestrator archived it as .agents/tasks/zcode-parity/stray/design-md-0858.patch and restored the file; `git status --untracked-files=no` was clean afterwards and stayed clean before the fast-forward.

### Merges of origin/main and gates

origin/main moved four times while the gates ran; each time the branch merged it again. Logs in this directory.

| Merge commit | origin/main merged | What came in | build | preflight | npm test | check-lint (eslint/knip/jscpd) | probe | Logs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9e9c23e | b58a2b1 | code and docs (incl. run-probe.mjs, auto-merged) | 0 | 0 | 0 (3205/3205) | 0 (73/18/1) | 0, 427/427 | land-*.log, land-probe.log |
| c5a45c3 | 7c13564 | docs/graph only | 0 | 0 | 1 (2764 pass, 1 fail: tests/glm-metrics.spec.ts #7, the known quota-read join race on main, not touched by this branch); rerun 0 (3205/3205) | 0 (73/18/1) | not rerun (tree outside docs/graph equal to 9e9c23e) | land2-*.log, land-test-3.log |
| ce5398f | 8bddad7 | status-hub-3 (code; run-probe.mjs and HANDOFF.md auto-merged, no conflict; run-probe.mjs still uses openRunDir/removeRunDir) | 0 | 0 | 0 (3225/3225) | 0 (73/18/1) | superseded before the probe | land3-*.log |
| 7732aa5 | 5f1e3f3 | docs/graph only | 0 | 0 | 0 (3225/3225) | 0 (73/18/1) | 0, 429/429 | land4-*.log, land4-status.txt |
| aeb046d | 2031d21 | docs/graph only | 0 | 0 | 0 (3225/3225) | 0 (73/18/1), no rise | not rerun: tree outside docs/graph equal to 7732aa5 (empty diff), which passed 429/429 | land5-*.log |

Probe runs took .llm/probe-lock or .llm/probe-lock-2 with owner.txt `wf_15841f21cb194d57 land`, rewritten within 10 minutes, and released after the run. Build never ran in parallel with another gate.

### Fast-forward and push

- Branch pushed to origin: f13596b..9e9c23e, then 9e9c23e..aeb046d.
- Main checkout status (`--untracked-files=no`) before the fast-forward: empty.
- `git -C C:\Users\29596\Desktop\Project\GLM-Hourness merge --ff-only probe-run-dir-outside-repo`: 2031d21..aeb046d, exit 0.
- Merged main sha: aeb046d37defc9e3e9fb2e1c3399013bc22353ee.
- push origin main: 2031d21c..aeb046d3, exit 0. push github main: 2031d21c..aeb046d3, exit 0 on the first try.
- ls-remote right after the push:
  - origin: `aeb046d37defc9e3e9fb2e1c3399013bc22353ee	refs/heads/main`
  - github: `aeb046d37defc9e3e9fb2e1c3399013bc22353ee	refs/heads/main`
- Later, while the main checkout build was waiting, another lane pushed cf40fe3 (docs/graph only: graph.svg, inject-via-prestep.json, m7.json) on top of aeb046d; ls-remote origin and github both report `cf40fe39b7b174af9837683375d1e8f2df4be25a	refs/heads/main`, and aeb046d is its ancestor.

### Main checkout build

- .llm/desktop-lock was held by `wf_36d1d690c7e1de90 real-model-run` (rewritten 10:33:10); waited until it was released (10:44:04), then took it as `wf_15841f21cb194d57 land` for the build and released it afterwards.
- First `npm run build` (land-main-build.log): exit 2. Cause: an untracked file src/memory/effect.ts (14168 bytes, created 10:26:36, not from this step; the same path exists in .worktrees/m5-rule-expected-effect, written 10:27:01) was not valid TypeScript for tsc. clean-dist had already removed the dist directories. The file was moved out of the main checkout to stray/src-memory-effect.ts-1026.txt in this directory (SHA-256 7D5A6E4A542F96FFD8A4D57811B61915AF518BF4BC83B0F7FFF092874D3D506C), not deleted.
- Second `npm run build` (land-main-build-2.log): exit 0, `build-info: dsh-glm-zcode, dsh-hourness cf40fe3 dirty`.
- build-info commit cf40fe3 equals main HEAD (cf40fe39, aeb046d plus the docs/graph-only commit above). dirty is true because of untracked task files left in the main checkout by other tasks (.llm-*.log), which DEVELOPMENT.md §1.1 allows.
- `git status --porcelain --untracked-files=no` before and after each build: empty.

### Ablation overlap

Branch ablation (b2b48f2) has not landed on main (not an ancestor of cf40fe3). This branch landed first, so ablation resolves the conflict in scripts/probe/run-probe.mjs and scripts/sandbox.mjs when it lands. The only file overlap met here was status-hub-3's run-probe.mjs change, merged by git without conflict.

### Desktop

Between 2031d21 and aeb046d nothing changed under src/, ui/ or packages/; the landing changes only scripts/probe/run-probe.mjs, scripts/sandbox.mjs, tests/probe-workspace.spec.ts and docs (DEVELOPMENT.md, FACTS.md, HANDOFF.md). No plugin row behavior changed, so no desktop restart is needed and none was done; the main checkout dist was rebuilt as above.

### Cleanup

- The worktree's node_modules junction was removed first (rmdir of the link, exit 0); the main checkout's node_modules is intact.
- `git worktree remove` of .worktrees/probe-run-dir-outside-repo: exit 0, directory gone.
- `git branch -d probe-run-dir-outside-repo`: deleted (was aeb046d3).
- `git push origin --delete probe-run-dir-outside-repo`: exit 0.
- No lock dir of this step remains. docs/graph was not written by this step.
