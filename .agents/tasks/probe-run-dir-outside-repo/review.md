# Review: probe-run-dir-outside-repo

- Branch: probe-run-dir-outside-repo, commits c4ec40ae, acc3661a, f13596ba on origin/main 125f8893.
- Read: `git diff origin/main...HEAD` (6 files), the three commit messages, report.md, the probe/gate logs listed there, graph node probe-run-dir-outside-repo (acceptance), `unlinkProfile`/`generateProfile` in scripts/sandbox.mjs. Suites not rerun.
- Verdict: APPROVED. No blocker in the three classes (unmet acceptance item, irreversible loss, missing failure plan).

## Acceptance

| Item | Evidence | Met |
| --- | --- | --- |
| Run directory under the system temp dir, not in the repo tree | sandbox.mjs `openRunDir` = `mkdtempSync(join(tmpdir(), 'glm-hourness-probe-<stamp>-'))`; run-probe.mjs uses it; probe-1..3 logs show paths under `AppData\Local\Temp\glm-hourness-probe-*`; spec asserts direct child of tmpdir, outside `repo`, no repository above | yes |
| Each scenario still its own git repo | `scenarioWorkspace(dir, cwd)` unchanged; spec still pins `cwd: workspace` and the single `sandboxCommand(` call | yes |
| Failed runs keep the directory and print its path | `process.on('exit')` prints `probe: run artifacts kept in <runDir>` for any non-zero code while the dir exists; removal only after `failed === 0` and the profile guard; profile guards that exit before `openRunDir` create nothing; probe-r1-1.log and probe-r2-1.log show the line; five failed-run dirs remain under %TEMP% | yes |
| Successful runs clean up | `removeRunDir(runDir)` before `process.exit(0)`; report: the three passing runs' dirs are gone | yes |
| Holder identified or stated unknown | report.md Part 1 and FACTS.md row: not identified; Defender off, Search index has no rows, Restart Manager finds no holder; Kiro watcher/indexer recorded as inference | yes |
| glm Edit and Read green in 3 consecutive full runs | probe-1/2/3.log on f13596b: exit 0, 422/422, `glm execution: Edit alias ...` and `Read alias shows the edited file` PASS in each; status file shows the three runs back to back under one lock | yes |
| DEVELOPMENT.md and FACTS.md in the same batch as behavior | c4ec40a changes DEVELOPMENT §3 + §7 row, FACTS §3 row, HANDOFF `.llm/` line together with the code; acc3661/f13596b update §3 with their TEMP change | yes |
| Scripts reading probe-runs updated | no tracked script or test references `.llm/probe-runs` (spot-checked with git grep; only historical task notes) | yes |
| Gates | f13596b: build 0, preflight 0, check-lint 0 (eslint 73 / knip 18 / jscpd 1, no rise), npm test 0 on rerun (3187/3187, graph:smoke ok) | yes |
| No BOM, no persona words | first bytes of all six changed files are ASCII; commit messages and docs are plain | yes |
| Overlap with ablation noted | commit c4ec40a and report.md | yes |

## Irreversible loss

`removeRunDir` refuses anything that is not a direct child of the temp root with the `glm-hourness-probe-` prefix, unlinks every symlink/junction (lstat, no follow) before `rmSync`, and the spec shows a junction target keeps its files and that other and nested directories are refused. The checkout cannot be reached through the deletion. Failed runs are never deleted.

## Non-blocking

- "Change on main" (second acceptance item) is the land step's job; the branch is pushed to origin only.
- npm test run 1 on f13596b failed once in an untouched loops concurrent-append test (sequence 1 given twice); rerun green. Pre-existing intermittent race, worth its own graph node.
- Failed-run directories accumulate under %TEMP% by design; nothing prunes them. The five from c4ec40a/acc3661 can be deleted by hand once no longer needed.
- Range wording differs slightly: FACTS.md says 6–19 of 500 (includes land.md's 6–10), DEVELOPMENT §7 says 9–19 (this task's loops only). Both are true for their sources.
- The final summary line no longer names the run directory on success; it is deleted then, so this is consistent.
- Conflict with branch ablation in run-probe.mjs and sandbox.mjs remains for whoever lands second.
