# glm-context-window Check B

Workflow: wf_4f1c79fb27ec66d5
Started: 2026-11-06 00:08
Repo HEAD at start: 9bf7739 (main = origin/main = github/main); `git status --porcelain --untracked-files=no` empty.
Prior record: desktop-check.md in this directory (Check A passed on build b923210; two Check B attempts on an isolated instance, port 9339, both exited by themselves).

Check B: with the GLM row's `contextWindow` set to another legal value, the value DSH sees follows it; with an illegal value the row warns, falls back to 512000 and reports it in row health.

## Log

- 00:08 report file created.
- 00:08 process state (read only): human's desktop main 39012 (parent 81100, started 22:11:14, `--remote-debugging-port=9333`, default userData) with gpu 52280, network 76320, renderer 67180, host 14640. No process carries `glm-hourness-cw-l4`.

## Step 1: why the isolated instance exits (read only, 00:08–00:37)

Material read: `.llm/glm-cw-l4/` (`launch.ps1`, `close.mjs`, `dsh-out-1/2.txt`, `dsh-err-1/2.txt`), the isolated `user-data-dir` (file times, `Local Storage`, `Session Storage`, `Network`, `logs/`, `desktop/settings.json`, `Preferences`), the isolated `dsh-home` (file times, profile files, key names of `.credentials.yaml`), the human's userData marker files (names and times only), and `reference/deepseek-harness/apps/desktop/src/` (`single-instance.ts`, `main.ts`, `welcome-api.ts`, `welcome-backend.ts`, `welcome-window.ts`, `quit-confirmation.ts`, `background-notice.ts`, `host-process.ts`, `fatal-recovery.ts`).

Ruled out:

- Single-instance rejection. `claimDesktopSingleInstance` (`single-instance.ts`) quits only when `requestSingleInstanceLock()` fails; the lock is per userData and the isolated instance has its own `--user-data-dir`. Both runs got past it: DevTools listened on 9339, the host wrote `cordis.yml`, the app document wrote `Local Storage` keys (`dsh.conversation.session-6b594ac9-…`, `dsh.sessions.current`, `glm-hourness.onboarding.glm.seen.v1` at 23:55:28 in run 2).
- Fatal startup error or host crash. Those paths go through `reportFatal` / `DesktopFatalRecovery` (crash report under `logs/`, a dialog) or `DesktopHostProcess` failure (`dsh desktop host exited with …` / `stopped` on the shell's console). The isolated `user-data-dir\logs` is empty, stderr has only the DevTools line in both runs, stdout has only the updater and `dsh web` lines.
- Quit through the task confirmation with an inspection failure: that path prints `desktop quit: task inspection unavailable`; not on stderr.
- An update install: the updater only reports `Found version 0.2.2-rc.1`; the exe is still 0.2.1-rc.3 and no install line is printed.
- Hide-to-tray of the main window: that keeps the process alive (main.ts `window.on('close')` → `hideMainWindow`, first time behind `DesktopBackgroundNotice`); the processes were gone, and the isolated userData has no `background-close-confirmed` marker.
- A close from this workflow: neither attempt sent anything to 9339 before the exit, and no process was stopped (desktop-check.md).

Most likely cause (inferred from source and files; the window itself was never observed):

- `main.ts` `openInitialWindow` reads the welcome state and, when `needsWelcome({loggedIn, hasApiKey})` is true (`welcome-api.ts:73`: neither a DeepSeek account login nor a configured DeepSeek API key), opens the native welcome window (`welcome-window.ts`, 600x700, `window.show()`) and hides the main window. `loggedIn` is `account.state().status === 'credential-stored'`; `hasApiKey` is a configured credential for the `llm-deepseek` `apiKeyEnv` refs (`welcome-backend.ts:117-118`).
- The isolated DSH home's `.credentials.yaml` has one record, `client-connection/browser-session`; the human's has `client-connection/browser-session`, `deepseek-account-platform/device` and `deepseek-account-platform/default`. No `DEEPSEEK*` variable in the process, user or machine environment. So the isolated instance shows the welcome window at every start; its skip button (`skip: enterWorkspace`) is per launch only.
- Closing the welcome window before the workspace is entered runs `app.quit()` on Windows (`main.ts`, the welcome window's `closed` handler: "elsewhere the close quits"). `before-quit` then asks `quitConfirmation.confirm()`; with no host tasks the prompt is `undefined` and the quit goes ahead with no dialog and nothing on stderr. The shell shutdown flushes cookies, which matches the last writes in both runs (`Network/Cookies` 23:55:42.65 in run 2; `Network`, `DIPS` 23:10:25 in run 1).
- This matches both signatures (no crash log, no quit line, no close from this workflow). What closed the welcome window was not found; the window takes focus on the human's screen, so a close by hand is the plausible reading, not verified.

Not reconciled: the panel #310 isolated instance (2026-11-04, `.worktrees/panel/.llm/panel-310-l4`, port 9336) had the same credential shape (only `client-connection/browser-session`) and ran about an hour. Its scripts contain no welcome or skip handling, so how it got past the welcome window (skipped by hand, or another reason) is unknown.

Fix for an isolated desktop, if wanted later: drive the welcome window's skip over CDP (it is a separate page target) right after start, or give the isolated home a DeepSeek login. Not used here; step 2 uses the headless sandbox, which has no window.

## Step 2: Check B in the headless sandbox (01:15–01:20)

Path: headless sandbox (DEVELOPMENT.md §3), not the isolated desktop. Lock `.llm/probe-lock-2` taken 01:15:52 (owner `wf_4f1c79fb27ec66d5 check-b (glm-context-window headless sandbox, two boots)`; `.llm/probe-lock` was held by another run), released 01:28:02.

Setup (all under `%TEMP%\glm-cw-checkb-20261106-011552`, one directory per boot):

- `scripts/sandbox.mjs` `generateProfile` wrote a temp DSH home with one profile `checkb`: bundles `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, `dsh-glm-zcode` (junction to the main checkout `packages/glm`). Only the GLM package; no orchestration rows. `~/.dsh` and the human's profile were not read or written.
- Overlay patch: `agent-default-model` → `glm-probe` / `glm-5.3` (the probe provider `scripts/probe/probe-llm.mjs` answers; no model request leaves the machine); `glm-hourness/glm-llm` `disabled: false`, `config: { home: <boot>/glm-home, contextWindow: <value> }`; `glm-hourness/glm-login` `home` the same empty directory (no credential exists there, none was copied); `probe-net.mjs` network recorder; a one-off observer row in the temp directory. Patches kept in `check-b-evidence/{valid,invalid}-checkb.patch.yml`.
- Observer row: on the first `agent/created` it calls `ctx.llm.resolveModelInfo('glm-zcode', model)` for `glm-5.3` and `glm-5.3-flash` (the llm service method that returns the adapter's declared `context.contextWindow`) and reads `glmHournessHealth/glm-llm` `activation()`. The probe script's single step (`status: true`) runs the real `/glm-status` handler in the session and records its text.
- One headless boot per value through `sandboxCommand` (Electron node mode, `bin.js --profile checkb --patch …`, `DSH_HOME` = the temp home), task "Reply done.". `unlinkProfile` removed the junction after each boot (checked: no reparse point left).

Build loaded: the main checkout dist as it was at 01:17, rebuilt by another step at 01:14:58–01:15:06, `build-info.json` `{"version":"0.3.1","commit":"3cc7408","dirty":true}`. `c452b17` is an ancestor of `3cc7408` (exit 0); `git diff b923210..3cc7408` and `3cc7408..38d3a9d` (HEAD at 01:18) on `src/glm-llm`, `src/shared`, `packages/glm` are empty, so this is the same glm-llm code as Check A. `dist/glm-llm/index.js` has `contextWindowOf` (lines 47, 74, 80).

### Legal value 256000: passed

- Boot 01:17:16, exit 0, 994 ms. stdout `done`; stderr empty (no warn).
- Observer (`check-b-evidence/valid-observer.jsonl`): providers `deepseek-official, deepseek-account, glm-probe, glm-zcode`; `resolveModelInfo` `glm-5.3` `contextWindow: 256000`, `glm-5.3-flash` `contextWindow: 256000`; activation `{"state":"active","reason":"已注册路由 glm-zcode（套餐 coding-plan，凭证目录 C:/Users/29596/AppData/Local/Temp/glm-cw-checkb-20261106-011552/valid/glm-home，上下文窗口 256000）"}`.
- `/glm-status` row health (`check-b-evidence/valid-glm-status.txt`): `| dsh-glm-zcode | glm-llm | 已加载，本会话未触发 | 已注册路由 glm-zcode（套餐 coding-plan，凭证目录 …/valid/glm-home，上下文窗口 256000） |`.
- Network log: only the recorder's own canary line (`http://127.0.0.1:65535/probe-net-canary`).

### Illegal value 50000: passed

- Boot 01:18:09, exit 0, 1066 ms. stdout `done`. The Loader did not refuse the row (the `Schema.any()` member let 50000 through to `apply`).
- Warn on stderr (`check-b-evidence/invalid-stderr.txt`), the only line: `dsh-glm-hourness/glm-llm: 上下文窗口配置 50000 不是 128000 到 1000000 之间的整数，按缺省 512000`.
- Observer (`check-b-evidence/invalid-observer.jsonl`): `resolveModelInfo` `glm-5.3` and `glm-5.3-flash` both `contextWindow: 512000` (fallback); activation `{"state":"degraded","reason":"已注册路由 glm-zcode（套餐 coding-plan，凭证目录 …/invalid/glm-home，上下文窗口 512000）；上下文窗口配置 50000 不是 128000 到 1000000 之间的整数，按缺省 512000"}`.
- `/glm-status` row health (`check-b-evidence/invalid-glm-status.txt`): `| dsh-glm-zcode | glm-llm | 部分生效 | 已注册路由 glm-zcode（套餐 coding-plan，凭证目录 …/invalid/glm-home，上下文窗口 512000）；上下文窗口配置 50000 不是 128000 到 1000000 之间的整数，按缺省 512000 |`. Other rows: glm-login 生效 (额度：读不到（not-logged-in）), glm-prompt 生效, glm-compact 已加载; dsh-hourness 未加载 (not installed in this profile).
- Network log: only the canary line.

Check B result: passed on the real DSH host runtime (headless, rc.3 install). The declared context window DSH's llm service resolves follows a legal `contextWindow` (256000); an out-of-range value (50000) warns once, falls back to 512000, and the row reports `部分生效` with the reason in row health. Not covered by this path: the desktop composer's context popover (the Check A instance showed "~26.5K / 512K" for the default); that UI reads the same resolved model info.

## Step 3: cleanup (01:28)

- Processes: no process referenced the temp directory or `glm-cw-l4` at 01:23 and 01:28; both boots had exited (spawnSync returned). No process was stopped by this step.
- Removed `%TEMP%\glm-cw-checkb-20261106-011552` (after checking no reparse point under it). Evidence copied first to `check-b-evidence/` in this directory (patches, observer, `/glm-status` text, stdout, stderr, net logs; no credential exists in any of them: the GLM home was empty).
- Removed the isolated desktop's `.llm/glm-cw-l4/user-data-dir` (84 files) and `.llm/glm-cw-l4/dsh-home` (17 files; no reparse point, its junction had been unlinked by the earlier step; no `lockfile`, no process). The scripts in `.llm/glm-cw-l4/` (`launch.ps1`, `close.mjs`, …, ignored by `.gitignore`) stay.
- `.llm/probe-lock-2` deleted 01:28:02 (owner line was this step's).
- No isolated desktop was started, so no Browser.close and no quit dialog arose; `#32770` windows titled DeepSeek Harness at 01:26: 0.
- Repo: no code change, no commit, `docs/graph` not written; `git status --porcelain --untracked-files=no` empty at 01:18.
- Human profile unchanged: `~/.dsh/profiles/desktop/cordis.patch.yml` 610FB115…58FF, `package.json` CF7D775A…CC85 (01:18, same as Check A); `~/.dsh/glm-hourness/audit/usage.jsonl` unchanged (DBE6E4AD…D8D6, 18:00:25); `~/.dsh/profiles` names unchanged (`desktop, glmsandbox, headless, node_modules`).

## The human's desktop (39012): not touched by this step, but no longer running

- 01:14:24: 39012 and host 14640 running. 01:18:59: gone; 9333 does not answer; no `lockfile` in `%APPDATA%\@deepseek-ai\dsh-desktop`; no new crash log (newest still 2026-11-03T16-46-59 host). Still not running at 01:28:38.
- Its stderr (redirected to `dsh-err-3.txt` in this directory since the 22:11 start) got its last line at 01:15:25.758 (`CompositorAnimationObserver is active for too long (7497.85s)`, a Chromium UI log line); the last userData writes are 01:15:25.77–01:15:25.80 (caches, `DIPS`), the same shutdown flush pattern as a normal quit.
- Timeline around it (file times, read only): `.llm/desktop-lock` taken by `wf_7bd410e5bb88654f land` (habits-prompts land step) at 01:14:27; its `lock-refresh.ps1` 01:14:52; main checkout dist rebuilt 01:14:58–01:15:06 (build-info 3cc7408); desktop exit 01:15:25. This step's first action that started anything was the probe-lock-2 take at 01:15:52 and the first boot at 01:17:16, both after the exit; the headless boots used their own `DSH_HOME` and touched neither 9333 nor 39012.
- Reading (inferred, not traced): the habits-prompts land step closed the desktop under its desktop lock as part of its L4. That step still holds the lock (owner rewritten 01:25:23) and has not restarted the desktop yet. This step did not restart it (the lock is not this step's).

- 02:03:20 recheck: still no desktop main process (only probe/headless runs); `.llm/desktop-lock` still held by `wf_7bd410e5bb88654f land`; `.llm/probe-lock-2` absent; `git status --porcelain --untracked-files=no` empty. Restarting the human's desktop is left to the lock holder or the orchestrator.

## Summary

- Isolated exits: most likely the native welcome window (no DeepSeek login or key in the fresh DSH home) being closed, which quits the shell silently on Windows; inferred from source and files, the close itself not observed. Ruled out: single-instance lock, fatal error or host crash, quit with inspection failure, update install, hide-to-tray, a close from this workflow.
- Path: headless sandbox (DEVELOPMENT.md §3), real rc.3 host runtime, GLM package only, probe provider, no credentials.
- Legal 256000: passed (declared `contextWindow` 256000 for both models, row `active`, reason names 256000, no warn).
- Illegal 50000: passed (one warn on stderr, declared 512000, row `degraded` / `部分生效` with the fallback reason in row health).
- Cleanup: done (temp directory, isolated user-data-dir and dsh-home removed, probe-lock-2 released, no process stopped).
- Human's desktop: not touched by this step; it exited at 01:15:25 under the habits-prompts land step's desktop lock, before this step started anything, and is not running at 02:03.
- Graph: not written by this step (constraint); the orchestrator records the result on `glm-context-window`.

## Facts for FACTS.md

- Desktop shell 0.2.1-rc.3 (`apps/desktop/src/main.ts` `openInitialWindow`, `welcome-api.ts:73` `needsWelcome`, `welcome-backend.ts:117-118`): when the DSH home has neither a DeepSeek account login (`account.state().status === 'credential-stored'`) nor a configured `llm-deepseek` API key, every start opens a native welcome window (600x700, shown and focused) and hides the main window; skip is per launch. On Windows, closing the welcome window before the workspace is entered runs `app.quit()`; with no host tasks the quit has no dialog, no crash report and no console line. An isolated `--user-data-dir` + fresh `DSH_HOME` instance is in this state by default. 〔source read 2026-11-06; matches the two isolated exits of 2026-11-05 23:06 and 23:55, the close itself not observed〕
- Headless sandbox (rc.3, Electron node mode): an overlay row with `inject: [llm]` can call `ctx.llm.resolveModelInfo('<route>', '<model>')` in an `agent/created` listener and gets the adapter's declared `context.contextWindow`; this is a host-level way to read the context window DSH sees without the desktop UI. 〔observed 2026-11-06, Check B: 256000 and 512000〕
- Loader with a `Schema.union([Schema.natural().min().max(), Schema.any()])` config field: an out-of-range value reaches the row's `apply` unchanged on the real host (the row is not refused). 〔observed 2026-11-06, Check B, `contextWindow: 50000`; L2 had pinned it on the schema only〕
