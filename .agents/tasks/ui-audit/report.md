# UI audit, final report (graph task m8-ui-audit)

Workflow `wf_72dc4e25196127e4`, step `final-walkthrough`, 2026-10-29 13:59 to 14:35. Inputs: `audit.md`, `findings.md`, `fix-log.md`, `review.md`, `review.json`. This step ran the last complete walkthrough of every surface on DSH Desktop 0.2.1-rc.3, found one small regression, fixed it in `20ed994`, and checked it on the desktop.

## 1. Summary

- Review verdict: `review.json` is `APPROVED` with no findings (review pass 2). The fix loop used 2 fix iterations and 2 review passes. It ended on approval, not on the iteration limit.
- Surfaces: all 20 inventory surfaces of `audit.md` §2 were walked on the desktop, with 71 `final-*.png` screenshots. The states that need a write or a broken graph are listed in §4.
- Findings: 47 findings (41 F, 6 V). 39 are fixed. F-18 is partly fixed, as planned. 7 were not fixed, each with a reason. V-01 is held until `split` lands, by the user's choice. The 4 review findings (R-01 to R-04) are resolved. One new regression, W-01, was found in this walkthrough and fixed in `20ed994`.
- Regressions: only W-01, the one above. Every other surface matches its after-state, or improves on its before-state, as the finding intended.
- The console holds the same three DSH message classes as before the audit, and no line comes from this bundle. No DSH crash log was written during this step. Plugin loading was confirmed after each restart.
- Model default: `agent-default-model` is still `deepseek-account` / `deepseek-flash` / `high`. The `cordis.patch.yml` hash did not change.
- Push state: `main` equals `origin/main` (`e6dfba2`). The only untracked path is `?? .kiro/`.

## 2. Bundle loading (main checkout)

The assumption is verified: the desktop loads this bundle from the main checkout `C:\Users\29596\Desktop\Project\GLM-Hourness`.

- `findings.md` §1 recorded the evidence at survey time. That record covers the package links, the profile junctions, the Settings rows with module URLs under `node_modules\dsh-glm-hourness`, the page's combined client script containing `ui/client.js` byte for byte, and the health table naming `…\GLM-Hourness\docs\graph`.
- Re-checked in this step:
  - `C:\Users\29596\.dsh\profiles\desktop\node_modules\dsh-glm-hourness` is a junction to `C:\Users\29596\Desktop\Project\GLM-Hourness`. `node_modules\dsh-glm-hourness-ui` is a junction to `…\GLM-Hourness\ui`.
  - In `package.json`, the dependencies are `link:C:/Users/29596/Desktop/Project/GLM-Hourness` and `link:C:/Users/29596/Desktop/Project/GLM-Hourness/ui`.
- Served client (`script-compare.mjs`, Debugger.getScriptSource of the combined `dsh-app://app/plugins/??…` script):
  - After restart 1 (14:00:34): `containsDiskWhole: true` for `ui/client.js` with sha256 prefix `49c45774a898e469`, 179480 chars. That is the same build as `ef536a3`, because `ef536a3..8f1a4c6` touches only `docs/graph/`.
  - After restart 2 (14:27:45): `containsDiskWhole: true` for the `20ed994` build, sha256 prefix `4fdb99a2642bd8de`, 179528 chars.
- Plugin loading after each restart, beyond `application: applied`:
  - No `web-boot`, `renderer` or `host` crash log was written after 13:59 in `%APPDATA%\@deepseek-ai\dsh-desktop\logs`. The newest file is `crash-2026-10-29T05-43-05-346Z-web-boot.log` (13:43:05). It is the iteration-2 reload incident (`dsh-glm-hourness-ui: import failed` on a stale client revision) and predates this step.
  - `dsh-err.txt` holds only the `DevTools listening on ws://127.0.0.1:9333/…` line.
  - The panel was mounted and showed `实时`, and the pill was mounted with the label `GLM`.
  - The pill dialog's row health list showed all 11 rows: 3 生效, 8 已加载，本会话未触发, none 未生效.

## 3. Repository and build

- Start of step: HEAD `8f1a4c6`, `git status --porcelain` `?? .kiro/`. During the step the orchestrator added `33ec176` and `e6dfba2` (docs(graph)). Neither commit touches files of this step.
- `npm run build` at 14:00:16: exit 0. The desktop was then restarted, not reloaded, because the docs require a restart for client-half changes (DEVELOPMENT.md §7, 2026-10-28 incident).
- Commit of this step: `20ed994` fix(ui): focus returns to a graph node when its detail closes (m8-ui-audit). It changes one file, `ui/src/graph/Panel.tsx`. It is pushed, and the Chinese text of the commit message is intact.
- Gates on the `20ed994` tree (`gates.ps1`, `$LASTEXITCODE` after each):

| Gate | Exit | Result |
| --- | --- | --- |
| `npm run build` | 0 | both `tsc` runs, `build-ui: wrote ui/client.js` |
| `npm run preflight` | 0 | `preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)` |
| `npm test` | 0 | 564 pass, 0 fail; `check-verbatim: OK (443 verbatim, 0 known deviations)`; `eslint: ok (250 suppressed)`; `knip: ok (21 in the baseline)`; `jscpd: ok (2 clone(s) in the baseline, 16 duplicated lines)`; `check-secrets: ok (gitleaks 8.30.1: 183 commits on HEAD, staged and unstaged changes, no leaks)` |

- Checker baselines:
  - Before the audit's fixes (`593a6be`): ESLint 250 suppressed, knip 21, jscpd 2 clones.
  - After the last fix (`20ed994`): ESLint 250, knip 21, jscpd 2 clones (16 lines).
  - The ceiling given to the loop was 256 / 21 / 2. No baseline file changed in this step.
  - The one checker-configuration change of the audit is `react-dom` in `knip.jsonc` `ignoreDependencies` (`67dba8e`, review note N-01). It still needs the user's acknowledgement under DEVELOPMENT.md §10.
- Host code: this step changed nothing under `src/`, so no sandbox probe was run. The iteration-1 probe (94/94, `.llm/probe-runs/2026-10-29T03-45-50-008Z`) still covers the host code.
- Push: `git status -sb` prints `## main...origin/main`. `git rev-parse HEAD origin/main` gives `e6dfba2…` twice, so main is not ahead of origin/main.

## 4. Surfaces covered

Window 1280 x 822 CSS px, device scale 1.5, dark theme from the system. Light theme and reduced motion were emulated through CDP and cleared afterwards. The 2560 x 1392 state was emulated for the graph resize check. Each listed screenshot was opened and compared with its before and after images.

| Surface | States walked (final screenshots) | Result |
| --- | --- | --- |
| tab-graph | tab strip (`final-tab-graph.png`); 开始 entry in the scratch session (`final-tab-graph-start.png`) | unchanged, as before |
| panel-shell | ready (header in every panel shot); missing (`final-panel-shell-missing.png`, `final-panel-shell-ungrouped-window.png`) | as before. Loading was too short to capture: the first frame already showed the missing state |
| panel-needs-you | empty (`final-panel-needs-you-empty-1.png`) | 看看 agent 自己定的 6 件事 matches the 6 agent rows at the end of agent 定的 |
| panel-decisions | populated (`-1`, `-2`); expanded row (`final-panel-decisions-expanded.png`, `final-narrow-q01-agent-expanded-last.png`); light | Part layout with 最近拍板的 · 20 (F-14); agent chips readable (F-23) |
| panel-doing | populated (`final-panel-doing-1.png`, `-2`, `-after-fix`); scrolled; light; reduced motion | order by creation (F-07); 进行中 · 4, 可以开工 · 6, 采纳了还没验证的决策 · 2 |
| panel-live | idle with a stopped child (top of `final-panel-doing-1.png`) | main agent shown, not folded (F-10); full-contrast rows (F-09); note counts 1 task (F-31); 282K tok, 39.1K tok (F-32) |
| panel-graph | mount (`final-panel-graph-initial.png`), 全貌, 回到重点, zoom in, filter menu, 全部 (103 nodes), 只看等你的 (`没有等你的事`), resize 2560 x 1392 to 1280 x 822 while mounted, remount, keyboard focus, reduced motion | anchor `m8-ui-audit` at 0.45 / 0.50, whole, after mount, resize and remount (F-17); legend strip with 提议 and 风险 (F-30, V-05); no banner (F-16); 1 running animation, 0 with reduced motion (V-04); focus stroke and pan into view (F-08) |
| panel-detail | done task m2-9-l4 (`-task-done-1..3`), doing task m8-ui-audit with 从这里开始做 (`-task-doing-1..3`), feature M1 with 21 children (`-feature-m1-1..4`), decided question question-4 (`-question-1..2`), decision from the end of a scrolled list, card from agent 定的, keyboard (`final-panel-detail-focus.png`), wheel chaining, light | detail covers the stage, 660 of 660 px visible, from scrollTop 339 (正在做) and 703 (agent 定的) (F-01); view switch resets to 0; six wheel steps at the detail end leave the list at 0 (`overscroll-behavior: contain`); redo note 已完成 above 按现在的验收条件重做 (F-19); crumbs start 目标 (F-25); history lines state results (F-15) |
| pill-glm | closed at 1280 (`final-pill-glm-closed.png`: label 24.7 px, reads GLM, F-03); light; dialog open (`final-pill-glm-dialog.png`, `-health-end`, `-window`, `.json`) | dialog is a child of body, 460 x 514 at (808, 274), 8 px above the trigger, focused (F-18). Fields: 已登录, coding-plan, Key 5acebe…, 账号, 读取于 14:31, 模型, 凭证 (F-02, F-34). Health list 各行健康（本会话）, 11 rows, scrolls inside 228 px, no raw box (F-04). Escape closes it, aria-expanded false, focus back on the GLM button |
| settings-glm | dark (`final-settings-glm.png`), light (`final-light-settings-glm.png`) | GLM-Hourness 通道 at 18 px, values under labels, monospace path, DSH primary button, hint names GLM（ZCode 原生通道） (F-33, V-03, F-05) |
| host-cmd-graph | conversation cards (`final-host-cmd-graph-cards.png`) | one-line summaries, as before |
| host-cmd-glm, host-health | glm-status card expanded (`final-host-cmd-glm-expanded.png`) | raw Markdown table in the DSH card (F-36, not fixed, unchanged) |
| host-cmd-hourness | none | no session holds an hourness card; the `/` menu entry reads 晨报与积分用量（读审计流水） |
| host-notice-run | start and redo trigger cards (`final-host-notice-run-start.png`, `-redo.png`) | history of 2026-10-28, unchanged |
| host-notice-model | 轨迹 tab (`final-host-notice-model-trace.png`) | rows 上下文 with the model-facing body (F-21, not fixed) |
| host-slash-menu | `/`, `/g`, window (`final-host-slash-menu*.png`, `.json`) | Chinese descriptions for glm-login, glm-logout, glm-status, graph-apply, graph-run, hourness (F-20); draft empty afterwards |
| plugin-manager-meta | 插件 page (`final-plugin-manager-meta.png`, `-window.png`); Settings 内置插件 全局插件 rows (`final-plugin-manager-meta-settings-rows.png`) | both packages with title, description and icon (F-35). The Settings inventory still titles the 12 rows by file URL (V-01, held). The 全局插件 group was expanded for the shot and collapsed again |
| model-picker-glm | 模型 level (`final-model-picker-glm-models.png`) | group GLM（ZCode 原生通道） with GLM-5.3 and GLM-5.3-Flash (V-02); closed with Escape, nothing selected |
| host-tool-rows | tool group (`final-host-tool-rows.png`) | generic DSH rows (F-41, not fixed) |

Not observable without a write, a broken graph or a running agent (covered by L2 or by code reading):

- 需要你 populated and the proposal control (F-12, F-13).
- 现场 with a running agent (F-10 running part, F-11 ticking clock).
- Panel outcome lines and refusals (F-06).
- Validation banner, unreadable-file banner with its 重新读取, and the render-error boundary (F-29, R-02).
- The pill's 上次登录错误 row (R-01) and its error fallback.
- Node removed.
- Pan by drag.

### Walkthrough record of writes and layout side effects

- One glm-status command card was appended in the throwaway scratch session 未命名 (未分组, conversation header ws), on the parent's yes, by the dialog's automatic first read after restart 2. That session now holds 3 such cards: 1 from iteration 1, 1 from iteration 2 and 1 from this step. Nothing inside the dialog was pressed.
- In the scratch session the right sidebar was opened and its 开始 tab turned into 项目图, to show the missing state. The tab was then closed, which collapsed the sidebar again. As after the survey, that session has no saved sidebar tab.
- No other write: nothing that approves, decides, starts, stops, redoes, comments, logs in, logs out or saves was pressed.
- End state: DSH running with CDP 9333 on the validation session 这是一次只读验证：不要修改, panel on 正在做, 未分组 collapsed, composer draft empty.

## 5. Findings and outcomes

| Id | Title | Outcome |
| --- | --- | --- |
| F-01 | Detail overlay inside the scrolling body | fixed `e6fd0f2` |
| F-02 | Automatic /glm-status runs from the pill | fixed `67dba8e` |
| F-03 | Pill label truncates to G | fixed `67dba8e` |
| F-04 | Raw /glm-status Markdown in the dialog | fixed `67dba8e`, `2240b70` (R-01, R-03) |
| F-05 | Undefined theme tokens in channel.js | fixed `67dba8e` (pill), `ffd8c2d` (settings) |
| F-06 | English, LLM-directed refusals shown to the human | fixed `4c1cfa1` |
| F-07 | File-name order in panel lists | fixed `5454d2e` |
| F-08 | Keyboard cannot open nodes | fixed `7761f92`, `901bfe0`, `fe550ff` |
| F-09 | Dimmed 现场 rows below contrast | fixed `6020b6d` |
| F-10 | Idle main agent folded as stopped | fixed `6020b6d` |
| F-11 | Relative times freeze | fixed `6020b6d` |
| F-12 | Enter in the reason input | fixed `03a124d` |
| F-13 | Reject without confirmation in the detail | fixed `03a124d` |
| F-14 | agent 定的 view not on the Part layout | fixed `03a124d` |
| F-15 | History lines without results | fixed `5454d2e` |
| F-16 | Graph banner lists idle agents | fixed `939f00e` |
| F-17 | Graph view is placed once | fixed `939f00e` |
| F-18 | Hand-rolled pill, dialog and settings page | partly fixed `67dba8e` (portal, measured clamp, focus). The rest is not fixed: moving to ui-primitives waits for the M8 screenshot review and for `split`, which moves channel.js |
| F-19 | Redo label claims a change | fixed `4c1cfa1`, `faebb39` |
| F-20 | Command descriptions and hints | fixed `4c1cfa1` |
| F-21 | English notice summaries | not fixed: neither 对话 nor 轨迹 shows the summaries |
| F-22 | Accessible text for counts and chips | fixed `7761f92` |
| F-23 | Fixed purple | fixed `939f00e` (6.45:1 dark, about 4.7:1 light) |
| F-24 | Font scale | not fixed: no screenshot shows a readability problem |
| F-25 | Goal repetition, spacing, missing label | fixed `7761f92` |
| F-26 | Detail navigation and focus | fixed `e6fd0f2`, plus `20ed994` for focus return to graph nodes (W-01) |
| F-27 | Detail child rows | fixed `7761f92` |
| F-28 | Verification tag tones | fixed `7761f92` |
| F-29 | Error states | fixed `9ddf0a2`, `ef536a3` (R-02) |
| F-30 | Graph view gaps | fixed `939f00e` |
| F-31 | No-one-running note | fixed `5454d2e` |
| F-32 | Token format | fixed `6020b6d` |
| F-33 | Settings page | fixed `ffd8c2d` |
| F-34 | Pill states | fixed `67dba8e`, `2240b70` (R-01) |
| F-35 | Plugin manager meta | fixed `53750c8` |
| F-36 | Markdown outputs in command cards | not fixed: the card-view seam is undocumented, and the L3 probe parses the table |
| F-37 | Stale comments and docs | fixed `67dba8e`, `53750c8`. The orchestrator corrected HANDOFF.md :13 and :20 before `593a6be` |
| F-38 | Progress over direct children | not fixed: the direct-children rule is deliberate, and a recursive count is the user's call |
| F-39 | Tab name agent 定的 | not fixed: the view names come from the user-approved prototype |
| F-40 | Pill in every session | not fixed: login must be reachable before any GLM session exists |
| F-41 | Generic tool rows | not fixed: model-facing texts and the M8 tool-row view are out of this task |
| V-01 | Settings inventory titles rows with file URLs | held: the user chose A on question-18, so V-01 waits for `split` and gets its own design on the new layout |
| V-02 | English provider group name in the model picker | fixed `886e38b` |
| V-03 | Settings section layout | fixed `ffd8c2d`. A section icon is not possible: the settings shell picks it by section id |
| V-04 | Progress motion without a running agent | fixed `0ff426f` |
| V-05 | Graph banner and legend cover nodes | fixed `939f00e` |
| V-06 | Notice box invisible in the light theme | fixed `6020b6d` |
| R-01 | Pill drops the last login error | fixed `2240b70` (L2 only, see §4) |
| R-02 | Unreadable-file banner points to an absent control | fixed `ef536a3` (L2 only, see §4) |
| R-03 | No L2 for the pill parsers; fake error code | fixed `2240b70`, `ef536a3` |
| R-04 | No after screenshot of the final redo note | fixed (screenshot `after-panel-detail-task-done-run.png`; final: `final-panel-detail-task-done-1.png`) |
| W-01 | Focus does not return to a graph node after its detail closes (found in this walkthrough) | fixed `20ed994` |

W-01 detail:

- Symptom: Tab from 回到重点 to a graph node, then Enter, opens the detail with focus on 返回. Escape then left focus on `body`, while list rows got focus back.
- Cause: `ui/src/graph/Panel.tsx` remembered the opener only when `document.activeElement` was an `HTMLElement`. Graph nodes are SVG `g` elements, made focusable for F-08.
- Fix: the opener accepts `HTMLElement | SVGElement`, as ORCHESTRATION.md already describes (关闭后回到打开它的元素).
- Check after restart 2:
  - Escape returns focus to `g.glmg-node` with `:focus-visible` (`final-panel-graph-focus-after-escape.png`).
  - The stacked path also returns focus to the node: open a node, open its child M0 文档沉淀, then press 返回 twice.
  - No L2 test was added: the repository has no DOM component test setup, and adding one needs a new dependency (DEVELOPMENT.md §11 rule 4). The focus logic lives in the React component, not in the model.

## 6. Console and DSH logs

| Capture | Lines | `ws://127.0.0.1:<port>/ingest` failed | `net::ERR_FAILED dsh-app://app/plugins/events` | HTTP 404 `api/changes.summary?…` | Other |
| --- | --- | --- | --- | --- | --- |
| `before-console.txt` (survey, 08:59 to 09:41) | 443 | 432 | 8 | 3 | 0 |
| `final-console-pass1.txt` (restart 1, 14:00 to 14:25) | 283 | 276 | 4 | 3 | 0 |
| `final-console.txt` (restart 2, 14:27 to 14:33) | 59 | 56 | 0 | 3 | 0 |

- All three classes are DSH's own. They are attributed to the combined plugin script URL, which also carries `dsh-glm-hourness-ui/client.js`. None of `ingest`, `plugins/events` or `changes.summary` occurs in `ui/src` or `ui/client.js`.
- Neither capture has an exception, a `glm-hourness graph panel:` line or `dsh-glm-hourness-ui: import failed`.
- The ingest port is now 9230 (9231 in the survey). It is DSH's inspector port and is unrelated to this bundle.
- DSH logs since the step began (13:59):
  - `%APPDATA%\@deepseek-ai\dsh-desktop\logs`: no new crash log (host, renderer or web-boot).
  - `dsh-err.txt`: only the DevTools line.
  - `dsh-out.txt`: update check (0.2.1-rc.3 is current), the inspector and web URLs, and `[llm-deepseek-account] model listing … loaded 2 model(s)`. Nothing new beyond startup.

## 7. Model-picker setting

`C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml`:

- sha256 `BDB2B388C5A39595EB533DF54C4E7C3DDF7BB41CD2D20619A0BBDD7772535872` before and after the step. Last written 10:47:07, before this step.
- `agent-default-model` config: `provider: deepseek-account`, `model: deepseek-flash`, `reasoningEffort: high`.
- The picker was opened once at its 模型 level and closed with Escape. The trigger still reads GLM-5.3-Flash High. No restore was needed.

## 8. Screenshot index

All files are in `.agents/tasks/ui-audit/`. The prefix is `before-` for the survey, `after-` for the fix iterations and `final-` for this step. A dash means no file exists for that phase.

| Surface / state | before | after | final |
| --- | --- | --- | --- |
| window | window-start, window-end | narrow-window | window-start, window-end, scratch-window |
| tab-graph strip; 开始 entry | tab-graph; tab-graph-start, tab-graph-start-window | - | tab-graph; tab-graph-start |
| panel-shell ready; missing; loading | panel-shell-ready; panel-shell-missing, panel-shell-ungrouped-window; panel-shell-loading | - | (in every panel shot); panel-shell-missing, panel-shell-ungrouped-window; - |
| panel-needs-you empty | panel-needs-you-empty-1 | panel-needs-you-empty-1 | panel-needs-you-empty-1 |
| panel-decisions; expanded; light | panel-decisions-1; panel-decisions-expanded; light-panel-decisions | panel-decisions-1; panel-decisions-expanded; light-panel-decisions | panel-decisions-1, -2; panel-decisions-expanded; light-panel-decisions |
| panel-doing; narrow; light; reduced motion | panel-doing-1; narrow-panel-doing; light-panel-doing; panel-reduced-motion | panel-doing-1, panel-doing-focus; narrow-panel-doing; light-panel-doing; panel-reduced-motion | panel-doing-1, -2, panel-doing-after-fix; (window is 1280 x 822); light-panel-doing; panel-reduced-motion |
| panel-live idle | panel-live-idle | panel-live-idle | top of panel-doing-1 |
| panel-graph mount; home; overview; zoom | panel-graph-initial; panel-graph-home; panel-graph-overview; panel-graph-zoom-in | panel-graph-initial; -; -; - | panel-graph-initial; panel-graph-home; panel-graph-overview; panel-graph-zoom-in |
| panel-graph filter menu; 全部; 只看等你的 | panel-graph-filter-menu; -filter-all; -filter-waiting | -; panel-graph-filter-all; -filter-waiting | panel-graph-filter-menu; -filter-all; -filter-waiting |
| panel-graph resize; remount | narrow-panel-graph-resized, -remounted, -window | narrow-panel-graph-wide, -resized, -remounted, -window | narrow-panel-graph-wide, -resized, -remounted, -window (+ .json) |
| panel-graph focus; reduced motion | -; panel-graph-reduced-motion | panel-graph-focus; panel-graph-reduced-motion | panel-graph-focus, panel-graph-focus-after-escape; panel-graph-reduced-motion |
| panel-detail done task | panel-detail-task-done-1 | panel-detail-task-done-1..3, -run | panel-detail-task-done-1..3 |
| panel-detail doing task | panel-detail-task-doing-1, -task-parity-1..2 | - | panel-detail-task-doing-1..3 |
| panel-detail feature M1 | panel-detail-feature-m1-1..2 | panel-detail-feature-m1-1..4 | panel-detail-feature-m1-1..4 |
| panel-detail question | panel-detail-question-1 | - | panel-detail-question-1..2 |
| panel-detail from graph | panel-detail-from-graph | - | (all four details above were opened from 图) |
| panel-detail keyboard; light | panel-detail-focus; light-panel-detail | panel-detail-focus; light-panel-detail | panel-detail-focus; light-panel-detail |
| F-01 scrolled list, switch, card, wheel | narrow-q01-doing-scrolled, -doing-open-last, -switch-agent, -agent-expanded-last, -agent-open-card, -wheel-chain | same six | same six (+ wheel-chain .json) |
| pill-glm closed; light | pill-glm-closed-wide, narrow-window; light-pill-glm-closed | pill-glm-closed; light-pill-glm-closed | pill-glm-closed; light-pill-glm-closed |
| pill-glm dialog | - (Q-03) | pill-glm-dialog, -health-end, -window; pill-glm-dialog-2, -2-health-end, -2-window | pill-glm-dialog, -health-end, -window (+ .json) |
| settings-glm dark; light; DSH section | settings-glm, settings-window; light-settings-glm; settings-dsh-general | settings-glm; light-settings-glm; - | settings-glm; light-settings-glm; - |
| host-cmd-graph cards | host-cmd-graph-cards | - | host-cmd-graph-cards |
| host-cmd-glm, host-health | host-cmd-glm-collapsed, -expanded | - | host-cmd-glm-expanded (collapsed cards in host-cmd-graph-cards) |
| host-notice-run | host-notice-run-start, -redo | - | host-notice-run-start, -redo |
| host-notice-model | host-notice-model-trace | - | host-notice-model-trace |
| host-slash-menu | host-slash-menu, -window, -g-window | same three | same three (+ .json) |
| plugin-manager-meta | plugin-manager-meta, -window; -meta-settings, -settings-global, -settings-rows | plugin-manager-meta | plugin-manager-meta, -window; -meta-settings-rows |
| model-picker-glm | model-picker-glm, -models, -effort, -window | model-picker-glm-models | model-picker-glm-models |
| host-tool-rows | host-tool-rows | - | host-tool-rows |

Gaps in before/after pairs for fixed findings:

- Pill dialog (F-02, F-04, F-18, F-34): no before image, because the survey did not open the dialog (Q-03). There are after and final images.
- States that need a write or a broken graph have no image in any phase: F-06, F-10 (running), F-11, F-12, F-13, F-28 (被推翻), F-29 banners, R-01, R-02. These are covered by L2 tests or code reading only.
- The rest have before, after and final images. F-08 and F-22 also have accessibility-tree JSON: `ax-*.json`, `after-ax-*.json` and `final-ax-graph.json`.

## 9. Residual issues and suggested follow-ups

1. V-01 (held): the Settings 内置插件 inventory still titles this bundle's 12 rows `file:///C:/Users/29596/.dsh/profil…`, which shows the user's home path in the `title` attribute (`final-plugin-manager-meta-settings-rows.png`). It waits for `split` by the user's choice (question-18, option A).
2. F-18 remainder: replacing the hand-rolled pill, dialog and settings section with ui-primitives components, after the M8 screenshot review and after `split`.
3. N-01: `react-dom` in `knip.jsonc` `ignoreDependencies` (`67dba8e`). DEVELOPMENT.md §10 asks for the user's approval of checker-configuration changes. The orchestrator should mention it to the user.
4. N-02: the messages of `e6fd0f2`, `5454d2e`, `7761f92` and `6020b6d` show `?` for their Chinese words. They are pushed and cannot be fixed without rewriting history.
5. N-04: `src/graph/labels.ts` `noGraphText` with an absolute `config.dir` and a session without a working directory. N-05: the `src/glm-llm/login-row.ts:76` comment still names the settings page as the parser of the credential line (it is the pill). Both are outside this task's files.
6. N-06 and §4: the 上次登录错误 row, the unreadable-file banner's 重新读取, the proposal control, the panel outcome lines and running 现场 are verified at L2 or by code reading only. A later batch L4 that creates such states in a scratch graph could close them.
7. Observation O-1 (pre-existing, not a regression): a decided question's detail shows the type tag 待决 next to the status 完成 (`final-narrow-q01-agent-open-card.png`, `final-panel-detail-question-1.png`). It reads as a contradiction. The type label comes from `src/graph/labels.ts` `question: '待决'`, which is unchanged since before the audit. It is a vocabulary decision for the user.
8. Observation O-2 (pre-existing, low): in the 图 view with filter 全部, the idle-agent badges sit on the top border of m2-9-l4 and touch the decision node above it (`final-panel-graph-filter-all.png`). They do not cover the node's text.
9. F-36 and F-41 remain M8 work: a command-card view and a tool-row view, both on undocumented seams.
10. Graph sync: this step did not write `docs/graph/`, because the orchestrator records progress there. The W-01 fix (`20ed994`) and this report are for the orchestrator to record on `m8-ui-audit`.
