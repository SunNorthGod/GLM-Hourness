# UI audit fix log (graph task m8-ui-audit)

Workflow `wf_72dc4e25196127e4`, step fix. One section per iteration.

## Iteration 1

### Merge and channel.js re-check

- `git -C C:\Users\29596\Desktop\Project\GLM-Hourness log --oneline -10` after the parent's go: HEAD `593a6be` (docs: record the m1-cleanup results in HANDOFF and DESIGN), with the m1-parity merge commit `a9f12e1` (feat(glm-llm): write the ZCode deviceMid back as 3.16.3 ensureCliDeviceMid does) four commits below it. `git status --porcelain`: `?? .kiro/` only.
- `git diff --stat a9f12e1 593a6be` touches only docs/ and docs/graph/; `ui/src/channel.js` is unchanged since `a9f12e1`. Its last change is `7e95096` (m1-parity), which rewrote three strings in `Panel()` (lines 289, 293, 302) and kept the line count.
- Outcome per finding (also written into each finding's In flux line in findings.md):

| Finding | Outcome | Lines in the merged file | Decision |
| --- | --- | --- | --- |
| F-02 | still applies | 179-201 poll, 215 poll after 登录, 221-232 first open, 261 刷新状态 | fix |
| F-03 | still applies | 59, 64 | fix |
| F-04 | still applies | 82, 101-114, 258 | fix |
| F-05 | still applies | 78-81, 83-84, 87, 96 | fix |
| F-18 | still applies | 130, 143-153 (width 320 at 147), 240-264, 271 | partial fix |
| F-33 | still applies on the merged text | 276-281, 288, 289, 293, 302, 306, 317 | fix |
| F-34 | still applies, extended by the 登录不完整 reason (src/glm-llm/login-row.ts:41) | 123-128, 238, 251, 262, 312 | fix |
| F-40 | still applies | 319-321 | no-fix |
| V-03 | still applies on the merged text | 92, 290-294, 306 | fix |

- F-37 docs re-read on 593a6be: HANDOFF.md now names `dsh-glm-hourness-ui@0.2.0` (line 15) and describes ui/ as built from ui/src (line 22), so the HANDOFF :13 and :20 items are already resolved by the orchestrator. Still stale: HANDOFF.md #19 (line 93), DESIGN.md §2.2 row glm-hourness/ui (line 51), §2.5 (lines 219, 221: settings page instead of the pill; 9 rows, HEALTH_ROWS has 11), ui/index.js:6-7, ui/src/channel.js:130.

### Checker baselines

- Before (593a6be, baseline files last changed in a9f12e1): ESLint 250 suppressed, knip 21, jscpd 2.
- After (fe550ff): ESLint 250, knip 21, jscpd 2 (16 duplicated lines). No baseline file changed. Two new findings during the work were fixed in code, not baselined: knip `revOf` export and jscpd clone in NeedsYou.tsx (03a124d), knip `UnreadableFile` export (9ddf0a2), knip `refusalText` export (4c1cfa1, the function had no user left and was deleted).
- Checker configuration: knip.jsonc `ignoreDependencies` gains `react-dom` next to `react` and ui-primitives (67dba8e). Reason: the pill dialog's portal imports `react-dom`, which the DSH client module table provides (scripts/ui-modules.mjs, preflight enforces the table); the existing entry and its comment already cover module-table packages, so this applies the same rule rather than relaxing a check. Flagged here for the reviewer because DEVELOPMENT.md §10 asks for user approval when a checker configuration is relaxed.

### Commits (all pushed to origin/main)

| Commit | Subject | Findings |
| --- | --- | --- |
| e6fd0f2 | fix(ui): node detail on a non-scrolling stage, with a back stack, Escape and focus | F-01, F-26 |
| 5454d2e | fix(ui): list order, history results and a shorter no-one-running note | F-07, F-15, F-31 |
| 7761f92 | fix(ui): keyboard-reachable rows and nodes, accessible counts, shared node row | F-08, F-22, F-25, F-27, F-28 |
| 6020b6d | fix(ui): 现场 keeps the idle main agent, full-contrast quiet rows, a live clock | F-09, F-10, F-11, F-32, V-06 |
| 03a124d | fix(ui): one proposal control, a guarded Enter, agent 定的 on the part layout | F-12, F-13, F-14 |
| 939f00e | fix(ui): graph view follows resizes, strips for banner and legend, empty filter notice | F-16, F-17, F-30, V-05, F-23 |
| 0ff426f | fix(ui): progress motion only where a running agent stands | V-04 |
| 9ddf0a2 | fix(ui): error states name the problem; failed reads are reported; boundary retry | F-29 |
| 4c1cfa1 | fix(graph): human-readable panel refusals, an honest redo label, Chinese command text | F-06, F-19, F-20 |
| 886e38b | fix(glm-llm): Chinese provider group name in the model picker | V-02 |
| 67dba8e | fix(ui): GLM pill runs commands on clicks, lists row health, portals its dialog | F-02, F-03, F-04, F-05 (pill), F-18 (partial), F-34, F-37 (part) |
| ffd8c2d | fix(ui): settings section on DSH's scale, named GLM-Hourness, pointing to the pill | F-33, V-03, F-05 (settings) |
| 53750c8 | fix(ui): plugin manager meta for both packages; stale UI host-half comment | F-35, F-37 (part) |
| faebb39 | fix(ui): redo note says whether the acceptance changed, not the button again | F-19 follow-up from the walkthrough |
| 901bfe0 | fix(ui): a graph node reached by Tab is panned into view | F-08 follow-up from the walkthrough |
| fe550ff | fix(ui): visible keyboard focus stroke on graph nodes | F-08 follow-up from the walkthrough |

The orchestrator committed to main in between (77f85aa, 8742bee, 97ecba1 and later docs(graph) commits); no file of theirs was staged here.

Commit-message encoding: the messages of e6fd0f2, 5454d2e, 7761f92 and 6020b6d show `?` in place of their Chinese words (PowerShell 5.1 piped the here-string to git with `$OutputEncoding` US-ASCII). They are pushed and not rewritten (no force push). From 03a124d on, `$OutputEncoding` is UTF-8 and the messages are intact. The English text of the four messages, the finding ids and the gate results are intact.

### Outcome per finding

Every finding in findings.md now ends with its `- Resolution:` line (47 lines). Summary:

- Fixed (39): F-01 to F-20 (F-18 partial, as decided), F-22, F-23, F-25 to F-35, F-37, V-02 to V-06. Commits in the table above.
- F-18 partial: portal, measured clamp and focus are done (67dba8e); replacing the hand-rolled pill and settings page with ui-primitives components stays out, as findings.md decided (M8 screenshot review by the user; split moves channel.js).
- Not fixed, as decided in findings.md: F-21, F-24, F-36, F-38, F-39, F-40, F-41.
- Held: V-01 (Resolution: 暂缓，依赖 split 的包布局（split 设计 v0.3 §14），待人定), on the parent's notification; no file was changed for it.
- Scope notes: F-06 also applies the human refusal lines to the two /graph-run refusal paths that printed engine text (history write failure, missing graph), the same surface; F-19 also changes the redo outcome and message summary from 按新的验收条件 to 按现在的验收条件, for the same reason as the label.
- Not changed, noticed: src/glm-llm/login-row.ts:76 still says the settings page parses the credential line (it is the pill); src/glm-llm is out of scope unless a finding needs it.

### Gates

Every commit ran, in C:\Users\29596\Desktop\Project\GLM-Hourness, `cmd /c "npm run build > .agents\tasks\ui-audit\build-out.txt 2>&1"`, `cmd /c "npm run preflight > .agents\tasks\ui-audit\preflight-out.txt 2>&1"`, `cmd /c "npm test > .agents\tasks\ui-audit\test-out.txt 2>&1"` (script .agents\tasks\ui-audit\gates.ps1), checking `$LASTEXITCODE` after each. Final exit codes on each committed tree: build 0, preflight 0, test 0. Test counts: 556 at the start; 558 (5454d2e), 560 (6020b6d), 561 (9ddf0a2), 563 (4c1cfa1 and later); 0 failures. Intermediate red runs (fixed before committing): knip/jscpd on 03a124d's first try, knip on 9ddf0a2's first try, knip on 4c1cfa1's first try, knip on 67dba8e's first try.

### Tests added or changed

- tests/graph-panel-model.spec.ts: list order by creation (byCreation), history results (status, verify, link, unlink, supersede), the shorter no-one-running note, child-row dot tone (proposed before wait), 现场 grouping (liveGroups), token and time formats (tokensText, absoluteTime), unreadable node file reported and cleared (GraphSource with the fake remote).
- tests/graph-panel.spec.ts: human refusal lines (stale_revision, bad_transition with the status, not_found, invalid, garbled JSON, missing graph, no working directory), Chinese command descriptions and the /graph-run input hint.
- tests/graph-run.spec.ts: the new redo label and outcome; a redo note written under the earlier label still marks where the last run began.

### Host code and L3

Host-runtime code changed in 4c1cfa1 (src/graph/labels.ts, panel-row.ts, run-control.ts, run.ts, src/shared/dsh-min.ts, src/ui/index.ts) and 886e38b (src/glm-llm/zcode.ts). `cmd /c "npm run probe > .agents\tasks\ui-audit\probe-out.txt 2>&1"` on that tree: exit 0, `probe: 94/94 passed`, artifacts `.llm/probe-runs/2026-10-29T03-45-50-008Z` (graph panel, graph run, health table with 11 rows, non-GLM route; /graph-run registered with its input hint without a warning). 53750c8 changes only package metadata (exports for locale and icon), checked on the desktop after a restart.

### Desktop walkthrough (L4, read-only)

DSH was restarted five times through `.agents\tasks\m8-doing-layout\restart.ps1` (announced to the parent each time). Two starts failed with `bad option: --remote-debugging-port=9333` because the shared shell had `ELECTRON_RUN_AS_NODE=1` set (from a parallel task's sandbox command); the variable was removed in this shell before starting DSH. The window is 1280 x 822 CSS pixels now (the survey's was 2560 x 1392); wide states were emulated with `Emulation.setDeviceMetricsOverride` where needed. Nothing that writes state was pressed; the model picker was opened and closed with Escape, and `C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml` kept its hash (BDB2B388…5872) before and after. The composer draft was cleared after the `/` menu.

Observed:

- F-01: from 正在做 scrolled to 339 and agent 定的 scrolled to 703, the opened detail covers the stage fully (660 of 660 px visible; before: 234 and 0). Switching views resets the list to 0 (before: kept 426). Six wheel steps at the end of a long detail leave the list at 0 and the detail in place (overscroll-behavior contain; before: list moved to 447).
- F-26: Enter on a focused row opens the detail with focus on 返回; Escape inside the detail closes it and focus returns to the row (focus ring visible).
- F-08/F-22: the accessibility tree lists rows and graph nodes as buttons with names, the tab as 正在做，4 项; Tab from 回到重点 reaches the goal node, which is panned into view, with an accent focus stroke.
- F-17: canvas mounted at 2560 x 1392, then shrunk to 1280 x 822 while mounted: the anchor stays at 0.45 / 0.50 of the canvas and whole (before: 0.74 / 0.96, cut off).
- F-30/V-05: 只看等你的 shows 没有等你的事 on an empty canvas; the legend (with 提议 and 风险) is a strip under the canvas; no banner with idle agents.
- V-04: running animations in 正在做 dropped from 7 to 1 (the 实时 ping), in 图 from 8 to 1; reduced motion still stops all.
- F-23: agent chip contrast 6.45:1 dark, about 4.7:1 light (text rgb(119, 84, 179) on the tint over white).
- F-09/V-06 (light): quiet rows at opacity 1, the 现场 notice has a visible border.
- F-03: at 1280 x 822 the pill label is 24.7 px and reads GLM.
- F-20/V-02: the `/` menu shows the Chinese descriptions of graph-apply, graph-run and hourness; the model picker group reads GLM（ZCode 原生通道）.
- F-33/V-03/F-05: settings section titled GLM-Hourness 通道 at 18 px, values under their labels, path in monospace, copy button is the DSH primary button.
- F-35: the 插件 page shows GLM-Hourness with the project graph in its description and GLM-Hourness 界面 with its own icon and description.
- Pill dialog (F-02, F-04, F-18, F-34), opened once on the parent's yes: see the next section.

### Pill dialog check (one glm-status command card)

- Session: the parent allowed the scratch session 未命名 under 未分组. 未分组 now holds 623 probe-run sessions; the two rows titled 未命名 in the loaded list are both about an hour old and the selected one shows the conversation header ws (a probe run's workspace) with 请选择模型 in the composer. The survey's earlier scratch session was not among the loaded rows, so the dialog was opened in that untitled ws session, which is equally a throwaway. **The one glm-status command card in that session comes from this check** (count after the check: 1). Nothing inside the dialog was pressed (no 登录, 刷新状态 or 登出); it was closed with Escape.
- Before the check the DSH window was minimized (renderer 4 x 4, screen -21333), which made screenshots hang; it was restored with ShowWindow and a one-pixel MoveWindow nudge, so the viewport is 1281 x 822 now.
- Observed (`after-pill-glm-dialog.json`): the dialog is a child of document.body (F-18), 460 x 514 at (809, 274), inside the 1281 x 822 viewport, 8 px above the trigger (useAnchoredPosition), and has focus once placed. The automatic first read filled 状态 已登录, 套餐 coding-plan, Key 5acebe…, 账号, 读取于 13:01 (F-02, F-34). The output is the row-health list 各行健康（本会话） with 11 rows, states coloured (生效 green), reasons under them, scrolling inside a 228 px box; no raw Markdown box (F-04). After Escape the dialog is gone, aria-expanded is false, and focus is back on the GLM button with its focus ring.
- Screenshots: after-pill-glm-dialog.png, after-pill-glm-dialog-health-end.png, after-pill-glm-dialog-window.png (no before: the survey did not open the dialog, Q-03).
- Afterwards: back on the validation session 这是一次只读验证：不要修改, 未分组 collapsed again, panel on 正在做. `cordis.patch.yml` hash unchanged (BDB2B388…5872).

### Screenshots: after → before

| after | before |
| --- | --- |
| after-panel-doing-1.png | before-panel-doing-1.png |
| after-panel-live-idle.png (copy of the 正在做 top) | before-panel-live-idle.png |
| after-panel-needs-you-empty-1.png | before-panel-needs-you-empty-1.png |
| after-panel-decisions-1.png | before-panel-decisions-1.png |
| after-panel-decisions-expanded.png | before-panel-decisions-expanded.png |
| after-panel-detail-task-done-1.png, -2.png, -3.png | before-panel-detail-task-done-1.png |
| after-panel-detail-feature-m1-1.png … -4.png | before-panel-detail-feature-m1-1.png, -2.png |
| after-panel-doing-focus.png, after-panel-detail-focus.png | before-panel-detail-focus.png |
| after-narrow-window.png | before-narrow-window.png |
| after-narrow-panel-doing.png | before-narrow-panel-doing.png |
| after-narrow-q01-doing-scrolled.png | before-narrow-q01-doing-scrolled.png |
| after-narrow-q01-doing-open-last.png | before-narrow-q01-doing-open-last.png |
| after-narrow-q01-switch-agent.png | before-narrow-q01-switch-agent.png |
| after-narrow-q01-agent-expanded-last.png | before-narrow-q01-agent-expanded-last.png |
| after-narrow-q01-agent-open-card.png | before-narrow-q01-agent-open-card.png |
| after-narrow-q01-wheel-chain.png (+ .json) | before-narrow-q01-wheel-chain.png |
| after-panel-graph-initial.png (mounted at 2560 x 1392) | before-panel-graph-initial.png |
| after-narrow-panel-graph-resized.png, -remounted.png, -window.png, -wide.png (+ .json) | before-narrow-panel-graph-resized.png, -remounted.png, -window.png |
| after-panel-graph-filter-waiting.png | before-panel-graph-filter-waiting.png |
| after-panel-graph-filter-all.png | before-panel-graph-filter-all.png |
| after-panel-graph-focus.png | (none before; ax-graph.json → after-ax-graph.json) |
| after-panel-reduced-motion.png, after-panel-graph-reduced-motion.png | before-panel-reduced-motion.png, before-panel-graph-reduced-motion.png |
| after-light-panel-doing.png, after-light-panel-decisions.png, after-light-panel-detail.png, after-light-pill-glm-closed.png (+ after-light.json) | before-light-panel-doing.png, before-light-panel-decisions.png, before-light-panel-detail.png, before-light-pill-glm-closed.png |
| after-settings-glm.png (+ .json) | before-settings-glm.png |
| after-light-settings-glm.png (+ .json) | before-light-settings-glm.png |
| after-pill-glm-closed.png | before-pill-glm-closed-wide.png (now at 1280 wide, the case that truncated) |
| after-plugin-manager-meta.png | before-plugin-manager-meta.png |
| after-host-slash-menu.png, -window.png, -g-window.png (+ .json) | before-host-slash-menu.png, before-host-slash-menu-window.png, before-host-slash-menu-g-window.png |
| after-model-picker-glm-models.png | before-model-picker-glm-models.png |
| after-ax-doing.json, after-ax-graph.json | ax-doing.json, ax-graph.json |

Not re-shot, unchanged surfaces or not observable without a write: tab-graph, panel-shell missing and loading (text unchanged), validation banner, unreadable files and render-error boundary (no broken graph), panel outcome lines (need a write), populated 需要你 and proposal actions (no proposal in the graph), running 现场.

## Iteration 2

Input: `review.json` verdict CHANGES_REQUESTED with blocking findings R-01, R-02, R-03, R-04 (`review.md`, pass 1). Start state after the parent's go: HEAD `c79270d` (docs(graph): split steps 0-2 on the branch; addendum, M3 and UI reviews round 1), `git status --porcelain` showed `?? .kiro/` only.

### Outcome per review finding

| Finding | Outcome | Commit |
| --- | --- | --- |
| R-01 pill drops the last login error | fixed: the not-logged-in status parses `上次登录错误：…` into a `上次登录错误` detail row in the error colour (`.glmh-details dd.glmh-err`); every other line of a reply with a health table that is neither a parsed field nor a table line (`restOf`) renders with `OutputLines` above the health list, so an unread credential line also stays visible | 2240b70 |
| R-02 unreadable-file banner points to an absent control | fixed: `Problems` takes an optional `retry`; the unreadable-file banner passes `source.retry()` and shows its own 重新读取 (正在读… while reading) next to the 还有 N 处 toggle; the summary is now `面板读不出 N 个节点文件，这些节点没有显示。`; the header button is unchanged | ef536a3 |
| R-03 no L2 for the pill parsers; fake error code | fixed: `statusOf`, `parseHealth`, `restOf` moved to `ui/src/channel-model.ts` (imported by `ui/src/channel.js`, bundled by esbuild); `tests/health.spec.ts` runs the real login row and feeds its `/glm-status` text through them; `tests/graph-panel-model.spec.ts` refuses with `workspace-file/too-large` and the rc.3 message shape (`"<path>" exceeds the <n> byte full-file cap`, dsh-api-workspace-files `readBytes`) | 2240b70 (parsers, L2), ef536a3 (error code) |
| R-04 no after screenshot of the final redo note | fixed: `after-panel-detail-task-done-run.png` (m2-9-l4 opened from 图 with filter 全部; the 让 agent 干活 part reads 已完成 and the button 按现在的验收条件重做) | no code change |

Non-blocking notes: N-01 (react-dom in knip `ignoreDependencies`) left for the orchestrator to mention to the user; N-02 (four commit messages with `?`) not fixable without rewriting pushed history; N-03 done in findings.md (V-01 Resolution now quotes question-18: the user chose A in the conversation, V-01 waits for split); N-04 (`noGraphText` with an absolute dir) and N-05 (`src/glm-llm/login-row.ts:76` comment still names the settings page) not changed: src/graph and src/glm-llm are outside this iteration's findings.

findings.md Resolution lines updated: F-04 and F-34 (2240b70), F-29 (ef536a3), F-19 (R-04 screenshot), V-01 (N-03).

### Commits (pushed to origin/main)

| Commit | Subject |
| --- | --- |
| 2240b70 | fix(ui): GLM pill keeps the last login error and unread reply lines; parsers under L2 (m8-ui-audit R-01, R-03) |
| ef536a3 | fix(ui): unreadable-file banner offers its own 重新读取 (m8-ui-audit R-02, R-03) |

Both commit messages were written with `$OutputEncoding` UTF-8; their Chinese text is intact (`git cat-file -p HEAD` checked).

### Gates

Each commit's tree ran `.agents\tasks\ui-audit\gates.ps1`: `cmd /c "npm run build > .agents\tasks\ui-audit\build-out.txt 2>&1"`, `cmd /c "npm run preflight > .agents\tasks\ui-audit\preflight-out.txt 2>&1"`, `cmd /c "npm test > .agents\tasks\ui-audit\test-out.txt 2>&1"`, `$LASTEXITCODE` after each. Both runs were green on the first try:

| Tree | build | preflight | test | tests |
| --- | --- | --- | --- | --- |
| 2240b70 | 0 | 0 | 0 | 564 pass, 0 fail |
| ef536a3 | 0 | 0 | 0 | 564 pass, 0 fail |

Inside `npm test` on both: preflight OK (13 exports, ui client half built), check-verbatim OK (443 verbatim, 0 known deviations), `eslint: ok (250 suppressed)`, `knip: ok (21 in the baseline)`, `jscpd: ok (2 clone(s) in the baseline, 16 duplicated lines)`, gitleaks no leaks.

### Checker baselines

Before (c79270d) and after (ef536a3): ESLint 250 suppressed, knip 21, jscpd 2 clones. No baseline or checker configuration file changed.

### Tests added or changed

- tests/health.spec.ts, new test `the GLM pill reads the real /glm-status text: credential fields, the last login error, the health rows, no line lost`: the real login row's `/glm-status` text when not logged in (plan only; all 11 rows in `HEALTH_ROWS` order; a reason with an escaped `|` read back), 登录不完整 (`incomplete`), logged in with a located key (`key 5acebe…`, `userId`), and after `/glm-login` whose background poll gets a 404 (`loginError: bigmodel login poll failed: status=404`); `restOf` is empty for all four; a missing row, a failed command and an unreadable credential line give the three `unknown` reasons, and the unreadable line stays in `restOf`. The network is the login row's injected `fetchImpl`; no DSH contract is faked. `loginRow` takes the row's `LoginConfig`.
- tests/graph-panel-model.spec.ts, `a node file the panel cannot read is reported, ...`: the fake `readBytes` refuses with `workspace-file/too-large`; added: while live, a second refusal after a change frame, then `source.retry()` (the banner's action) clears it without a change frame.

### Host code and L3

No host-runtime code changed (nothing under src/). No sandbox probe was run; the iteration-1 probe result (94/94) stands for src/.

### Desktop (L4, read-only)

- `cdp.mjs reload` after the build did not load the new client: the host serves the client bundle under the revision computed at boot (`plugins/??dsh-glm-hourness-ui/client.js&rev=b627bbff3166` answered 404), and the web boot logged `dsh-glm-hourness-ui: import failed`. DSH was restarted once with `.agents\tasks\m8-doing-layout\restart.ps1` (announced to the parent), after removing `ELECTRON_RUN_AS_NODE=1`, which was set again in the shared shell. After the restart (13:44) dsh-err.txt has no boot error; the panel and the pill are mounted; the mounted panel CSS and pill CSS are contained in ui/client.js on disk and include `.glmg-notice-actions` and `.glmh-details dd.glmh-err`.
- R-04: in the validation session, 图, filter 全部, node m2-9-l4 opened through its DOM element; detail title `m2-9 L4 验证任务`, run part text `让 agent 干活 已完成 按现在的验收条件重做`. Afterwards Escape, filter back to 没做完的, panel on 正在做, no banner.
- Pill dialog, on the parent's yes: the throwaway session 未命名 under 未分组 (title DeepSeek Harness, conversation header ws), the same session as iteration 1. glm-status command cards in that session: 1 before, 2 after; **the second card comes from this check** (the first open after the restart read the status by itself). Nothing inside the dialog was pressed. Observed (`after-pill-glm-dialog-2.json`): dialog a child of body, 460 x 514 at (808, 274) inside the 1280 x 822 viewport, 8 px above the trigger, focused; fields 状态 已登录, 套餐 coding-plan, Key 5acebe…, 账号, 读取于 13:49, 模型, 凭证; health list 各行健康（本会话） with 11 rows (生效 green); no leftover lines (`.glmh-out` absent) and no 上次登录错误 row, as expected for a logged-in reply; buttons 登录, 刷新状态, 登出. Escape closed it; aria-expanded false; focus back on the GLM button. Then back to the validation session, 未分组 collapsed, panel on 正在做.
- Not observable without a write, covered at L2 only: the 上次登录错误 row (needs a failed browser login) and the unreadable-file banner with its 重新读取 (needs an unreadable node file in docs/graph).
- `C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml` hash BDB2B388…5872 before and after; the model picker was not opened.
- Incident, cleaned up: a first attempt to append this section through PowerShell used a variable name that the shared shell already held (another task's copy of a dsh profile patch layer) and, after a failed read, wrote that text plus this section to an untracked `fix-log.md` at the repository root. The file was deleted at once; it was never staged; no profile file was written (the desktop patch hash is unchanged).

### Screenshots: after → before

| after | before |
| --- | --- |
| after-panel-detail-task-done-run.png | before-panel-detail-task-done-1.png (supersedes after-panel-detail-task-done-1.png for the run part) |
| after-pill-glm-dialog-2.png, after-pill-glm-dialog-2-health-end.png, after-pill-glm-dialog-2-window.png (+ after-pill-glm-dialog-2.json) | none before (Q-03); iteration 1: after-pill-glm-dialog.png, after-pill-glm-dialog-health-end.png, after-pill-glm-dialog-window.png |
