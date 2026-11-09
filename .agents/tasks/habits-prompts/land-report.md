# habits-prompts land report

## 1. Merge

- Branch head before merge: 4598fa7. origin/main: bb0bed3 (10 commits ahead, graph-only commits).
- Merged origin/main bb0bed3 into habits-prompts: aed6d2a, no conflicts (graph-only files).
- origin/main moved to 2d166ea (graph-only) during the gates; merged again: 7a66a3d, no conflicts.
- origin/main moved to 6d6035e (graph-only); merged again: 5b42f28, no conflicts. Non-graph tree of 5b42f28 equals 7a66a3d (empty diff outside docs/graph).
- None of the merges touched TALK_GUIDE, tests/design-mode.spec.ts, src/graph/reopen.ts, src/graph/tools.ts, CHARTER.md or docs/ORCHESTRATION.md on the main side.

## 2. Gates

- aed6d2a: build 0, preflight 0, test 0, probe 0 (420/420, lock .llm/probe-lock), lint 0 (eslint 73 / knip 18 / jscpd 1).
- 7a66a3d: build 0, preflight 0, test 0 (the PowerShell wrapper reported 1 from a stderr line; rerun through cmd: exit 0, every suite fail 0), probe 0 (420/420, lock .llm/probe-lock-2 after .llm/probe-lock was held by another step), lint 0 (eslint 73 / knip 18 / jscpd 1).
- 5b42f28: graph-only over 7a66a3d; lint rerun 0 (eslint 73 / knip 18 / jscpd 1).
- Probe locks removed after use.

## 3. Push

- habits-prompts pushed to origin at aed6d2a, then 5b42f28.
- main fast-forwarded to 5b42f28 and pushed to origin and github (github first try).
- Later the orchestrator pushed 51af510 (graph-only) on top; github failed to connect four times, then pushed. ls-remote origin main and github main: 51af5106f9f94f39200071176acccccfe7ccf71e, equal to local main. 5b42f28 is an ancestor of it.

## 4. Desktop restart

- 01:14:27 took .llm/desktop-lock; main checkout dist rebuilt at 3cc7408 (contains 5b42f28), build 0.
- 01:15:25 Browser.close sent on 9333 (socket closed 1006). Polled every 30 s; all desktop processes gone by 01:27:53. No process killed.
- 01:28 and 02:03 starts (start part of m1-l4/restart.ps1) both failed: `desktop welcome: Web authentication failed`. Not started again after the second failure.
- Cause and proposed fix: desktop-start-failure.md in this directory. Summary: 71 accumulated `dsh-auth-*` cookies for 127.0.0.1 in the desktop cookie jar make a Cookie header over Node's 16384-byte limit; the Host answers 431. Waiting for approval to clear those cookies before the next start.
- Approved by the human; 02:30 backed up the cookie database to `cookies-backup-2026-11-06/` and deleted the 71 `127.0.0.1` `dsh-auth-*` rows; started 02:31 with `DSH_HOME` unset.
- Result: no new crash report, stderr like before (DevTools line only), 9333 answers, dsh-glm-zcode 5/5 running, dsh-hourness 13 running + 2 disabled in the profile (lessons, transcript), 0 console errors naming our packages. Loaded dist build-info 3cc7408, code-identical to main HEAD 086e54e outside docs/graph. Details in desktop-start-failure.md.
- .llm/desktop-lock released.

## 5. Cleanup

- Worktree .worktrees/habits-prompts removed (git worktree remove hit a long path; the remaining files were deleted with long-path support, then the worktree pruned). Branch habits-prompts deleted locally and on origin.
