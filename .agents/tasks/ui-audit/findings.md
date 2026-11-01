# UI audit, desktop survey findings (graph task m8-ui-audit)

Workflow `wf_72dc4e25196127e4`, step `desktop-survey` (read-only on the desktop; no source edits, builds or commits). It resumes the survey of run `wf_4f796b871f55d1fd`, which a system bugcheck cut at 2026-10-29 02:09 after it had captured 38 before-*.png files (up to 01:44). This step reused those 38 files, captured 33 more between 09:05 and 09:40, and merges the 41 code findings of `audit.md` (F-01 to F-41) with 6 visual findings from the survey (V-01 to V-06).

Each finding is meant to end with one line added by the fix steps: `Resolution: 已改 <commit>` or `Resolution: 不改，<reason>`.

## 1. Bundle loading evidence

Verdict: the desktop profile loads both packages of this bundle from the main checkout `C:\Users\29596\Desktop\Project\GLM-Hourness`. No worktree path appears anywhere.

- `C:\Users\29596\.dsh\profiles\desktop\package.json`: `dsh.profile.bundles` lists `dsh-glm-hourness` and `dsh-glm-hourness-ui`; `dependencies` are `"dsh-glm-hourness": "link:C:/Users/29596/Desktop/Project/GLM-Hourness"` and `"dsh-glm-hourness-ui": "link:C:/Users/29596/Desktop/Project/GLM-Hourness/ui"`.
- `C:\Users\29596\.dsh\profiles\desktop\node_modules\dsh-glm-hourness` is a junction to `C:\Users\29596\Desktop\Project\GLM-Hourness`; `node_modules\dsh-glm-hourness-ui` is a junction to `C:\Users\29596\Desktop\Project\GLM-Hourness\ui`. The only other junctions (`node_modules\@local\*`) point to `C:\Users\29596\Desktop\Project\DeepSeek Harness\…`, not to this repository.
- Settings, 内置插件, 全局插件 lists the twelve rows `glm-hourness/glm-llm` … `glm-hourness/graph-panel` with module URLs `file:///C:/Users/29596/.dsh/profiles/desktop/node_modules/dsh-glm-hourness/dist/…`, and `glm-hourness/ui` with `file:///C:/Users/29596/.dsh/profiles/desktop/node_modules/dsh-glm-hourness-ui/index.js` (`before-plugin-manager-meta-settings-rows.png`).
- The page's combined plugin client script contains `ui/client.js` from the main checkout byte for byte (`script-compare.mjs`: disk length 164408, sha256 prefix `38bef72346bd35c3`, `containsDiskWhole: true`).
- The /glm-status health table in the conversation names `C:\Users\29596\Desktop\Project\GLM-Hourness\docs\graph` and `…\GLM-Hourness\.llm` (`before-host-cmd-glm-expanded.png`).
- `cordis.patch.yml` (sha256 `19A326572BCB595258FDF543D73A830B3AE426629976D00BA0D3A26E412F38D1`, unchanged before and after the survey) configures `glm-hourness/memory`, `workflow` and `hourness` with home `C:\Users\29596\Desktop\Project\GLM-Hourness\.llm`, and `agent-default-model` is still `deepseek-account` / `deepseek-flash` / `high`.

What the desktop runs: `ui/client.js` built 2026-10-29 00:08:52 (sources of `afccf93`) and `dist/` last written 2026-10-28 (`dist/graph` 20:15, `dist/glm-llm` 03:57). DSH was restarted by this step at 2026-10-29 08:59:04 with `--remote-debugging-port=9333` (`.agents/tasks/m8-doing-layout/restart.ps1`). The m1-parity merge described in §2 landed after that and has not been built, so no screenshot shows m1-parity's `channel.js` text or `src/glm-llm` behaviour.

## 2. Repository state and in-flux files

- At step start: `git status --porcelain` printed `?? .kiro/`; `git log -1 --oneline` printed `97840e0 (HEAD -> main, origin/main, origin/HEAD) docs(graph): new runs for m1-parity, split and m8-ui-audit after the crash`.
- During the step the parallel run fast-forwarded main: `git log -1 --oneline` now prints `a9f12e1 (HEAD -> main, origin/main, origin/HEAD, m1-parity) feat(glm-llm): write the ZCode deviceMid back as 3.16.3 ensureCliDeviceMid does (m1-parity)` (21 commits after `97840e0`, including `a1d1e5c docs(graph): desktop slot granted to the m8-ui-audit survey`). `git status --porcelain` still prints only `?? .kiro/`.
- Files the audit marked in flux, re-read now:
  - m8-doing-layout files (`ui/src/graph/Doing.tsx`, `Live.tsx`, `NodeDetail.tsx`, `common.tsx`, `model.ts`, `styles.ts`, `tests/graph-panel-model.spec.ts`): unchanged since the audited commit `5b2e412`; `97840e0..a9f12e1` touches nothing under `ui/` except `ui/src/channel.js`. The audit's line numbers for these files hold. The uncommitted-file warnings in `audit.md` no longer apply.
  - `ui/src/channel.js` after the merge: only three string literals in `Panel()` changed (the description paragraph, the 登录有效期 row, the /glm-status list item); the hunk keeps the line count, so the pill code and its line numbers are as the audit cites them. New text: 原生 ZCode 客户端通道（coding-plan 直连）。登录令牌加密保存在本机，请求用 ZCode 同款的项目令牌。 / coding-plan 的项目令牌按 ZCode 的方式自动续期，OAuth 登录失效后需重新 /glm-login；start-plan 档位自动续期 / /glm-status — 查看登录状态、项目 key 预览与各行健康.
  - `src/glm-llm/login-row.ts:41`: the not-logged credential line now carries `，登录不完整：<reason>` inside its parentheses when the credential is incomplete. `parseStatus` (`ui/src/channel.js:123-128`) still classifies the line as 未登录 through `/未登录/` and drops the reason (added to F-34).
  - `src/glm-llm/zcode.ts:562-570` `keyPreviewOf`: the first six characters of the located API key id followed by `…`, or `unresolved`; the pill regex `Key ([\w…]+)` matches both forms.
  - `src/glm-llm/models.ts`: no display-name or effort-name change in the merged diff. `src/shared/data-home.ts`: comment change only.
- Findings in `ui/src/channel.js` (F-02, F-03, F-04, F-05, F-18, F-33, F-34, F-40 and the new V-03) are marked `pending m1-parity merge: re-check against merged channel.js`. The merge has landed at `a9f12e1`; the re-check is to read the cited lines in the merged file before editing, and to rebuild before any L4.

## 3. How the survey ran

- Window 2560 x 1392 CSS pixels at device scale 1.5, dark theme from the system (`html[data-ds-theme-source=system]`, `body[data-ds-dark-theme]`). The DSH window was occluded, so the helpers force frames with tiny screenshots (`cdpx.mjs pump`).
- Narrow window: `Emulation.setDeviceMetricsOverride` 1280 x 822 inside one CDP session (`narrow-survey.mjs`, `graph-narrow.mjs`, `wheel-chain.mjs`), cleared at the end.
- Light theme: `Emulation.setEmulatedMedia` with `prefers-color-scheme: light` (`light.mjs`, `light-settings.mjs`). Settings, 通用设置, 外观 is 跟随系统, so the app switches to light without saving a preference (`body[data-ds-dark-theme]` disappears, `color-scheme: light`), and returns to dark when the emulation is cleared.
- Reduced motion: `Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce` (`cdpx.mjs reduced`), cleared at the end.
- Controls pressed: view tabs, row and node clicks that open a detail, 展开, a decision row expander, 看这张卡的全部内容, the graph filter menu, 放大, 全貌, 回到重点, the conversation tool-row expander (collapsed again), 轨迹 and 对话 tabs, the 未分组 group (collapsed again), session switching, the composer model picker (two levels, closed with Escape, nothing selected), the account menu, Settings navigation (no control inside a section), the 插件 page, Tab and Escape keys. No approve, decide, start, stop, redo, comment, login, logout or settings control was pressed; the GLM pill was not opened.
- Layout side effects, all reverted or harmless:
  - Scratch session 未命名 (未分组): its right sidebar was opened; its 开始 tab became 项目图 through the 开始 entry (to observe the missing state); the tab was closed, which also collapsed the sidebar. Its sidebar now has no saved tab instead of 开始; reopening it shows 开始 again.
  - Read-only validation session 这是一次只读验证：不要修改: the locator of one helper (`light-settings.mjs`, first version) matched the 关闭 button of the 项目图 sidebar tab and closed that tab. It was restored by reopening the sidebar and choosing 项目图 on its 开始 page; the panel is back at the same place and width (x 1580, width 980 CSS px) on 正在做. The helper now looks for 关闭 only inside `[role=dialog]`.
- DSH is left running with CDP on port 9333, on the validation session, panel on 正在做.
- Console (`before-console.txt`, 443 lines, the page's buffered console for the whole run since 08:59): 432 x `WebSocket connection to 'ws://127.0.0.1:9231/ingest' failed`, 8 x `Failed to load resource: net::ERR_FAILED dsh-app://app/plugins/events`, 3 x HTTP 404 on `dsh-app://app/api/changes.summary?sessionId=session-920b46b6…&seq=…`. All three are attributed to DSH's combined plugin script URL, which also carries `dsh-glm-hourness-ui/client.js`; none comes from this bundle (`ingest`, `9231`, `plugins/events` and `changes.summary` do not occur in `ui/src` or `ui/client.js`). No exception, no `glm-hourness graph panel:` line, no `dsh-glm-hourness-ui: import failed`.

## 4. Answers to the audit's visual questions

- Q-01 (F-01): confirmed, three symptoms. At 1280 x 822, 正在做 scrolled to `scrollTop` 426, clicking the last row 第一理念：在图上编程 opens the detail at y -264, 234 of 660 px visible (`before-narrow-q01-doing-open-last.png`). In agent 定的 scrolled to 709, 看这张卡的全部内容 opens the detail at y -547, 0 px visible (`before-narrow-q01-agent-open-card.png`). Switching from 正在做 at 426 to agent 定的 keeps `scrollTop` 426 (`before-narrow-q01-switch-agent.png`). In the M1 detail scrolled to its end (1421 of 2036), six wheel steps over the detail move `.glmg-body` from 0 to 447 and pull the overlay to y -285 (`before-narrow-q01-wheel-chain.png`, `.json`); `.glmg-detail-body` has `overscroll-behavior-y: auto`.
- Q-02 (F-03): at 1280 x 822 the label `span.glmh-pill-label` is 7.5 px wide for 25 px of text (`overflow: hidden`, `min-width: 0px`) and reads G; `span.glmh-anchor` (`flex: 0 1 auto`, `min-width: 0px`, 43.5 px) is the flex item of `div.GRgSLq_dock` (through a `display: contents` wrapper); `button.glmh-pill` has `min-width: auto`. At 2560 the label is 24.7 px and reads GLM (`before-narrow-measure.json`, `pill-wide.json`). DSH's own stats keep a readable prefix at 1280 (6 轮 13 步…, 282K tok · 缓…).
- Q-03 (F-02, F-04, F-18): skipped by default; the dialog was not opened.
- Q-04 (F-36, F-02): the glm-status card body is the raw Markdown table (`before-host-cmd-glm-expanded.png`). The graph-run and graph-apply cards have no expander and no body, only the one-line summary (`before-host-cmd-graph-cards.png`). No session has an hourness card: the string `"hourness"` occurs in none of the 646 files under `C:\Users\29596\.dsh\sessions`.
- Q-05 (F-17, F-16, F-30): on mount the view is correct: the anchor `m8-ui-audit` (first task in progress in layout order; no waiting node, the main agent's focus `m2-9-l4` is hidden by the filter) sits at 0.45 of the width and 0.50 of the height, whole (`graph-initial.json`; `before-narrow-panel-graph.json` wide and remounted). The view is placed once: resizing the window to 1280 x 822 with the canvas mounted leaves the anchor at 0.74 / 0.96, cut off (`before-narrow-panel-graph-resized.png`); restoring the size leaves it at 0.27 / 0.26. 回到重点 re-centres it; 全貌 fits the whole open graph (`before-panel-graph-home.png`, `before-panel-graph-overview.png`). 只看等你的 draws an empty canvas with only the legend (`before-panel-graph-filter-waiting.png`). 全部 shows 97 nodes and two idle agent badges (`before-panel-graph-filter-all.png`). The banner lists both idle agents as 焦点被筛选隐藏了.
- Q-06 (F-08, F-22, F-26): from the selected view tab, Tab reaches the two 上次在「m2-9 L4 验证任务」 links in 现场 and then leaves the panel for the left navigation; no row is reachable (`q06-doing.txt`). In the M1 detail, Tab goes 返回, the two crumbs, the 批注 textarea and out; the 21 child rows are skipped (`q06-detail.txt`). The focus ring shows (`outline: auto 2px rgb(122, 170, 255)`). Escape with focus on 返回 does not close the detail. Accessibility tree: the selected tab is named 正在做 6 (bare count), rows are not in the tree, graph nodes are non-focusable `group` nodes under an `image` (`ax-doing.json`, `ax-graph.json`).
- Q-07 (F-05, F-09, F-23): light theme observed (`before-light-*.png`, `before-light.json`, `before-light-settings.json`). Quiet 现场 rows: `opacity: 0.6` with meta text `rgb(129, 133, 140)` on white, about 2.1:1. agent 定的 chip: text `rgb(163, 113, 247)` on a 16 % tint of itself, about 2.8:1. Settings copy button: fixed `rgb(36, 123, 191)` with white text in both themes, about 4.5:1 at 13 px. The 现场 notice background is `rgb(255, 255, 255)` on the white panel (V-06). The closed pill uses the same tertiary ink as DSH's stats in both themes.
- Q-08 (F-07): 进行中 order: 底层：通道与方言, 1.11 L4 真机验收, coding-plan 请求与 ZCode 3.16.3 一致（150% 加成）, M1 底层收口, 全部 UI 的审查与优化，最后完整走一轮, 解耦：GLM 通道包与编排层包 (`before-panel-doing-1.png`). M1 下面的节点 starts 1.1, 1.10, 1.11, 1.2 (`before-panel-detail-feature-m1-1.png`).
- Q-09 (F-14, F-24): 正在做 section titles sit in `.glmg-part` with a 0.67 px top rule and 12 px top padding, margin `0 2px 8px`, counts in the titles; agent 定的 has one bare title 最近拍板的, margin `4px 2px 6px`, no rule, no count (`q09.json`). Font sizes with text in 正在做: 10, 11, 11.5, 12, 12.5, 13 px; in agent 定的: 11, 11.5, 13 px. No screenshot shows a readability problem from the sizes.
- Q-10 (F-20): the `/` menu lists glm-login, glm-logout, glm-status with Chinese descriptions and graph-apply, graph-run, hourness with English ones (`before-host-slash-menu.png`, `before-host-slash-menu-g-window.png`, `before-host-slash-menu.json`). The draft was cleared.
- Q-11 (F-21): 轨迹 lists the bundle's notices as rows labelled 上下文 with the first line of the body (`before-host-notice-model-trace.png`). The summary strings (project graph projection of …, todo reminder, peak hours …, deferred tools: N added, M removed) are not in the DOM of 对话 or 轨迹 (`trace-find.js`: no hit; the one deferred-tools hit is the body of the tool-search announcement).
- Q-12 (F-35, V-01): the 插件 page lists GLM-Hourness with the hourglass icon and the description 在 DeepSeek Harness 中按 ZCode 训练分布运行 GLM：提示词与工具面镜像、工具懒加载、执行边界、审计流水、记忆库与 /hourness 用量报告。, and dsh-glm-hourness-ui with a generic icon and no description (`before-plugin-manager-meta.png`). Settings, 内置插件, 全局插件 titles every row of this bundle with its file URL and shows no description (`before-plugin-manager-meta-settings-rows.png`).
- Q-13 (F-33, F-05): path: account menu (bottom left), 设置, section GLM Hourness (last entry, gear icon). DSH draws no title above our `h2` (18 px, weight 700). DSH's 通用设置 rows use 14 px / 22 px titles and 12 px / 18 px descriptions without a section title; 内置插件 draws its own page title and description (`before-settings-glm.png`, `before-settings-dsh-general.png`, `before-plugin-manager-meta-settings.png`).
- Q-14 (panel-shell): a session under 未分组 shows 这个工作区还没有项目图 / 项目图放在工作区的 docs/graph/nodes 下；建一个空目录就是一张空图。 / 重新读取, without header or tabs (`before-panel-shell-missing.png`). Loading (正在读项目图…) was caught once while the restored tab mounted (`before-panel-shell-loading.png`).
- Q-15 (tab-graph): the tab strip shows 项目图 with a close button (`before-tab-graph.png`). The 开始 page lists 项目图 with the goal icon among DSH's entries; DSH renders entry titles only, so the guide description 需要你的事、agent 定的事、正在做的 (`ui/src/graph/tab.tsx:66`) is not shown, like every other entry's (`before-tab-graph-start.png`). Observed in the scratch session, whose sidebar already held a 开始 tab; no new tab was opened in the validation session.
- Q-16 (model-picker-glm, V-02): the picker has two levels, 模型 and 推理等级 (`before-model-picker-glm.png`). 模型 lists the groups DeepSeek 账号, GLM (ZCode native) with GLM-5.3 and GLM-5.3-Flash, and Zcode本机反代 (the user's own `glm` provider, not this bundle) with GLM-5.3 and GLM-5.3-Flash again (`before-model-picker-glm-models.png`). 推理等级 lists Low, High, Max (`before-model-picker-glm-effort.png`). Closed with Escape; the trigger still reads GLM-5.3-Flash High and the profile file is unchanged.
- Q-17 (narrow): at 1280 x 822 the four view tabs and the count fit; the 现场 note wraps to two lines; detail crumbs wrap to two lines (`before-narrow-panel-doing.png`, `before-narrow-window.png`); the 图 toolbar fits on one row (`before-narrow-panel-graph-remounted.png`); the banner and the legend cover nodes (V-05).
- Q-18 (motion): with `prefers-reduced-motion: reduce` the running animations in the panel drop from 7 (glmg-ping, glmg-pop, glmg-breathe) to 0 in 正在做 and from 8 (glmg-ping, glmg-halo) to 0 in 图, and come back when cleared (`before-panel-reduced-motion.png`, `before-panel-graph-reduced-motion.png`). The six breathing dots in 正在做 are the 进行中 rows, while 现场 says 0 个在跑 (V-04).
- Q-19 (console): see §3. Nothing from this bundle.

## 5. Finding list

Counts: 47 findings (41 F, 6 V); high 2, medium 16, low 29; decision fix 40 (one of them partial: F-18), no-fix 7 (F-21, F-24, F-36, F-38, F-39, F-40, F-41). Code locations are those of `audit.md`, valid on `a9f12e1` unless a line says otherwise. "Survey" says what the desktop showed; "not observable" means the state needs a write.

| Id | Surface | Sev | Decision | In flux |
| --- | --- | --- | --- | --- |
| F-01 | panel-detail, panel-shell | high | fix | no |
| F-02 | pill-glm, host-cmd-glm | high | fix | pending m1-parity merge: re-check against merged channel.js |
| F-03 | pill-glm | medium | fix | pending m1-parity merge: re-check against merged channel.js |
| F-04 | pill-glm, host-health | medium | fix | pending m1-parity merge: re-check against merged channel.js |
| F-05 | pill-glm, settings-glm | medium | fix | pending m1-parity merge: re-check against merged channel.js |
| F-06 | host-cmd-graph | medium | fix | no |
| F-07 | panel-doing, panel-detail | medium | fix | no |
| F-08 | panel views | medium | fix | no |
| F-09 | panel-live | medium | fix | no |
| F-10 | panel-live | medium | fix | no |
| F-11 | panel-live and others | medium | fix | no |
| F-12 | options picker | medium | fix | no |
| F-13 | panel-detail | medium | fix | no |
| F-14 | panel-decisions | medium | fix | no |
| F-15 | panel-detail | medium | fix | no |
| F-16 | panel-graph | low | fix | no |
| F-17 | panel-graph | medium | fix | no |
| F-18 | pill-glm, settings-glm | medium | partial fix | pending m1-parity merge: re-check against merged channel.js |
| F-19 | panel-detail, host-cmd-graph | low | fix | no |
| F-20 | host-slash-menu | low | fix | no |
| F-21 | host-notice-model | low | no-fix | no |
| F-22 | panel-shell, panel-live | low | fix | no |
| F-23 | panel-decisions, panel-graph | low | fix | no |
| F-24 | panel views | low | no-fix | no |
| F-25 | needs-you, decisions, detail | low | fix | no |
| F-26 | panel-detail | low | fix | no |
| F-27 | panel-detail | low | fix | no |
| F-28 | panel-detail | low | fix | no |
| F-29 | panel-shell | low | fix | no |
| F-30 | panel-graph | low | fix | no |
| F-31 | panel-live | low | fix | no |
| F-32 | panel-live | low | fix | no |
| F-33 | settings-glm | low | fix | pending m1-parity merge: re-check against merged channel.js |
| F-34 | pill-glm | low | fix | pending m1-parity merge: re-check against merged channel.js |
| F-35 | plugin-manager-meta | low | fix | no |
| F-36 | host-cmd-glm, host-health, host-cmd-hourness | low | no-fix | no |
| F-37 | docs and comments | low | fix | no |
| F-38 | panel-doing, panel-detail | low | no-fix | no |
| F-39 | panel-shell | low | no-fix | no |
| F-40 | pill-glm | low | no-fix | pending m1-parity merge: re-check against merged channel.js |
| F-41 | host-tool-rows | low | no-fix | no |
| V-01 | plugin-manager-meta | medium | fix (confirm the mechanism first) | no |
| V-02 | model-picker-glm | low | fix | no (src/glm-llm/zcode.ts came in with the merge; re-read it) |
| V-03 | settings-glm | low | fix | pending m1-parity merge: re-check against merged channel.js |
| V-04 | panel-doing, panel-graph | low | fix | no |
| V-05 | panel-graph | low | fix | no |
| V-06 | panel-live, panel-shell | low | fix | no |

### F-01 Detail overlay inside the scrolling body (high, fix)

- Evidence: ui/src/graph/Panel.tsx:101-107; ui/src/graph/styles.ts:20, 136, 139. Survey: Q-01 (`before-narrow-q01-doing-open-last.png`, `before-narrow-q01-agent-open-card.png`, `before-narrow-q01-switch-agent.png`, `before-narrow-q01-wheel-chain.png`).
- Fix: as in audit.md: a non-scrolling stage holding `.glmg-body` and, as its absolute sibling, `.glmg-detail`; `overscroll-behavior: contain` on `.glmg-detail-body`; `inert` on the list while the detail is open; reset (or keep per view) the body's scroll offset on view change. Pair with F-26.
- In flux: no.
- Resolution: 已改 e6fd0f2

### F-02 Automatic /glm-status runs from the pill (high, fix)

- Evidence: ui/src/channel.js:186-201, 215, 221-232, 261; src/glm-llm/login-row.ts:43, 53. Survey: the pill-triggered glm-status card sits after the last turn of the validation session, carrying the account id in its summary (`before-host-cmd-graph-cards.png`, `before-host-cmd-glm-collapsed.png`). The dialog was not opened (Q-03).
- Fix: as in audit.md: no poll; after 登录 show the link and 授权完成后点「刷新状态」; a module-level status cache shared by every pill, auto-run only when it is empty; every other run follows a click.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies; ui/src/channel.js:179-201 (poll), 215 (poll after 登录), 221-232 (first open), 261 (刷新状态). Decision: fix.
- Resolution: 已改 67dba8e

### F-03 Pill label truncates to G (medium, fix)

- Evidence: ui/src/channel.js:59, 64. Survey: Q-02; `before-narrow-window.png` and `before-narrow-panel-graph-window.png` show ⊙ G; `before-pill-glm-closed-wide.png` shows GLM.
- Fix: keep the three letters whole: `flex: none` on `.glmh-anchor` (the dock's flex item, measured), `flex: none; overflow: visible` on `.glmh-pill-label`.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies; ui/src/channel.js:59 (.glmh-anchor), 64 (.glmh-pill-label). Decision: fix.
- Resolution: 已改 67dba8e

### F-04 Raw /glm-status Markdown in the dialog (medium, fix)

- Evidence: ui/src/channel.js:101-114, 258, 82; src/shared/health.ts:142-152. Survey: the same text is raw in the command card (`before-host-cmd-glm-expanded.png`); the dialog itself was not opened.
- Fix: as in audit.md: render the part after the credential line with ui-primitives `MarkdownText`, or parse the table rows into the existing `dl`; keep the host format for the L3 probe.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies; ui/src/channel.js:82 (.glmh-out), 101-114 (OutputLines), 258. Decision: fix.
- Resolution: 已改 67dba8e；复审 R-01、R-03 后补 2240b70（解析函数移到 ui/src/channel-model.ts，L2 用真实 /glm-status 输出测；健康列表上方保留未解析的行）

### F-05 Undefined theme tokens in channel.js (medium, fix)

- Evidence: ui/src/channel.js:78-84, 87, 96. Survey: the settings copy button is `rgb(36, 123, 191)` with white text in both themes, about 4.5:1 (`before-settings-glm.png`, `before-light-settings-glm.png`, `before-light-settings.json`).
- Fix: as in audit.md: `--dsw-alias-state-business-primary` for accent, `--dsw-alias-state-error-primary` for danger, DSH's settings scale for the title (Q-13: rows 14 / 22 and 12 / 18 px), DSH's primary button colours or ui-primitives `Button`.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies; ui/src/channel.js:78-81, 83-84, 87, 96. Decision: fix.
- Resolution: 已改 67dba8e（pill 的强调色与危险色）、ffd8c2d（设置页标题与复制按钮）

### F-06 English, LLM-directed refusals shown to the human (medium, fix)

- Evidence: src/graph/labels.ts:91-93; src/graph/panel-row.ts:82, 86-87. Survey: not observable (needs a refused write).
- Fix: as in audit.md: map engine codes to Chinese lines with an action in `applyFromCommand`; update tests/graph-panel.spec.ts:69-82 and ORCHESTRATION.md §2.10; probe (glm-graph-panel).
- In flux: no.
- Resolution: 已改 4c1cfa1

### F-07 File-name order in panel lists (medium, fix)

- Evidence: ui/src/graph/Doing.tsx:49-54; NodeDetail.tsx:89; src/graph/parse.ts:42-45. Survey: Q-08 (`before-panel-doing-1.png`, `before-panel-detail-feature-m1-1.png`). The graph's anchor is the first doing task in layout order (m8-ui-audit), while the list starts with 1.11, which shows the same disagreement.
- Fix: as in audit.md: one comparator in model.ts with the layout's rule, applied to the three 正在做 lists and the detail's children; test it.
- In flux: no.
- Resolution: 已改 5454d2e

### F-08 Keyboard cannot open nodes (medium, fix)

- Evidence: ui/src/graph/Doing.tsx:26, Decisions.tsx:29, 46, NodeDetail.tsx:126, NeedsYou.tsx:27, GraphCanvas.tsx:90, 308. Survey: Q-06 (`q06-doing.txt`, `q06-detail.txt`, `ax-doing.json`, `ax-graph.json`, `before-panel-detail-focus.png`).
- Fix: as in audit.md: rows as `role="button"` with `tabIndex={0}` and Enter or Space, card titles as buttons, graph nodes focusable buttons with labels, the SVG as `role="group"`; keep the browser focus ring, which shows today.
- In flux: no.
- Resolution: 已改 7761f92；桌面走查后补 901bfe0（Tab 到画布外的节点时平移到中间）、fe550ff（节点焦点描边压过内联样式）

### F-09 Dimmed 现场 rows below contrast (medium, fix)

- Evidence: ui/src/graph/styles.ts:85-86. Survey: about 2.1:1 in light, about 3.8:1 in dark (`before-light-panel-doing.png`, `before-panel-live-idle.png`).
- Fix: no opacity; secondary through colour only, at full strength.
- In flux: no.
- Resolution: 已改 6020b6d

### F-10 Idle main agent folded as stopped (medium, fix)

- Evidence: ui/src/graph/Live.tsx:84-90. Survey: not observable (needs a running child).
- Fix: as in audit.md: always show the main agent; fold children only; toggle 另有 N 个子 agent 已停下.
- In flux: no.
- Resolution: 已改 6020b6d

### F-11 Relative times freeze (medium, fix)

- Evidence: ui/src/graph/agents.ts:55-64; Live.tsx:67, 83; NodeDetail.tsx:142; NeedsYou.tsx:31; Decisions.tsx:52. Survey: not observed directly (needs the panel open for minutes without a graph change); the restart made all times current.
- Fix: one shared ticker (1 s while something runs, 60 s otherwise) for every timeAgo, absolute time in a `title`.
- In flux: no.
- Resolution: 已改 6020b6d

### F-12 Enter in the reason input (medium, fix)

- Evidence: ui/src/graph/common.tsx:181. Survey: not observable (any Enter there writes a decision).
- Fix: return early unless Enter, not composing (`isComposing`, keyCode 229) and not busy.
- In flux: no.
- Resolution: 已改 03a124d

### F-13 Reject without confirmation in the detail (medium, fix)

- Evidence: ui/src/graph/NodeDetail.tsx:35-44, 113; NeedsYou.tsx:47-77. Survey: not observable (no proposals in the graph).
- Fix: one shared proposal control in common.tsx (reject asks for an optional reason and confirms), inside `<Part title="批准或否决">`.
- In flux: no.
- Resolution: 已改 03a124d

### F-14 agent 定的 view not on the Part layout (medium, fix)

- Evidence: ui/src/graph/Decisions.tsx:19-21, 27, 40; styles.ts:22-23 vs 146-149. Survey: Q-09 (`q09.json`, `before-panel-decisions-1.png` beside `before-panel-doing-1.png`).
- Fix: Part titles agent 正要定的 · N and 最近拍板的 · N, an empty notice in the second part.
- In flux: no.
- Resolution: 已改 03a124d

### F-15 History lines without results (medium, fix)

- Evidence: ui/src/graph/model.ts:252-262. Survey: 改状态：L4 两条验收满足… without the new status (`before-panel-detail-task-done-1.png`); 改状态：已完成 1.1、1.2… in the M1 detail (`before-panel-detail-feature-m1-2.png`).
- Fix: as in audit.md (改为「完成」, 验证为「沙盒验证」, 加连线 / 删连线, 被 <by> 取代), with the history test.
- In flux: no.
- Resolution: 已改 5454d2e

### F-16 Graph banner lists idle agents (low, fix)

- Evidence: ui/src/graph/GraphCanvas.tsx:166, 325-331. Survey: 主 Agent：焦点被筛选隐藏了 · L4 验证：焦点+睡眠120秒：焦点被筛选隐藏了 over the canvas in every 图 screenshot with the default filter (`before-panel-graph-initial.png`); it covers nodes at 1280 (V-05).
- Fix: list only running agents (idle ones are in 现场). Commit with V-05.
- In flux: no.
- Resolution: 已改 939f00e

### F-17 Graph view is placed once (medium, fix)

- Evidence: ui/src/graph/GraphCanvas.tsx:193-204, 212-218. Survey: Q-05: correct on mount, wrong after a resize (`before-narrow-panel-graph-resized.png`, `before-narrow-panel-graph.json`). The cause the audit listed first is confirmed: placement happens once and later size changes keep the old view.
- Fix: re-home on size changes until the user pans or zooms (a flag set by wheel, drag and the zoom buttons, cleared by 回到重点), and on filter changes.
- In flux: no.
- Resolution: 已改 939f00e

### F-18 Hand-rolled pill, dialog and settings page (medium, partial fix)

- Evidence: ui/src/channel.js:130, 143-153, 240-264, 275-307. Survey: the settings section looks unlike DSH's sections (`before-settings-glm.png` beside `before-settings-dsh-general.png`); the dialog was not opened.
- Fix now: portal the dialog to `document.body`, clamp with the measured width, move focus into the dialog and back; plus F-02 to F-05 and F-34. Reason not to replace everything with primitives in this run: ROADMAP.md M8 puts the redesign under user review on screenshots, and feature `split` moves channel.js into the GLM package.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies; ui/src/channel.js:130 (comment), 143-153 (place, width 320 at 147), 240-264 (dialog), 271 (dialog rendered inside the anchor). Decision: partial fix.
- Resolution: 部分已改 67dba8e（对话框 portal 到 body、按实测宽高夹在视口内、焦点进出）；不改，整体换成 ui-primitives 组件留给 M8 的截图终审与 split 之后（ROADMAP.md M8，split 把 channel.js 移进 GLM 包）

### F-19 Redo label claims a change (low, fix)

- Evidence: src/graph/run.ts:21-25, 48-53; ui/src/graph/NodeDetail.tsx:70. Survey: 改了验收条件后重做 under 已完成，可以按现在的验收条件重做 on m2-9-l4 (`before-panel-detail-task-done-1.png`), and next to 从这里开始做 on m1-parity (`before-panel-detail-task-parity-1.png`).
- Fix: label 按现在的验收条件重做; `isRunEntry` keeps accepting the old prefix; tests/graph-run.spec.ts:239; probe (glm-graph-run).
- In flux: no.
- Resolution: 已改 4c1cfa1；桌面走查后补 faebb39（按钮上方的说明不再重复按钮文字）；复审 R-04 的截图 after-panel-detail-task-done-run.png（第 2 轮）

### F-20 Command descriptions and hints (low, fix)

- Evidence: src/ui/index.ts:62, 65, 73; src/graph/panel-row.ts:170, 177. Survey: Q-10 (`before-host-slash-menu-g-window.png`).
- Fix: Chinese descriptions, `input.hint` for graph-run, Chinese /hourness usage and error lines.
- In flux: no.
- Resolution: 已改 4c1cfa1

### F-21 English notice summaries (low, no-fix)

- Evidence: src/graph/reminder.ts:203, src/glm-prompt/todo-reminder.ts:137, src/glm-prompt/peak-reminder.ts:49, src/toolsearch/index.ts:197. Survey: Q-11 (`before-host-notice-model-trace.png`).
- Reason not to fix: the condition of the audit's proposal is not met. Neither 对话 nor 轨迹 shows the summary strings; 轨迹 shows the label 上下文 and the model-facing body, which stays English and partly verbatim-gated.
- In flux: no.
- Resolution: 不改，轨迹与对话都不显示这些 summary，原因见上

### F-22 Accessible text for counts and chips (low, fix)

- Evidence: ui/src/graph/Panel.tsx:25-28, 96-98; Live.tsx:47. Survey: the selected tab's accessible name is 正在做 6 (`ax-doing.json`).
- Fix: as in audit.md (需要你，3 项; agent 待定 N 项; 出错 for failed chips; one stable panel id).
- In flux: no.
- Resolution: 已改 7761f92

### F-23 Fixed purple (low, fix)

- Evidence: ui/src/graph/styles.ts:9, 69. Survey: Q-07, about 2.8:1 in light (`before-light-panel-decisions.png`).
- Fix: keep the purple for strokes and fills; derive the chip text colour to reach 4.5:1 in both themes.
- In flux: no.
- Resolution: 已改 939f00e（实测对比度：深色 6.45:1，浅色约 4.7:1）

### F-24 Font scale (low, no-fix)

- Evidence: ui/src/graph/styles.ts. Survey: Q-09 lists 10, 11, 11.5, 12, 12.5, 13 px in 正在做.
- Reason not to fix: audit.md made this conditional on a visible problem; no screenshot shows one, and the change is cosmetic.
- In flux: no.
- Resolution: 不改，截图里没有字号带来的可读性问题，原因见上

### F-25 Goal repetition, spacing, missing label (low, fix)

- Evidence: ui/src/graph/NeedsYou.tsx:30-31, Decisions.tsx:33, NodeDetail.tsx:101. Survey: detail crumbs start with the full goal title and take two lines at 1280 (`before-narrow-panel-doing.png`) and in the m2-9-l4 detail at full width (`before-panel-detail-task-done-1.png`).
- Fix: as in audit.md (omit 挂在「…」下 for the goal, first crumb 目标, agent 提的, 倾向 A <label>).
- In flux: no.
- Resolution: 已改 7761f92

### F-26 Detail navigation and focus (low, fix)

- Evidence: ui/src/graph/NodeDetail.tsx:83, 96; Panel.tsx:106. Survey: Escape with focus on 返回 leaves the detail open (`q06-detail.txt`).
- Fix: back stack, Escape closes, focus moves in on open and back to the opener on close. Commit with F-01.
- In flux: no.
- Resolution: 已改 e6fd0f2；最终走查后补 20ed994（从「图」的节点用键盘打开的详情，关闭后焦点回到该节点）

### F-27 Detail child rows (low, fix)

- Evidence: ui/src/graph/NodeDetail.tsx:124-131. Survey: child rows show only the status line (`before-panel-detail-feature-m1-1.png`).
- Fix: reuse Doing's row without the path; test proposed before the wait case.
- In flux: no.
- Resolution: 已改 7761f92

### F-28 Verification tag tones (low, fix)

- Evidence: ui/src/graph/NodeDetail.tsx:106. Survey: not observed (no decision detail with 被推翻 or 被取代).
- Fix: success for 沙盒验证 and 真机验证, danger for 被推翻, neutral for 被取代.
- In flux: no.
- Resolution: 已改 7761f92

### F-29 Error states (low, fix)

- Evidence: ui/src/graph/Panel.tsx:62-64, 100; tab.tsx:33-39; source.ts:81-86. Survey: the missing and loading states read well (`before-panel-shell-missing.png`, `before-panel-shell-loading.png`); banner, boundary and failed reads are not observable.
- Fix: as in audit.md (first issue in the banner, 重新加载 in the boundary, an issue for a failed read); keep the missing text until `bootstrap`.
- In flux: no.
- Resolution: 已改 9ddf0a2；复审 R-02 后补 ef536a3（读不出节点文件的提示带自己的「重新读取」，实时状态下也能重读）

### F-30 Graph view gaps (low, fix)

- Evidence: ui/src/graph/GraphCanvas.tsx:98-105, 156-158, 332-338. Survey: empty canvas for 只看等你的 (`before-panel-graph-filter-waiting.png`); the legend has no entry for the dashed red risk nodes (在盯着) visible in `before-panel-graph-filter-all.png`.
- Fix: empty notice on the canvas, `title` on the corner badge, legend entries for 提议 and 风险. Commit with V-05.
- In flux: no.
- Resolution: 已改 939f00e

### F-31 No-one-running note (low, fix)

- Evidence: ui/src/graph/model.ts:214-217; Doing.tsx:52. Survey: two sentences, count 6 including 3 features (`before-panel-live-idle.png`).
- Fix: shorter note counting tasks; the explanation as a `title` or second line; update tests/graph-panel-model.spec.ts:89-97.
- In flux: no.
- Resolution: 已改 5454d2e

### F-32 Token format (low, fix)

- Evidence: ui/src/graph/agents.ts:74-78; Live.tsx:27. Survey: 282k tokens in 现场, 282K tok in the composer stats (`before-pill-glm-closed-wide.png`).
- Fix: DSH's format.
- In flux: no.
- Resolution: 已改 6020b6d

### F-33 Settings page (low, fix)

- Evidence: ui/src/channel.js:275-307, 317. Survey: the nav entry reads GLM Hourness, the plugin manager GLM-Hourness (`before-settings-glm.png`, `before-plugin-manager-meta.png`); the page lists the commands but not the pill. The merged text (§2) is longer and will wrap more in the right-aligned value column (V-03).
- Fix: GLM-Hourness; point to the pill (在输入框下方的 GLM 按钮里登录、查看状态); a note when copying fails. Reason not to show live status here: the section has no session.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies on the merged text; the merge rewrote ui/src/channel.js:289, 293, 302 only; naming at 288 and 317, copy at 276-281, model hint at 306. Decision: fix on the merged strings.
- Resolution: 已改 ffd8c2d

### F-34 Pill states (low, fix)

- Evidence: ui/src/channel.js:238, 251, 262, 312; src/glm-llm/login-row.ts:41 (merged). Survey: closed pill only.
- Fix: as in audit.md (未知 with the reason, 套餐 — until known, 登出 asks once); plus show the 登录不完整 reason the merged credential line carries.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies, extended; ui/src/channel.js:238, 251, 262, 312; parseStatus 123-128 drops the 登录不完整 reason of src/glm-llm/login-row.ts:41. Decision: fix.
- Resolution: 已改 67dba8e；复审 R-01 后补 2240b70（后台登录失败后，对话框多一行「上次登录错误」）

### F-35 Plugin manager meta (low, fix)

- Evidence: locale/zh.json:4, locale/en.json:4, ui/package.json:5. Survey: Q-12 (`before-plugin-manager-meta.png`): the UI package shows its technical name, a generic icon and no description.
- Fix: name the project graph in both locale descriptions; give the UI package locale meta and an icon like the main package; update `files` in ui/package.json.
- In flux: no.
- Resolution: 已改 53750c8

### F-36 Markdown outputs in command cards (low, no-fix)

- Evidence: src/shared/health.ts:142-152; src/workflow/morning-report.ts:34-77. Survey: Q-04 (`before-host-cmd-glm-expanded.png`, `before-host-cmd-glm-collapsed.png`).
- Reason not to fix now: the alternative is an undocumented rc.3 command-view slot and the L3 probe parses the table; track under M8.
- In flux: no.
- Resolution: 不改，原因见上（卡片视图接缝未公开，L3 探针按表格式解析）

### F-37 Stale comments and docs (low, fix)

- Evidence: ui/index.js:6-7, ui/src/channel.js:130, docs/DESIGN.md §2.2 and §2.5, docs/HANDOFF.md:13, 20, 90. Survey: none needed.
- Fix: correct each in the commit of the related code change.
- In flux: no (re-read DESIGN.md and HANDOFF.md before editing; the orchestrator commits to main).
- Resolution: 已改 67dba8e（channel.js 注释、DESIGN.md §2.5、HANDOFF.md #19）、53750c8（ui/index.js、DESIGN.md §2.2）；HANDOFF.md :13、:20 已由编排方在 593a6be 之前改好

### F-38 Progress over direct children (low, no-fix)

- Evidence: ui/src/graph/model.ts:172-192. Survey: 底层 工作完成 0/1 next to M1 18/21 (`before-panel-doing-1.png`).
- Reason not to fix: the direct-children rule is deliberate (ORCHESTRATION.md §2.10); a recursive count is the user's call.
- In flux: no.
- Resolution: 不改，直属子节点口径是有意的，改成递归由人定

### F-39 Tab name agent 定的 (low, no-fix)

- Evidence: ui/src/graph/Panel.tsx:78. Survey: the tab lists 你在对话里说的 rows too (`before-panel-decisions-1.png`).
- Reason not to fix: the four view names come from the user-approved prototype; renaming is the user's call.
- In flux: no.
- Resolution: 不改，四个视图名来自人认可的原型，改名由人定

### F-40 Pill in every session (low, no-fix)

- Evidence: ui/src/channel.js:319-321. Survey: the pill shows in the scratch session with 请选择模型 (`before-panel-shell-ungrouped-window.png`).
- Reason not to fix: login must be reachable before any GLM session exists.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies; ui/src/channel.js:319-321. Decision: no-fix (unchanged reason).
- Resolution: 不改，登录要在任何 GLM 会话之前可达

### F-41 Generic tool rows (low, no-fix)

- Evidence: src/graph/tools.ts, src/memory/tools.ts, src/guard/rules.ts. Survey: 工具调用 · graph_focus · m2-9-l4 and 工具调用 · Error: tool call aborted (`before-host-tool-rows.png`); 轨迹 shows the JSON (`before-host-notice-model-trace.png`).
- Reason: model-facing texts; the planned tool-row view and guard card belong to M8 with unverified seams.
- In flux: no.
- Resolution: 不改，模型面文本与 M8 的工具行视图，不在本任务

### V-01 Settings plugin inventory titles bundle rows with file URLs (medium, fix after confirming the mechanism)

- Surface: plugin-manager-meta (Settings, 内置插件, 全局插件).
- Evidence: `before-plugin-manager-meta-settings-rows.png`: twelve rows titled file:///C:/Users/29596/.dsh/profil… with no description, while official rows show a Chinese title and a one-line description (自动授权审查, 会话数据诊断). The card's `title` attribute is the full file URL, which includes the user's home path. cordis.patch.yml:14-70 names the rows by relative path (`name: ./dist/glm-llm/index.js` …), ui/cordis.patch.yml:6 `name: ./index.js`; rc.3 `dsh-host-plugin-inventory/lib/index.js:127, 147` looks row meta up with `packages?.metaOf(entry.options.name, base)`.
- Resolution: 暂缓。用户在对话里选了 A（项目图 question-18「V-01（设置页行名）和拆包谁先」，经对话转述）：V-01 推迟到 split 合入之后，在新布局上单独设计
- Resolution: 已改 0ec0b58（分支 row-titles，任务 m8-row-titles，设计 `.agents/tasks/row-titles/design.md`）：宿主行名改为 `<包名>/<行>`，客户端面并入宿主包、客户端行用精确包名，13 行各有 locale 标题；探针 118/118，三种组合的标题检查通过；桌面版截图核对随批次 L4
- Fix: first read `dsh-plugin-package-inventory` (`metaOf`) to learn which specifier and which meta fields it resolves. Then either name the rows through the package's existing exports (`dsh-glm-hourness/glm-llm` … from package.json `exports`) or provide the meta it reads, with a Chinese title and description per row. This changes how the loader composes rows: headless sandbox first (AGENTS.md rule 3, DEVELOPMENT.md §3), then `npm run probe`, then L4.
- In flux: no.

### V-02 English provider group name in the model picker (low, fix)

- Surface: model-picker-glm.
- Evidence: `before-model-picker-glm-models.png`: groups DeepSeek 账号, GLM (ZCode native), Zcode本机反代; src/glm-llm/zcode.ts:177 `name: 'GLM (ZCode native)'`. The duplicate GLM-5.3 and GLM-5.3-Flash entries come from the user's own `glm` provider (Zcode本机反代), not from this bundle; DSH's trigger label (GLM-5.3-Flash High) does not name the provider. Both are outside this bundle.
- Fix: a Chinese display name, for example GLM（ZCode 原生通道）; check that no test or verbatim gate (`npm run check:verbatim`) asserts the string; host runtime code, so `npm run probe` with the host batch.
- In flux: no; zcode.ts arrived with the merge at `a9f12e1`, re-read it before editing.
- Resolution: 已改 886e38b

### V-03 Settings section layout (low, fix)

- Surface: settings-glm.
- Evidence: `before-settings-glm.png`, `before-light-settings-glm.png`: the value column is right-aligned monospace with `word-break: break-all` (ui/src/channel.js `.glmh-value`, CSS block lines 88-96), so the credential path wraps as （设置 DSH_HOME 时在其 / 下的 glm-hourness）; the merged 登录有效期 text is longer and will wrap the same way. The nav entry uses the same gear icon as 通用设置. The model hint 在会话的模型选择器里选 glm-zcode 路由的 GLM-5.3。 (line 306 on `a9f12e1`) names the route id, while the picker shows the group GLM (ZCode native) and two GLM models.
- Fix: values left-aligned in the body font (monospace only for the path), wrapping at word boundaries; the hint in the picker's terms (选「GLM（ZCode 原生通道）」下的 GLM-5.3 或 GLM-5.3-Flash, matching V-02); a distinct section icon if `settings.section` registration accepts one (read the rc.3 slot contract first). Commit with F-33.
- In flux: re-checked on 593a6be in the fix step, iteration 1 (channel.js is unchanged since the merge commit a9f12e1): still applies on the merged text; .glmh-value at ui/src/channel.js:92, rows 290-294, model hint 306. Decision: fix.
- Resolution: 已改 ffd8c2d（分区图标做不到：设置壳按分区 id 选导航图标）

### V-04 Progress motion without a running agent (low, fix)

- Surface: panel-doing, panel-graph.
- Evidence: ui/src/graph/styles.ts:78 (`.glmg-dot.doing` breathes), 115 (`.glmg-node.doing .halo` pulses). Survey: all six 进行中 dots breathe and every doing node pulses while 现场 says 0 个在跑 (Q-18 animation list; `before-panel-doing-1.png`, `before-panel-graph-initial.png`).
- Fix: animate only where a running agent is placed (`placements` in ui/src/graph/agents.ts), static dot and steady outline otherwise; the reduced-motion handling stays. This changes what the user sees on every open: if the fix step treats it as a product decision, ask the user with both options.
- In flux: no.
- Resolution: 已改 0ff426f

### V-05 Graph banner and legend cover nodes (low, fix)

- Surface: panel-graph.
- Evidence: ui/src/graph/styles.ts:128 (`.glmg-unplaced`, absolute at the top of the canvas), 133 (`.glmg-legend`, absolute at the bottom). Survey: the banner sits over 3.1 主 Agent 身份与不写代码 and the legend over M8 呈现 at 1280 (`before-narrow-panel-graph-resized.png`), and over nodes at full width after zooming (`before-panel-graph-zoom-in.png`).
- Fix: put the banner (F-16 content) and the legend (F-30 entries) in strips outside the pannable area, or reserve canvas padding that home() and overview() account for.
- In flux: no.
- Resolution: 已改 939f00e

### V-06 Notice box invisible in the light theme (low, fix)

- Surface: panel-live (现场 note), panel-shell notices.
- Evidence: ui/src/graph/styles.ts:168 (`.glmg-notice{…background:var(--g-layer)…}`). Survey: computed background `rgb(255, 255, 255)` on the white panel, so the note loses its box (`before-light-panel-doing.png`); in dark it shows as a grey box (`before-panel-live-idle.png`). `.glmg-card` uses the same token but keeps a border.
- Fix: a fill that differs from the base in both themes, or a 1 px `var(--g-line)` border like the cards.
- In flux: no.
- Resolution: 已改 6020b6d

## 6. Screenshot index

All files are in `.agents/tasks/ui-audit/`. 71 before-*.png: 38 reused from the 01:14-01:44 run (marked r), 33 new from 09:05-09:40 (marked n). Every file was opened and looked at for this report.

| Surface | State | File(s) or reason |
| --- | --- | --- |
| whole window | start of the earlier run; end of this run | before-window-start.png (r); before-window-end.png (n) |
| tab-graph | tab strip, populated | before-tab-graph.png (r) |
| tab-graph | 开始 page entry | before-tab-graph-start.png, before-tab-graph-start-window.png (n), scratch session |
| panel-shell | ready | before-panel-shell-ready.png (r) |
| panel-shell | loading | before-panel-shell-loading.png (n), cropped from before-window-end.png |
| panel-shell | missing | before-panel-shell-missing.png, before-panel-shell-ungrouped-window.png (n) |
| panel-shell | failed, not live, validation banner, render-error boundary | not observable: need a broken or unreadable graph or a render error |
| panel-needs-you | empty | before-panel-needs-you-empty-1.png (r) |
| panel-needs-you | populated | not observable: needs a proposal or an open question in the graph |
| panel-decisions | populated; expanded row | before-panel-decisions-1.png, before-panel-decisions-expanded.png (r) |
| panel-decisions | light theme | before-light-panel-decisions.png (n) |
| panel-decisions | pending agent questions; empty | not observable: the graph has neither |
| panel-doing | populated | before-panel-doing-1.png (r) |
| panel-doing | narrow; scrolled to the end | before-narrow-panel-doing.png, before-narrow-q01-doing-scrolled.png (r) |
| panel-doing | light theme; reduced motion | before-light-panel-doing.png, before-panel-reduced-motion.png (n) |
| panel-doing | empty parts | not observable: all three parts have rows |
| panel-live | idle, with a child stopped before this app start | before-panel-live-idle.png (r); also at the top of before-panel-doing-1.png |
| panel-live | running; row off (还没有现场数据) | not observable: needs an agent turn (writes a session, costs credits) or a missing live row |
| panel-graph | initial (fresh mount) | before-panel-graph-initial.png (r) |
| panel-graph | 回到重点; 全貌 | before-panel-graph-home.png, before-panel-graph-overview.png (r) |
| panel-graph | filter menu; 全部; 只看等你的 | before-panel-graph-filter-menu.png, before-panel-graph-filter-all.png, before-panel-graph-filter-waiting.png (r) |
| panel-graph | zoomed in twice | before-panel-graph-zoom-in.png (n) |
| panel-graph | resized while mounted; remounted at 1280 x 822 | before-narrow-panel-graph-resized.png, before-narrow-panel-graph-remounted.png (n) |
| panel-graph | reduced motion | before-panel-graph-reduced-motion.png (n) |
| panel-graph | pan by drag | not captured: needs a pointer drag; pan logic shares the view state shown by zoom and resize |
| panel-detail | task in progress (m1-11) | before-panel-detail-task-doing-1.png (r) |
| panel-detail | task in progress with redo and folded long body (m1-parity) | before-panel-detail-task-parity-1.png, before-panel-detail-task-parity-2.png (r) |
| panel-detail | done task with redo (m2-9-l4) | before-panel-detail-task-done-1.png (r) |
| panel-detail | decided question (question-4) | before-panel-detail-question-1.png (r) |
| panel-detail | feature with children (m1) | before-panel-detail-feature-m1-1.png, before-panel-detail-feature-m1-2.png (r) |
| panel-detail | opened from 图 (m8-ui-audit) | before-panel-detail-from-graph.png (r) |
| panel-detail | opened from a scrolled list; wheel chaining | before-narrow-q01-doing-open-last.png, before-narrow-q01-agent-expanded-last.png, before-narrow-q01-agent-open-card.png (r); before-narrow-q01-wheel-chain.png (n) |
| panel-detail | keyboard walk; light theme | before-panel-detail-focus.png, before-light-panel-detail.png (n) |
| panel-detail | node removed; proposal actions | not observable: need a removal or a proposal |
| (narrow window) | 1280 x 822 overview, agent 定的 after switching | before-narrow-window.png, before-narrow-q01-switch-agent.png (r); before-narrow-panel-graph-window.png (n) |
| pill-glm | closed, wide | before-pill-glm-closed-wide.png (r) |
| pill-glm | closed, narrow | before-narrow-window.png (r), before-narrow-panel-graph-window.png (n) |
| pill-glm | closed, light theme | before-light-pill-glm-closed.png (n) |
| pill-glm | dialog open | not observable: opening runs /glm-status and appends a command card (F-02); skipped by default (Q-03) |
| pill-glm | error fallback (GLM ⚠) | not observable: needs a render error in the pill |
| settings-glm | dark; light; window | before-settings-glm.png, before-light-settings-glm.png, before-settings-window.png (n) |
| settings-glm | DSH section beside it | before-settings-dsh-general.png (n) |
| host-cmd-graph | conversation cards (graph-run, graph-apply) | before-host-cmd-graph-cards.png (n) |
| host-cmd-graph | outcome lines under the panel control | not observable: need a panel write |
| host-cmd-glm | glm-status card collapsed; expanded | before-host-cmd-glm-collapsed.png, before-host-cmd-glm-expanded.png (r) |
| host-health | health table in the expanded card | before-host-cmd-glm-expanded.png (r) |
| host-cmd-hourness | card | not observable: no session holds one; running /hourness appends a card |
| host-notice-run | start; redo trigger cards | before-host-notice-run-start.png, before-host-notice-run-redo.png (r) |
| host-notice-run | pause note | in 轨迹 as a 上下文 row: before-host-notice-model-trace.png (r) |
| host-notice-model | 轨迹 tab | before-host-notice-model-trace.png (r) |
| host-slash-menu | `/`; `/g`; window | before-host-slash-menu.png, before-host-slash-menu-g-window.png, before-host-slash-menu-window.png (r) |
| plugin-manager-meta | 插件 page, installed packages | before-plugin-manager-meta.png, before-plugin-manager-window.png (n) |
| plugin-manager-meta | Settings 内置插件: session rows; 全局插件 header; this bundle's rows | before-plugin-manager-meta-settings.png, before-plugin-manager-meta-settings-global.png, before-plugin-manager-meta-settings-rows.png (n) |
| model-picker-glm | first level; models; effort; window | before-model-picker-glm.png, before-model-picker-glm-models.png, before-model-picker-glm-effort.png, before-model-picker-glm-window.png (n) |
| host-tool-rows | expanded tool group in 对话 | before-host-tool-rows.png (n) |

Data files: before-narrow-measure.json, pill-wide.json, graph-*.json, before-host-slash-menu.json, trace.json (r); before-narrow-panel-graph.json, before-narrow-q01-wheel-chain.json, before-light.json, before-light-settings.json, q09.json, q06-doing.txt, q06-detail.txt, ax-doing.json, ax-graph.json, before-console.txt (n). Helpers added this run: fixed-rect.js, nav-find.js, trace-find.js, hover.mjs, q09.js, graph-narrow.mjs, wheel-chain.mjs, light.mjs, light-settings.mjs.

## 7. Fix concerns, one commit each, in suggested order

Gates for every commit: `npm run build`, `npm run preflight`, `npm test` (DEVELOPMENT.md §2). Host-runtime commits (7, 8) share one `npm run probe` for the batch. Commit 10 changes loader rows and needs the headless sandbox first. UI-only changes get L4 in the final walkthrough after a DSH restart (a page refresh can 404 the client half, DEVELOPMENT.md §7).

1. Detail overlay and navigation: F-01, F-26. ui/src/graph/Panel.tsx, NodeDetail.tsx, styles.ts.
2. Model helpers with L2 tests: F-07 (order comparator), F-15 (history results), F-31 (note text). ui/src/graph/model.ts, Doing.tsx, NodeDetail.tsx, tests/graph-panel-model.spec.ts.
3. Keyboard, labels and rows: F-08, F-22, F-25, F-27, F-28. Doing.tsx, Decisions.tsx, NeedsYou.tsx, NodeDetail.tsx, GraphCanvas.tsx, Panel.tsx, Live.tsx, common.tsx.
4. 现场: F-09, F-10, F-11, F-32, V-06. Live.tsx, agents.ts, model.ts, styles.ts (with every timeAgo caller for F-11).
5. Actions: F-12, F-13, F-14. common.tsx, NodeDetail.tsx, NeedsYou.tsx, Decisions.tsx.
6. Graph view: F-17, F-16, F-30, V-05, F-23. GraphCanvas.tsx, styles.ts.
7. Host text for the panel and commands: F-06, F-19, F-20. src/graph/panel-row.ts, labels.ts, run.ts, run-control.ts, src/ui/index.ts, tests/graph-panel.spec.ts, tests/graph-run.spec.ts, ORCHESTRATION.md §2.10.
8. Provider display name: V-02. src/glm-llm/zcode.ts. The settings hint of V-03 (commit 10) quotes this name; keep the two strings equal.
9. Pill: F-02, F-03, F-04, F-05, F-34, F-18 (portal, measured clamp, focus). ui/src/channel.js pill code; re-check against the merged file first.
10. Settings section: F-33, V-03. ui/src/channel.js `Panel()` and its CSS; the merged strings are the base.
11. Package and row meta: F-35, then V-01 after reading `dsh-plugin-package-inventory`. locale/*.json, ui/package.json, cordis.patch.yml, ui/cordis.patch.yml; sandbox, probe, L4. Split into two commits if V-01 needs the loader change.
12. Motion only where an agent runs: V-04. styles.ts, Doing.tsx, GraphCanvas.tsx; ask the user first if the fix loop treats it as a product decision.
13. Error states: F-29. Panel.tsx, tab.tsx, source.ts, tests/graph-panel-model.spec.ts.

F-37 (stale comments and docs) goes into the commit that touches the related code: ui/src/channel.js:130 with 9, ui/index.js and DESIGN.md §2.2 with 11, DESIGN.md §2.5 and HANDOFF.md #19 with 9 (F-04), HANDOFF.md:13 and :20 with 11. No fix: F-21, F-24, F-36, F-38, F-39, F-40, F-41.
