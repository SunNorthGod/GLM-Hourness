# guide-metrics-line landing report (wf_44088da95b2a2d84, step land)

## Merged main

- main HEAD after landing: 3ada48a444f2b1de9d9056fa9ac49bc74c54e9c0
- Feature commit: 436141f feat: guide page shows the metrics board's guideLine after the loops block
- Final merge on the branch: 3ada48a Merge remote-tracking branch 'origin/main' into guide-metrics-line, over origin/main b001609e2ef7644ff560cd3a8c9972a023867a18. No conflicts in any round.
- main moved six times while gates or the probe ran (31e0ee5, 14a541b, 125f889, 84382ae/c6c1bca, 596f31e, 31e853f, b001609). Each time origin/main was merged again and the full gate sequence was rerun on the new merge; only the last round (3ada48a) is the landed tree. Intermediate merges: 5510fbe, 4467bc5, c8009c2, 71c36f4, 9506d94, a059078.

## Gates on the merged tree 3ada48a

Run in the worktree, in order, one at a time; logs under this directory.

| gate | exit | result |
| --- | --- | --- |
| npm run build | 0 | build-info 3ada48a |
| npm run preflight | 0 | OK, 2 packages, 16 source directories, 20 rows composed |
| npm test | 0 | 27/27 pass, graph:smoke ok |
| node scripts/check-lint.mjs | 0 | eslint 73 suppressed, knip 18 in baseline, jscpd 1 clone (7 lines); no rise |
| npm run -s probe | 0 | 423/423 passed |

Probe lock: probe-lock-2 claimed at 07:57:06 with owner.txt first line `wf_44088da95b2a2d84 land`, heartbeat rewritten every 10 min, released after the run. In the first round probe-lock was taken over as stale from wf_f008ac0c87ec6943 (last rewrite 03:00:09, 30.9 min old, no matching probe process).

## Main checkout and remotes

- `git status --untracked-files=no` clean before the merge; main was at origin/main b001609 (not behind).
- `git merge --ff-only guide-metrics-line`: fast-forward b001609e..3ada48a4.
- git push origin main: exit 0 (b001609e..3ada48a4).
- git push github main: exit 0 on the first try (93effa41..3ada48a4).
- git ls-remote origin main: 3ada48a444f2b1de9d9056fa9ac49bc74c54e9c0
- git ls-remote github main: 3ada48a444f2b1de9d9056fa9ac49bc74c54e9c0
- Both equal local main HEAD.

## Main checkout rebuild

- `git status --untracked-files=no` clean before and after `npm run build` (exit 0).
- packages/glm/dist/build-info.json and packages/hourness/dist/build-info.json: commit 3ada48a, version 0.3.1, dirty true.
- dirty is true because scripts/build-info.mjs uses `git status --porcelain`, which counts untracked files; the main checkout holds untracked .agents/tasks/* run directories from other lanes. Tracked files are clean.

## Cleanup

- `git worktree remove .worktrees/guide-metrics-line`: exit 255, "Filename too long" on deep probe-run paths. The tree was then emptied; the worktree is no longer registered (`git worktree prune`, `git worktree list` has no guide-metrics-line). An empty directory .worktrees/guide-metrics-line remains because another process holds a handle on it; it has 0 items and can be removed once that handle closes.
- `git branch -d guide-metrics-line`: exit 0 (was 3ada48a4).
- `git push origin --delete guide-metrics-line`: exit 0; origin branch gone.
- docs/graph was not written in this step (brief rule); the graph update belongs to the caller.

## Desktop check (wf_44088da95b2a2d84, step desktop)

Scripts and logs: .agents/tasks/guide-metrics-line/desktop/.

### Lock

- .llm/desktop-lock created at 08:11:21 (UTC+8), owner.txt first line `wf_44088da95b2a2d84 desktop`; no previous lock existed. Rewritten by lock-refresh.ps1 (08:13:10), refresher stopped 08:16:01, lock removed; `Test-Path .llm/desktop-lock` False at 08:16:12.

### Restart

- Before: desktop main process PID 66280, command line `--remote-debugging-port=9333`, CDP on 9333 answered (dsh-desktop 0.2.1-rc.3, Electron 44.7.0), one page `dsh-app://app/`. No temporary session was created and nothing was typed or injected in any session.
- Other DeepSeek Harness processes present at the time (PIDs 81052, 73820, 57016) were a CLI probe run of another lane (parent node scripts/probe/run-probe.mjs, profile probe-full, worktree m4-reanchor-norms); they were not touched.
- Main checkout dist before start: packages/glm and packages/hourness build-info.json commit 3ada48a (main HEAD), version 0.3.1.
- Browser.close sent once at 08:13:43 over the browser websocket (socket closed code=1006, no reply, as expected).
- Watch (main process, userData lockfile, EnumWindows of the main process, read-only): 08:14:04 proc=False lock=False, no window. Exited within about 21 s; no quit confirmation dialog appeared.
- Cookie check on a copy of userData Network\Cookies: dsh-auth-* rows for host 127.0.0.1 = 4 (limit 50); nothing deleted, copy removed.
- Started 08:14:21 with the human's userData (no --user-data-dir, no DSH_HOME) and --remote-debugging-port=9333: main PID 22440, host PID 60884. CDP answered; page `dsh-app://app/`.

### Guide page as read over CDP (Runtime.evaluate, read-only)

The project-graph side panel showed the guide page. Sections in order:

1. 项目图：给你看项目，细节不用你管 (heading)
2. 一眼看懂
3. 你要做的只有回话
4. 让主 Agent 接手 (with 复制 /wish)
5. 规则板 (peak sentences present, 现在是：少做（出厂默认）, 去看规则板 ›)
6. 循环板 (去看循环板 ›)
7. 指标板: `同意的比例、问法的分布、按模型的比较都在「指标」板上，主 Agent 不转述`, button 去看指标板 ›
8. 去哪看进度 (second sentence present)

Then the 去首页 button. The 指标板 line text equals GUIDE_LINE in ui/src/metrics/board.ts and sits directly after the 循环板 block and before 去哪看进度.

### Errors after restart

- Page console (Runtime, Log, Network events collected after attach; console.log): repeated `WebSocket connection to 'ws://127.0.0.1:9230/ingest' failed` from the experimental inspector plugin (the reported URL is the combined plugin bundle) and one `changes.summary` 404 for an old session. Both are the known noise listed in docs/HANDOFF.md; no entry names dsh-glm-zcode or dsh-hourness, no exceptions.
- Host stderr: only the `DevTools listening on ws://127.0.0.1:9333/...` line. Host stdout: 0 lines naming our packages.
- No crash logs written since 08:14.
- Result: no new errors from dsh-glm-zcode or dsh-hourness.
