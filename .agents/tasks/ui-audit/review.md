# UI audit fixes, review (graph task m8-ui-audit), pass 2

Workflow `wf_72dc4e25196127e4`. Scope of this pass: the iteration-2 commits 2240b70 and ef536a3, the R-04 screenshot, the findings.md and fix-log.md updates, and the paths those fixes touch. The 16 iteration-1 commits were reviewed in pass 1 (appendix below); their resolved points are not reopened. The orchestrator's docs(graph) commits (c79270d, be9d6ed, 8f1a4c6) are not under review. Read-only: no build, preflight, test or probe re-run, no desktop use.

Verdict: APPROVED (no blocking findings; non-blocking notes below).

## Evidence read

- `git log`: HEAD 8f1a4c6; 2240b70 and ef536a3 sit on c79270d and are pushed (`origin/main` = HEAD). `git status --porcelain`: `?? .kiro/` only, so the stray root `fix-log.md` from the recorded incident is gone. `.agents/` and `ui/client.js` are gitignored (`.gitignore:7`, `:10`) and appear in no commit.
- `git diff --stat c79270d ef536a3`: 8 files, all under `ui/src/`, `tests/`, `docs/DESIGN.md`, `docs/ORCHESTRATION.md`. Nothing under `src/`, `docs/graph/`, `.worktrees/` or `.agents/`. The checker files (`eslint-suppressions.json`, `knip-baseline.json`, `.jscpd-baseline.json`, `.jscpd.json`, `knip.jsonc`) have an empty diff.
- Gate outputs on disk, written 13:41:53 to 13:42:19, before ef536a3 (13:42:30): `build-out.txt` ends `build-ui: wrote ui/client.js` after both `tsc` runs; `preflight-out.txt` reads `preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)`; `test-out.txt` has 39 test files, each `# fail 0`, 564 tests in total (sum of the `# tests` lines), no `not ok` line, `eslint: ok (250 suppressed)`, `knip: ok (21 in the baseline)`, `jscpd: ok (2 clone(s) in the baseline, 16 duplicated lines)`, gitleaks no leaks, `graph:smoke: ok`. The two new or changed tests report `ok`. Baselines stay at 250 / 21 / 2, below the 256 / 21 / 2 ceiling.
- Host code: iteration 2 changes nothing under `src/`. The pass-1 probe result (94/94, `.llm/probe-runs/2026-10-29T03-45-50-008Z`) still covers the host code.
- `findings.md`: 47 finding headings, 47 `- Resolution:` lines, none missing. F-04, F-34, F-29 and F-19 name the iteration-2 commits or screenshot. V-01 now quotes the user's choice (question-18, option A: deferred until split lands), which closes pass-1 note N-03.
- Commit messages of 2240b70 and ef536a3: UTF-8, Chinese text intact, gate results recorded in the body.

## Pass-1 findings

### R-01 The pill dialog drops the last login error: resolved (2240b70)

- `ui/src/channel-model.ts` parseStatus reads `上次登录错误：…` from the not-logged reply into `loginError`. `ui/src/channel.js` shows it as a `上次登录错误` detail row with class `glmh-err` (`--dsw-alias-state-error-primary`), so the label carries the meaning and the colour only adds to it.
- `restOf` keeps every non-blank line of a reply with a health table that is neither the table, its heading, nor a credential or login-error line that parsed. The dialog renders these lines with `OutputLines` above `HealthList`, so an unread credential line or an extra error line is no longer dropped.
- Checked against the producer, `src/glm-llm/login-row.ts:41-43`: the error line is appended only to the not-logged text, which matches the parser's branch. The first OAuth poll runs before any sleep (`src/glm-llm/auth/oauth.ts:147-150`) and the test's 404 is fatal, so the test's wait loop does not depend on timing.

### R-02 The unreadable-file banner points to an absent control: resolved (ef536a3)

- `ui/src/graph/Panel.tsx` Problems takes an optional `retry`. The unreadable banner passes `() => source.retry()` and shows its own 重新读取 button (正在读… and disabled while reading) next to the 还有 N 处 toggle. Its summary no longer points to the header. The validation banner gets no retry, which is correct: re-reading does not fix a validation error.
- `source.retry()` (`ui/src/graph/source.ts:76-80`) runs a full `reload()` and starts the feed only when it is not watching. A retry while live therefore re-reads every file and publishes with `live` still true. The new test asserts this after a second refusal.
- The button calls `void retry().finally(...)`, the same pattern as the header and empty-state buttons, so this adds no new unhandled path.

### R-03 No L2 for the pill parsers; fake error code: resolved (2240b70, ef536a3)

- The parsers moved to `ui/src/channel-model.ts`, which `tsc -p ui/tsconfig.json` checks (strict, `exactOptionalPropertyTypes`, no parameter properties) and esbuild bundles. The desktop restart recorded in fix-log.md confirmed that the served bundle contains `.glmh-details dd.glmh-err`.
- `tests/health.spec.ts` runs the real login row and the real `renderHealthTable` for four states: not logged in, 登录不完整, logged in with a located key, and a failed background poll. It asserts the fields, all 11 `HEALTH_ROWS` in order, an escaped `|` in a reason, and empty `restOf`. It also checks the three `unknown` reasons and that an unread credential line stays. The only injected dependencies are `fetchImpl` (network) and a temp directory (file system). No DSH contract is faked.
- `tests/graph-panel-model.spec.ts` now refuses with `workspace-file/too-large` and the message shape `"<path>" exceeds the <n> byte full-file cap`. This matches rc.3 `dsh-api-workspace-files/lib/index.js:464` and the source `reference/deepseek-harness/packages/api/workspace-files/src/index.ts:276`.

### R-04 No after screenshot of the final redo note: resolved

- `after-panel-detail-task-done-run.png` (13:47) shows m2-9-l4 with the crumb starting 目标 and the 让 agent 干活 part reading 已完成 above the button 按现在的验收条件重做. The before image (`before-panel-detail-task-done-1.png`) shows 已完成，可以按现在的验收条件重做 above 改了验收条件后重做. fix-log.md's iteration-2 screenshot table lists the pair.
- `after-pill-glm-dialog-2.png` and its `.json` show the post-fix dialog on the logged-in reply: the dialog is portaled to body, sits inside the 1280 x 822 viewport and holds focus; the fields and the 11 health rows render, and no leftover output box or error row appears, as expected for that state.

## Non-blocking notes

- N-01 (from pass 1, still open): `knip.jsonc` gained `react-dom` in `ignoreDependencies` in 67dba8e. This review treats it as the existing module-table rule, but DEVELOPMENT.md §10 asks for user approval when a checker configuration is relaxed. The orchestrator should mention it to the user.
- N-02, N-04, N-05 (from pass 1): unchanged and out of this iteration's scope. N-02: the four iteration-1 commit messages show `?` and are pushed. N-04: `noGraphText` with an absolute dir. N-05: the `src/glm-llm/login-row.ts:76` comment still says the settings page parses the credential line.
- N-06: two iteration-2 states are covered at L2 only, because both need a write: the 上次登录错误 row and the unreadable-file banner's 重新读取. The final walkthrough can observe them only if it can create such a state safely.

## Graph sync

This step is read-only and reports through review.json only. Recording the review result on docs/graph is left to the orchestrator, which owns docs/graph commits.

---

## Appendix: pass 1 (verbatim)

# UI audit fixes, review (graph task m8-ui-audit), pass 1

Workflow `wf_72dc4e25196127e4`. Scope: the 16 commits listed in `fix-log.md` (e6fd0f2 .. fe550ff) on main; the m1-parity merge commits and the orchestrator's docs(graph) commits are not under review. Read-only: no build, preflight or test re-run, no desktop use.

Verdict: CHANGES_REQUESTED (4 blocking findings, 5 non-blocking notes).

## Evidence read

- `findings.md`: all 41 F-NN and 6 V-NN findings end with a `Resolution:` line (39 fixed, F-18 partial as decided, 7 not fixed with reasons, V-01 held). The 8 `ui/src/channel.js` findings (F-02, F-03, F-04, F-05, F-18, F-33, F-34, F-40) and V-03 carry an In-flux line re-checked on 593a6be against the merged file; `git diff a9f12e1 593a6be` confirms channel.js was unchanged by the merge tail.
- `fix-log.md`: commit table, gate exit codes per commit (build 0, preflight 0, test 0), test counts 556 to 563, checker counts. Recorded outputs: `test-out.txt` (12:33) shows `eslint: ok (250 suppressed)`, `knip: ok (21 in the baseline)`, `jscpd: ok (2 clone(s) in the baseline, 16 duplicated lines)`, gitleaks no leaks, no `not ok` and no `# fail` above 0. `probe-out.txt` ends `probe: 94/94 passed` (artifacts `.llm/probe-runs/2026-10-29T03-45-50-008Z`), covering the host-code commits 4c1cfa1 and 886e38b, including `/graph-run` registration without a warning.
- Baselines: `git diff --stat 593a6be fe550ff` on `eslint-suppressions.json`, `knip-baseline.json`, `.jscpd-baseline.json`, `.jscpd.json` is empty. 250 / 21 / 2 is at or below the stated ceiling (256 / 21 / 2).
- Commits: each `git show` read in full. Every commit is one concern with its docs; none touches `docs/graph/`, `.worktrees/`, `.agents/tasks/split/` or `.agents/tasks/zcode-parity/`; `ui/client.js` is gitignored and appears in no commit. No TS parameter properties; removed code is deleted (`refusalText`, the old `ProposalCard`/`QuestionCard`, the local `tokensText`, the 5 s poll); `revOf` is now module-private; no `apply()` changed except string literals in `src/ui/index.ts`.
- DSH contract reads: `useAnchoredPosition`, `useDismissOnOutsidePointer`, `writeClipboard` exist in `reference/deepseek-harness/packages/client/ui-primitives` (package version 0.2.1-rc.3) with the declared shapes; `--dsw-alias-state-success-primary` / `-warn-primary` are used by rc.3 client CSS; rc.3 `dsh-commands/lib/types/index.js:124-151` accepts `input.hint` as a non-empty string; `react-dom` is in `scripts/ui-modules.mjs`.
- Screenshots opened: before/after pairs for 正在做, agent 定的, the m2-9-l4 detail (3 after shots), the M1 detail focus, the scrolled-list detail (Q-01 doing and agent card), graph resized, graph filter 只看等你的, graph keyboard focus, light 正在做 and agent 定的, settings, pill dialog, plugin manager, slash menu (`/` and `/g`), plus `work-window-check.png`. Byte-identical after files were hashed: `after-panel-doing-1` = `after-narrow-panel-doing` = `after-panel-live-idle` (documented as a copy); `after-narrow-panel-graph-resized` = `-remounted` = `after-panel-graph-reduced-motion` = `work-panel-graph` (separate captures of a deterministic still view; resized equal to remounted is the F-17 evidence).

## What holds

- Status and progress semantics: the progress bar and 工作完成 count only work children (tasks, features), decided questions stay in 待决已定 (`ui/src/graph/model.ts` progressOf, unchanged rule, now shared through `common.tsx` NodeRow); the 现场 note counts tasks in progress, not features (F-31); breathing dots and pulsing halos now appear only where a running agent stands (V-04, `agents.ts` runningOn), matching 现场 · 0 个在跑 in the screenshots; history lines state the resulting status (改为「完成」).
- F-01/F-26: the detail sits on a non-scrolling stage; screenshots show it fully visible from a list scrolled to the end and from agent 定的; list inert while open; Escape and back stack; focus returns to the opener.
- F-08/F-22: rows and graph nodes are buttons in the tab order with names; the focus stroke shows on graph nodes after fe550ff; counts carry screen-reader text.
- F-17/F-16/F-30/V-05: the graph view re-places on size and filter changes until the user pans or zooms; banner and legend are strips outside the canvas; the empty filter states its emptiness.
- F-06/F-19/F-20/V-02: human refusal lines in Chinese with the engine code, complete over `ErrorCode` by type; redo label and earlier-label compatibility tested; Chinese command descriptions and the `/graph-run` hint shown in the `/g` screenshot; provider group renamed in one constant, quoted by the settings page.
- F-02/F-03/F-05/F-18 (partial)/F-34: no poll, one automatic read per app run, shared status with 读取于; GLM label whole at 1280 px; portal, measured clamp, focus in and out; 登出 confirms; state tokens exist in rc.3.
- F-33/V-03/F-35: settings on DSH's scale with the pill named; plugin manager shows both packages with title, description and icon.

## Blocking findings

### R-01 The pill dialog drops the last login error (medium)

- File: `ui/src/channel.js:294` (with `:272`, `:155-161`).
- Source: when `/glm-status` output contains the health table, the dialog renders `h(HealthList, …)` instead of the reply text; only `parseStatus` survives from the part above the table, and it extracts plan, key, account, JWT age and the 登录不完整 reason. The not-logged credential text is built at `src/glm-llm/login-row.ts:41` as `glm-zcode：未登录（套餐 …）。运行 /glm-login 开始登录` followed by `\n上次登录错误：${login.state.error}` when the background OAuth poll failed (`src/glm-llm/zcode.ts:157` sets `state.error`).
- Path: 登录 in the pill, the browser authorization fails or the 5-minute link expires, the human clicks 刷新状态 as the new note tells them to. Before 67dba8e the dialog printed the whole reply, so the error was visible; now the dialog shows 未登录, no 原因, and the health list. The only remaining trace is inside the collapsed command card in the conversation.
- Consequence: the one error state of the login flow is silent in the surface built for it; the human retries without knowing why login failed. This contradicts F-34's intent (unknown or failed states name the reason).
- Required change: keep every non-table line of the reply that the dialog does not turn into a field. For example parse `上次登录错误：(.+)` into a 上次登录错误 detail row (danger colour), or render the text before the table, minus a successfully parsed credential line, with `OutputLines` above `HealthList`. Record the not-logged-with-error rendering (L2 per R-03, or an L4 note).

### R-02 The unreadable-file banner points to a control that is absent while the panel is live (medium)

- File: `ui/src/graph/Panel.tsx:151` (with `:138`, `ui/src/graph/source.ts` reload/apply).
- Source: the banner says `面板读不出 N 个节点文件，这些节点没有显示。点头部的重新读取再试一次。`. The header renders the 重新读取 button only when `live` is false (`Panel.tsx:138`: `live ? '实时' : <button …>重新读取</button>`).
- Path: the change feed is running (the normal state) and one node file fails to read (for example `workspace-file/too-large`, or an fs error such as a locked file). The new test itself reaches this state: after `push({ kind: 'ready' })` the snapshot is live and the file is still unreadable. A failed file is re-read only when a change frame names it, so a lock that clears without a write never clears the banner.
- Consequence: the error state tells the human to click a button that is not on screen, and the panel offers no retry while live; the missing nodes stay missing until the tab is reopened.
- Required change: give the unreadable banner its own 重新读取 action that calls `source.retry()` (or `reload()`), and word the summary for that action instead of the header; keep the header button as is.

### R-03 The pill's parsers have no L2 test, and the new graph source test fakes an error code rc.3 does not produce (low)

- Files: `ui/src/channel.js:155-185` (parseStatus, statusOf, parseHealth); `tests/graph-panel-model.spec.ts:285`.
- Source: 67dba8e changes `parseStatus` (new not-logged regex with the 登录不完整 reason) and adds `statusOf` and `parseHealth`, which parse text produced in another package (`src/glm-llm/login-row.ts:41-43`, `src/shared/health.ts:142-152` renderHealthTable). No test feeds the real host output through them; only the logged-in case was seen at L4. Separately, the unreadable-file test returns `{ code: 'workspace-file/io' }` from the fake `readBytes`; rc.3 `dsh-api-workspace-files` defines no such code (its codes are not-found, not-directory, not-regular-file, not-text, outside-workspace, too-large, unknown-workspace, unsupported-address, watch-unsupported), against AGENTS.md: the fake host provides only signals the rc.3 host provides.
- Consequence: a change to the credential line or the table format (the split task moves both sides into new packages) breaks the dialog silently; R-01 is the kind of loss such a test would have caught. The fake error code makes the test assert behaviour for a signal the host never sends.
- Required change: move the pure parsers into an importable module (for example `ui/src/channel-parse.js` or a `.ts` sibling) and add an L2 test that renders `/glm-status` text through the real `renderHealthTable` and the credential strings of `login-row.ts` (logged in, not logged in, not logged in with 登录不完整, not logged in with 上次登录错误) and asserts the fields and rows. In `tests/graph-panel-model.spec.ts:285` use a code rc.3 returns, for example `workspace-file/too-large`.

### R-04 No after screenshot of the final redo note (faebb39) (low)

- File: `ui/src/graph/NodeDetail.tsx:59-63`; evidence `.agents/tasks/ui-audit/after-panel-detail-task-done-1.png`.
- Source: the three `after-panel-detail-task-done-*.png` files were captured at 12:11; faebb39 was committed at 12:14 and changes the note above the redo button. `after-panel-detail-task-done-1.png` still shows the superseded note 已完成，可以按现在的验收条件重做. No later screenshot shows a task detail with run controls (checked `after-panel-detail-focus.png`, `after-panel-graph-focus.png`, `work-graph-focus-stroke.png`, `work-window-check.png`).
- Consequence: the final state of a fixed surface (F-19 follow-up) is not evidenced; the fix log's after/before table pairs it with a screenshot of the previous code.
- Required change: after the next build and restart, capture the m2-9-l4 detail (run controls part) showing 已完成 with the 按现在的验收条件重做 button, and list it in the fix log's screenshot table.

## Non-blocking notes

- N-01 `knip.jsonc`: `react-dom` joins `ignoreDependencies` (67dba8e). It applies the existing module-table rule (react since c964f75, ui-primitives since 25d1bae; `react-dom` is in `scripts/ui-modules.mjs` and preflight enforces the table), so it is not treated as a relaxation here. DEVELOPMENT.md §10 asks for user approval of relaxed checker configuration; the orchestrator may want to mention it to the user.
- N-02 Commit messages of e6fd0f2, 5454d2e, 7761f92 and 6020b6d show `?` for their Chinese words (6020b6d's subject reads `?? keeps the idle main agent`). Not fixable without rewriting pushed history; the fix log records it.
- N-03 `findings.md` V-01 Resolution says 待人定, while the graph shows the user's decision (agent 定的: V-01（设置页行名）和拆包谁先, 选了 A: V-01 推迟到 split 合入之后，在新布局上单独设计). The Resolution line can quote that decision.
- N-04 `src/graph/labels.ts` noGraphText: with an absolute `config.dir` and a session without a working directory, a missing graph reads 这个会话没有工作目录，找不到项目图; the message for a relative dir says 工作目录下. Edge case, not reached with the shipped configuration.
- N-05 `src/glm-llm/login-row.ts:76` still says the settings page parses the credential line (the pill does); noticed by the fix log, left out of scope.
