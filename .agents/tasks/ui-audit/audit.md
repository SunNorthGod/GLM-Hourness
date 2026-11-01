# UI audit, static pass (graph task m8-ui-audit)

Workflow `wf_4f796b871f55d1fd`, step `static-audit` (read-only). Later steps: `desktop-survey`, the fix loop gated on `.agents/tasks/ui-audit/review.json` (`verdict` = `APPROVED`), `final-walkthrough`. The workflow shape fits this audit; it was not restructured.

Each finding below is meant to end with one line added by the fix steps: `Resolution: 已改 <commit>` or `Resolution: 不改，<reason>`. That is acceptance item 1 of m8-ui-audit.

## 1. Baseline

- Audited HEAD: `5b2e4122992713bbc31b86a44475062b71b025cc` (docs(graph): night-run policies and the UI audit task). During the audit the orchestrator committed `a1f705e` (m8-doing-layout done) and `3b0c71c` (m1-parity review pass 1). `git diff --stat 5b2e412 3b0c71c` touches only `docs/graph/`, so the audited UI and host sources are the same at both. HEAD when this file was written: `3b0c71cb29dd96bfa2b3561469abd577bee13baf`.
- Last UI source change: `afccf93` fix(ui): readable 正在做 view and 现场 in the graph panel. `ui/client.js` (git-ignored build artifact) was built 2026-10-29 00:08:52 from those sources; afccf93's message says the desktop was restarted on that bundle.
- `git status --porcelain` in the main checkout: `?? .kiro/` only. No tracked file has uncommitted changes.
- The step brief expected task m8-doing-layout to be editing `ui/src/graph/Doing.tsx`, `Live.tsx`, `NodeDetail.tsx`, `common.tsx`, `model.ts`, `styles.ts` and `tests/graph-panel-model.spec.ts`. That run has finished: its changes are commit `afccf93` (pushed), and node `m8-doing-layout` is done (`a1f705e`). These files are not in flux. The fix steps still re-read every file before editing, because the orchestrator commits to main while the workflow runs.
- In flux, unmerged branch `m1-parity` (worktree `.worktrees/m1-parity`, head `28a0604`, in review):
  - `ui/src/channel.js`: settings page text in `Panel()` (lines 289, 293, 302 on main). The pill code is not touched by the branch.
  - `src/glm-llm/zcode.ts`: `status()` now previews the located API key id, or `unresolved`; this feeds the /glm-status credential line the pill parses (the regex still matches both).
  - `src/glm-llm/models.ts`: catalog rules added; no display-name change seen in the diff.
  - `tests/health.spec.ts`.
  Findings in `ui/src/channel.js` carry `in flux: m1-parity`. Edits to `Panel()` text before m1-parity merges will conflict; pill edits should merge cleanly.
- Structural risk, not a file change: feature `split` (doing, design only) plans to split the bundle into a GLM channel package and an orchestration package. The pill and settings page (`channel.js`) and the graph panel would end up in different UI packages, so large rewrites of `channel.js` now would be moved again.

## 2. Surface inventory

Access for the desktop survey:

- CDP on port 9333. `.agents/tasks/m8-doing-layout/restart.ps1` closes DSH and starts it with `--remote-debugging-port=9333` (needs the desktop slot). Helpers: `.agents/tasks/m2-panel/cdp.mjs` (`eval`, `evalfile`, `shot`, `click`, `type`, `typefile`, `logs`, `reload`); `.agents/tasks/m8-doing-layout/tab.js` (click a view tab by label, return body size and text), `open-row.js` (open a row by title), `scroll.js`, `scroll-detail.js`, `clip.mjs` (screenshot of the visible `.glmg`), `shots.mjs` (one view top to bottom). Copy them into `.agents/tasks/ui-audit/` if they need changes.
- Panel root: `[...document.querySelectorAll('.glmg')].find(p => p.getBoundingClientRect().width > 0)`.
- Session used by the earlier read-only checks: 这是一次只读验证：不要修改 (GLM-Hourness workspace). It already holds glm-status, graph-run and graph-apply command cards and two 收到执行请求 cards.
- Controls that write state, never pressed in the survey: option buttons followed by 就这个 / 改成这个, and Enter in the reason input (F-12); 批准, 不要, 否决; 批注; 从这里开始做, 暂停, 改了验收条件后重做; in the pill, opening the dialog (runs /glm-status and appends a command card, F-02), 登录, 刷新状态, 登出 (deletes the local credential). Local UI state only, safe: view tabs, opening a node detail, 展开 / 收起, expanding a decision row (without picking an option), filter menu, zoom, pan, 全貌, 回到重点, typing `/` in the composer and clearing it.
- Screenshot names: `before-<surface id>-<state>.png` in `.agents/tasks/ui-audit/`; the final walkthrough uses `after-`.

| Id | Where it renders in DSH | UI source | Host-side text in src/ | How to reach; DOM landmarks | States to inspect; how to observe without writing state |
| --- | --- | --- | --- | --- | --- |
| tab-graph | Right sidebar page type 项目图: the tab strip title and the entry on the sidebar's 开始 page | ui/src/graph/tab.tsx | none | Right sidebar tab strip, tab 项目图. A new tab (`+`) opens 开始 with the entry 项目图, description 需要你的事、agent 定的事、正在做的, goal icon. Opening a new tab changes the saved sidebar layout; close it after | populated only. Read-only, except the layout note above |
| panel-shell | Frame of the 项目图 page: header (goal title, 实时 or 重新读取), view tabs with counts, validation banner, loading, missing and failed bodies, render-error boundary | ui/src/graph/Panel.tsx, tab.tsx (Boundary), source.ts, styles.ts | src/graph/parse.ts (issues), projection.ts (counts) | `.glmg-head .glmg-goal`, `.glmg-live`; `.glmg-tabs [role=tablist][aria-label=项目图视图] [role=tab]`; `.glmg-tabs > .glmg-notice` (图里有 N 处校验错误…); `.glmg-body[role=tabpanel]`; `.glmg-empty` (正在读项目图… / 这个工作区还没有项目图 / 项目图读不出来); boundary text 项目图面板出错了： | ready: current session. loading: transient, first open in a session not yet held since app start. missing: a session whose workspace has no docs/graph, e.g. one under 未分组 (a session with no workspace may show failed instead). not live, validation banner, boundary: not observable read-only; code reading |
| panel-needs-you | 需要你 view | ui/src/graph/NeedsYou.tsx, common.tsx (Options, Folded, Markdown) | src/graph/labels.ts, projection.ts | tab 需要你; cards `.glmg-card.wait` with `h3.glmg-card-title`; empty `.glmg-empty` with `.glmg-empty-mark` and the button 看看 agent 自己定的 N 件事 | empty: now (0 open human questions, 0 proposals). populated: needs a proposal or an open question in the graph; not observable read-only; code reading |
| panel-decisions | agent 定的 view | ui/src/graph/Decisions.tsx, common.tsx | projection.ts (recentDecisions, agentQueue), ui model.ts (DECIDED_BY_LABELS) | tab agent 定的; `.glmg-view > .glmg-section` (agent 正要定的, 最近拍板的); rows `.glmg-row` with a `.glmg-who` chip (class agent, relay or human); an expanded row shows 理由, 你说：, the options and 看这张卡的全部内容 | populated: 20 recent decisions (24 decided questions in the graph). expanded: click a row (local). pending agent questions, empty: not observable now |
| panel-doing | 正在做 view, node lists below 现场 | ui/src/graph/Doing.tsx, common.tsx (Part), model.ts (progressOf, progressText) | projection.ts (doing, ready, verificationDebt), labels.ts | tab 正在做; `section.glmg-part > .glmg-section` titles 进行中 · N, 可以开工 · N, 采纳了还没验证的决策 · N; rows `.glmg-row` with a `.glmg-dot` (class doing or todo) and `.glmg-meter .glmg-progress b` | populated now: 6 in progress (3 tasks, 3 features), 6 ready tasks, 2 unverified decisions. empty parts: not observable now |
| panel-live | 现场, first part of 正在做 | ui/src/graph/Live.tsx, agents.ts, model.ts (placeText, nobodyRunningText, timeAgo) | src/graph/live.ts (graphLive projection); DSH subagentCatalog and tokenUsage | first `section.glmg-part` (现场 · N 个在跑); `.glmg-notice`; rows `.glmg-agent` (running) and `.glmg-agent.quiet`; toggle `.glmg-toggle` | idle (nothing running): current session. children from before this app start: an older session. running: needs an agent turn, which writes a session and costs credits (orchestrator's call; earlier evidence in ORCHESTRATION.md §2.10, m2-8 L4). row off (还没有现场数据): not observable read-only |
| panel-graph | 图 view | ui/src/graph/GraphCanvas.tsx, model.ts (visibleGraph, FILTER_LABELS, statusText), agents.ts (placements) | src/graph/layout.ts | tab 图; `.glmg-toolbar` (filter `.glmg-filter[aria-haspopup=menu]`, buttons with aria-label 缩小 and 放大, 全貌, 回到重点); `.glmg-canvas svg[aria-label=项目图]`; `g.glmg-node[data-id]`; `.glmg-badge`; `.glmg-unplaced`; `.glmg-legend` | filters 没做完的, 全部, 只看等你的 (empty now); zoom, pan, 全貌, 回到重点; badges of idle agents. All local |
| panel-detail | Node detail over the current view | ui/src/graph/NodeDetail.tsx, common.tsx (Options, Outcome, Part, Folded), model.ts (historyText, statusText, presenceText) | labels.ts, src/graph/run.ts (RUN_LABELS, nodeRefusal, offersRedo) | click a row, node or 在「…」 link; `.glmg-detail`, `.glmg-detail-head` (返回), `.glmg-detail-body > h2`, `.glmg-crumbs button`, part titles `section.glmg-part > .glmg-section` (选项…, 让 agent 干活, 怎样算完成, 不做什么, 下面的节点 · …, 证据, 最近发生的, 批注), `.glmg-history`, `textarea[aria-label=批注]`, `.glmg-id code` | task in progress with run controls (m1-11, m1-parity); done task with the redo button (any done task); decided question (a q-* node); feature with children (m1); long body fold. node removed, proposal actions: not observable now |
| pill-glm | Composer dock entry GLM and its dialog | ui/src/channel.js (ChannelPill, PillBoundary, OutputLines, parseStatus) | src/glm-llm/login-row.ts, src/shared/health.ts, row health reasons | under the composer: `.glmh-anchor > button.glmh-pill[aria-haspopup=dialog]`, label `.glmh-pill-label` GLM, next to DSH's `[data-composer-stat]` entries; dialog `.glmh-dialog[role=dialog][aria-label="GLM 通道"]` | closed, wide and narrow window: read-only. dialog open: appends a /glm-status command card (F-02); at most once, in the read-only validation session, or skip and read the existing card. error fallback (label GLM followed by a warning sign, U+26A0): not observable |
| settings-glm | DSH Settings section GLM Hourness | ui/src/channel.js (Panel) | none; static facts that mirror src/glm-llm and src/shared/data-home.ts | DSH Settings (the survey records the path) → section labelled GLM Hourness → `.glmh-panel`, `h2.glmh-title` GLM Hourness 通道 | static; read-only. 复制 /glm-login only writes the clipboard; not needed |
| host-cmd-graph | Outcome lines of /graph-apply and /graph-run: under the panel control (`.glmg-result`, role=status) and as conversation command cards | ui/src/graph/apply.ts, common.tsx (Outcome) | src/graph/panel-row.ts (outcomeText, applyFromCommand), labels.ts (refusalText), run-control.ts (refused and outcome lines), engine.ts and mutation.ts (refusal messages) | conversation: DSH GenericCommandCard (`[data-variant=others][data-state]`, title graph-apply or graph-run, one-line summary, `pre` body for multi-line text) | existing cards in the read-only validation session. panel outcome lines need a write: not observable |
| host-cmd-glm | Output of /glm-login, /glm-status (credential line), /glm-logout: conversation cards, composer notices when typed, the pill's output box | ui/src/channel.js (prints it) | src/glm-llm/login-row.ts | conversation card titled glm-status | expand the existing glm-status card. Never run /glm-login or /glm-logout |
| host-health | Row health table after the credential line of /glm-status | ui/src/channel.js (raw), DSH command card (raw) | src/shared/health.ts (renderHealthTable, STATUS_LABELS); reasons in src/*/index.ts, src/graph/row-health.ts, src/graph/panel-row.ts | body of the expanded glm-status card | read the existing card |
| host-cmd-hourness | Output of /hourness | none | src/ui/index.ts, src/ui/panel.ts, src/workflow/morning-report.ts | conversation card titled hourness, if any session has one | read an existing card if there is one. Running /hourness appends a card (scratch session only); the text is covered by tests/hourness.spec.ts and tests/workflow.spec.ts |
| host-notice-run | Messages /graph-run sends the main agent: 收到执行请求 trigger cards (start, redo) and the injected pause note | none | src/graph/run-control.ts (header, startLines, redoLines, the stop lines, summaries) | conversation: DSH trigger card 收到执行请求 (expandable) in the read-only validation session | read the existing cards |
| host-notice-model | Model-facing notices: graph projection, todo reminder, peak reminder, tool-search announcement | none | `summary` strings in src/graph/reminder.ts:203, src/glm-prompt/todo-reminder.ts:137, src/glm-prompt/peak-reminder.ts:49, src/toolsearch/index.ts:197 | hidden from 对话 by DSH (dsh-client-ui-chat `isVisibleChatNode` drops plain context; a context with tool additions or removals keeps its row); check the 轨迹 tab | read-only |
| host-slash-menu | This bundle's entries in the composer `/` command menu | none | descriptions in src/glm-llm/login-row.ts (Chinese), src/ui/index.ts:62 (English), src/graph/panel-row.ts:170, 177 (English) | type `/` in the composer; Escape and clear the draft after (draft only, nothing sent) | read-only |
| plugin-manager-meta | Plugin manager and Settings plugin inventory entries of both packages | none | locale/zh.json, locale/en.json, package.json `description`, ui/package.json `description`, icon.svg | left nav 插件; Settings plugin inventory | read-only; do not toggle rows |
| model-picker-glm | Composer model selector: GLM model and effort names | none | src/glm-llm/models.ts (GLM_MODELS names; GLM_REASONING_EFFORTS names Low, High, Max). In flux: m1-parity | composer model button (e.g. GLM-5.3-Flash High) | open and close with Escape, no selection |
| host-tool-rows | Conversation tool rows of this bundle's tools (graph_*, memory) and guard denials | none (DSH generic tool rows) | src/graph/tools.ts, src/memory/tools.ts, src/guard/rules.ts | conversation tool rows | read-only; out of scope for wording, see F-41 |

## 3. Findings

Severity: high, a core interaction looks broken or the UI writes noise into user data; medium, readability, consistency, semantics or accessibility problems the user meets in normal use; low, polish, rare states, or recorded decisions not to change.

Contrast figures are computed from rc.3 palette values (dsh-client-ui-theme lib/client.js): dark `--dsw-alias-label-tertiary` #adb2b8, light #81858c; panel background taken as #151517 (dark) and #ffffff (light). They are estimates until the survey reads computed colors.

| Id | Surface | Sev | Criterion | Title | In flux | Proposal |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | panel-detail, panel-shell | high | layout, correctness | Detail overlay sits inside the scrolling body; views share one scroll offset | no | fix |
| F-02 | pill-glm, host-cmd-glm | high | conversation noise, stale state | Automatic /glm-status runs from the pill append command cards; the login poll is shorter than the link | m1-parity (file) | fix |
| F-03 | pill-glm | medium | readability | Pill label truncates to `G.` when the right sidebar is open | m1-parity (file) | fix |
| F-04 | pill-glm, host-health | medium | readability | Dialog prints raw /glm-status Markdown (heading and table) in an 11 px monospace box | m1-parity (file) | fix |
| F-05 | pill-glm, settings-glm | medium | theme, contrast | Four theme tokens used in channel.js do not exist; fixed fallbacks always apply | m1-parity (file) | fix |
| F-06 | host-cmd-graph | medium | text, error state | Panel write refusals show the engine's English, LLM-directed message and hint | no | fix |
| F-07 | panel-doing, panel-detail | medium | readability, consistency | Lists use file-name order: parents after children, 1.10 before 1.2 | no | fix |
| F-08 | several panel views | medium | accessibility | Rows, card titles and graph nodes cannot be reached or opened by keyboard | no | fix |
| F-09 | panel-live | medium | accessibility | Dimmed 现场 rows (opacity 0.6) fall below 4.5:1 in both themes | no | fix |
| F-10 | panel-live | medium | status semantics | The idle main agent is folded and counted under 另有 N 个 agent 已停下 while a child runs | no | fix |
| F-11 | panel-live and others | medium | stale information | Relative times freeze while the tab stays mounted | no | fix |
| F-12 | options picker | medium | error prevention | Enter in the reason input decides without the busy guard and during IME composition | no | fix |
| F-13 | panel-detail | medium | consistency, error prevention | 不要 in the detail rejects at once; 需要你 asks for a reason first | no | fix |
| F-14 | panel-decisions | medium | consistency, empty state | agent 定的 view is not on the Part layout the other views use | no | fix |
| F-15 | panel-detail | medium | text | History lines do not say the result of status, verify, link and supersede entries | no | fix |
| F-16 | panel-graph | low | readability | Banner lists idle agents whose focus is a closed node | no | fix |
| F-17 | panel-graph | medium | layout | Initial view and 回到重点 may not show the anchor node | no | confirm, then fix |
| F-18 | pill-glm, settings-glm | medium | consistency | Hand-rolled pill, dialog and settings page; dialog not portaled; placement assumes 320 px | m1-parity (file) | partial fix |
| F-19 | panel-detail, host-cmd-graph | low | text | Redo button says the acceptance changed even when it did not | no | fix |
| F-20 | host-slash-menu | low | text | Mixed-language command descriptions; panel commands listed without hints | no | fix |
| F-21 | host-notice-model | low | text | English notice summaries, if 轨迹 shows them | no | conditional |
| F-22 | panel-shell, panel-live | low | accessibility | Count badges and failed-tool chips have no accessible text; aria-controls point to missing panels | no | fix |
| F-23 | panel-decisions, panel-graph | low | theme, contrast | Fixed purple; agent chip text below 4.5:1 | no | fix |
| F-24 | all panel views | low | typography | Seven font sizes, two fractional | no | optional |
| F-25 | needs-you, decisions, detail | low | text, consistency | Goal title repeated where lists drop it; agent提的 spacing; 倾向 without label | no | fix |
| F-26 | panel-detail | low | navigation, keyboard | 返回 closes instead of going back; no Escape; focus not managed | no | fix |
| F-27 | panel-detail | low | consistency, dead code | Child rows differ from the shared row; unreachable proposed-dot branch | no | fix |
| F-28 | panel-detail | low | status semantics | Verification tag tones: 被推翻 shown as info | no | fix |
| F-29 | panel-shell | low | error states | Validation banner without the issue; boundary without retry; failed node reads dropped silently | no | fix |
| F-30 | panel-graph | low | empty state, readability | Empty filter result is a blank canvas; corner badge unexplained; legend incomplete | no | fix |
| F-31 | panel-live | low | text, semantics | No-one-running note is long and counts container features | no | fix |
| F-32 | panel-live | low | consistency | Token format 282k tokens next to DSH's 282K tok | no | fix |
| F-33 | settings-glm | low | text, stale information | Static page, naming, silent copy failure, no pointer to the pill | m1-parity (lines) | fix after merge |
| F-34 | pill-glm | low | states, error prevention | 检查中… never resolves on an unknown command; default plan before status; one-click 登出 | m1-parity (file) | fix |
| F-35 | plugin-manager-meta | low | text, stale information | Bundle description omits the project graph; UI package has no meta or icon | no | fix |
| F-36 | host-cmd-glm, host-health, host-cmd-hourness | low | readability | Multi-line Markdown outputs show raw in DSH command cards | no | not now, reason given |
| F-37 | docs and comments | low | stale information | Comments and docs that no longer match the UI | no | fix with related code |
| F-38 | panel-doing, panel-detail | low | status semantics | Progress counts direct work children only (底层 0/1 while M1 is 18/21) | no | not fixing |
| F-39 | panel-shell | low | text | Tab name agent 定的 covers human decisions too | no | not fixing |
| F-40 | pill-glm | low | scope | Pill shows in non-GLM sessions | m1-parity (file) | not fixing |
| F-41 | host-tool-rows | low | scope | Generic tool rows for graph and memory tools and guard denials | no | not in this task |

Counts: 41 findings; high 2, medium 15, low 24; 8 in flux (F-02, F-03, F-04, F-05, F-18, F-33, F-34, F-40, all through `ui/src/channel.js`).

### F-01 Detail overlay inside the scrolling body (high)

- Surface: panel-detail, panel-shell. Files: ui/src/graph/Panel.tsx:101-107; ui/src/graph/styles.ts:20 (`.glmg-body{position:relative;...;overflow:auto}`), styles.ts:136 (`.glmg-detail{position:absolute;inset:0;...}`).
- Criterion: layout, correctness.
- Description: `NodeDetail` renders inside `.glmg-body`, which is the scroll container and the overlay's containing block. An absolutely positioned child of a scroll container is placed at the top of the scrolled content, sized to one viewport of it, and scrolls with the content. When the body is scrolled (lower rows of 正在做, decisions far down 20-row agent 定的, 在「…」 links), the detail opens above the visible area and the click appears to do nothing; scrolling at the end of a long detail can chain to the body and pull the overlay away. Second symptom of the shared container: the body keeps its scroll offset across view switches, so a view can open scrolled to the middle when the previous view was scrolled and the new one is tall enough. Earlier screenshots never show it because `open-row.js` opens rows with the body at scrollTop 0.
- Evidence: code reading. Needs Q-01.
- Proposed fix: render the detail outside the scroller, for example a non-scrolling `.glmg-stage` (position:relative; flex:1; min-height:0; display:flex; flex-direction:column) that holds `.glmg-body` and, as an absolute sibling, `.glmg-detail`; add `overscroll-behavior:contain` to `.glmg-detail-body`; mark the list `inert` while the detail is open so Tab cannot land behind it; reset `.glmg-body` scrollTop on view change (or keep one offset per view). Pair with F-26 for focus.
- Verify: `npm run build`, `npm run preflight`, `npm test`; L4: scroll 正在做 to the end, open the last row, the detail is in view; switch views after scrolling, each opens at its top.
- In flux: no.

### F-02 Automatic /glm-status runs from the pill (high)

- Surface: pill-glm, host-cmd-glm. Files: ui/src/channel.js:186-201 (poll), 215 (poll starts after 登录), 221-232 (first open), 261; src/glm-llm/login-row.ts:43 (credential line with the account), 53 (the link is valid 5 minutes).
- Criterion: conversation readability, stale information, user data.
- Description: the pill runs /glm-status through `remote.commands.execute`. DSH appends `command/run` and `command/done` to the receiving agent's session log for every admitted run (reference/dsh-desktop-0.2.1-rc.3/dsh-commands/README.md, Lifecycle events) and the chat shows each as a command card (glm-status card next to graph-run and graph-apply in `.agents/tasks/m8-detail-layout/after-m1-parity-1.png`). The pill runs it once on the first open per mount, and after 登录 every 5 s until logged in or 12 attempts. One login can add 12 cards, each storing the full health table and the account id (visible in the card summary in `.agents/tasks/m8-doing-layout/before-doing-window.png`). The poll gives up after 60 s while the link is valid for 5 minutes, so a slower authorization leaves the dialog at 未登录.
- Proposed fix: drop the poll; after 登录 show the link and 授权完成后点「刷新状态」; keep the last parsed status in a module-level cache shared by every pill (this app run, with the time it was read) and auto-run only when the cache is empty; all other runs follow a click. With runs tied to clicks, the account id in the credential line can stay.
- Verify: build, preflight, test; L4 in a scratch session: opening the pill in two sessions adds at most one card; no further card without a click.
- In flux: m1-parity (same file; the branch edits only `Panel()` text).

### F-03 Pill label truncates (medium)

- Surface: pill-glm. Files: ui/src/channel.js:59 (`.glmh-anchor{...min-width:0...}`), 64 (`.glmh-pill-label{min-width:0;overflow:hidden;text-overflow:ellipsis}`).
- Criterion: readability.
- Description: with the right sidebar open the dock shrinks the label to `G.` or `G` (`.agents/tasks/m8-detail-layout/after-m1-parity-1.png`, `.agents/tasks/m2-panel/shot-03.png`); at full width it reads GLM (`.agents/tasks/m8-doing-layout/before-doing-window.png`, `.agents/tasks/m2-panel/shot-01.png`). DSH's stat pills also shrink, but keep a readable prefix; one letter is not readable.
- Proposed fix: keep the three letters whole (`flex:none` and `overflow:visible` on the label, a `min-width:max-content` on the element that is the dock's flex item; Q-02 says which element that is).
- Verify: L4 screenshot at the narrow width.
- In flux: m1-parity (file).

### F-04 Raw /glm-status Markdown in the dialog (medium)

- Surface: pill-glm, host-health. Files: ui/src/channel.js:101-114 (OutputLines), 258, CSS `.glmh-out` at line 82; src/shared/health.ts:142-152.
- Criterion: readability.
- Description: the dialog prints the whole text in an 11 px monospace box at most 180 px high with `word-break:break-all`: the credential line, a blank line, `## 行健康（会话 <id>）` and an 11-row Markdown table with pipes. DESIGN.md §2.5 and HANDOFF.md #19 already defer the table presentation to M8 (both attribute the raw text to the settings page; it is the pill).
- Proposed fix: render the part after the credential line with `MarkdownText` from ui-primitives (in the module table, already declared in ui/src/primitives.d.ts) at the dialog's 12 px scale, or parse the `| row | status | reason |` lines into the existing `dl`. Keep the host format: the L3 probe parses the table (scripts/probe/run-probe.mjs, comment near line 591).
- Verify: build, preflight, test; L4 dialog screenshot if Q-03 allows opening it.
- In flux: m1-parity (file).

### F-05 Undefined theme tokens in channel.js (medium)

- Surface: pill-glm, settings-glm. Files: ui/src/channel.js:78-79, 84, 96 (`--dsw-alias-accent`, `--dsw-alias-color-primary`), 80-81, 83 (`--dsw-alias-danger`), 87 (`--dsw-alias-font-size-title-md`), 96 (`color:#fff`).
- Criterion: theme consistency, contrast.
- Description: these four custom properties are not defined anywhere in the rc.3 runtime (searched 1,144 JS and CSS files under reference/dsh-desktop-0.2.1-rc.3; no official package uses them). The `var()` fallbacks always apply: link and primary text #2d8fd6, the settings primary button #247bbf with #fff text, danger #e05a5a, title 18 px. They ignore the light theme; on white, #2d8fd6 and #e05a5a are about 3.5:1 and 3.6:1 for 12 px text. `--dsw-font-mono` (channel.js:82, 92; styles.ts:96, 165) is undefined too, but official packages use it the same way with the same fallback, so it stays.
- Proposed fix: accent to `--dsw-alias-state-business-primary` (the panel's `--g-accent`), danger to `--dsw-alias-state-error-primary`, the title to DSH's settings scale (Q-13), the primary button to ui-primitives `Button variant="primary"` or DSH's own primary colors instead of #fff on a fixed blue.
- Verify: build, preflight, test; L4 light-theme screenshot (Q-07).
- In flux: m1-parity (file).

### F-06 English, LLM-directed refusals shown to the human (medium)

- Surface: host-cmd-graph. Files: src/graph/labels.ts:91-93 (refusalText), src/graph/panel-row.ts:82, 86-87; messages from src/graph/engine.ts and mutation.ts.
- Criterion: text quality, error state.
- Description: /graph-apply runs only for the human, yet a refusal prints the engine's message and hint written for the LLM, for example `图没有写入（stale_revision）：node "<id>" is at revision <a>, not <b>。read the projection again and decide on the current state`. The panel shows it in red under the control and the conversation card repeats it. Likely human cases: stale_revision (the agent wrote the node just before the click), bad_transition (already approved or decided elsewhere), graph_invalid, not_found.
- Proposed fix: in `applyFromCommand`, map the engine code to a Chinese line with an action the human can take, keeping the code in parentheses, for example stale_revision 这个节点刚被改过，面板已读到新内容，看一眼再点一次; bad_transition 节点已经不在可以这样改的状态（现在：<状态>）; graph_invalid 图里有校验错误，写入一律被拒；让 agent 修，或用 git 还原节点文件; not_found 图里没有这个节点了. Leave refusalText for LLM paths. Update tests/graph-panel.spec.ts:69-82 and ORCHESTRATION.md §2.10 (拒绝时是「图没有写入（错误码）：说明。正路」).
- Verify: L2 (`npm test`); panel-row.ts is DSH runtime code, so `npm run probe` (scenario glm-graph-panel).
- In flux: no.

### F-07 File-name order in panel lists (medium)

- Surface: panel-doing, panel-detail. Files: ui/src/graph/Doing.tsx:49-54 (lists keep projection order), NodeDetail.tsx:89 (children in store order); order source src/graph/parse.ts:42-45 (files sorted by name, code-unit order, `.json` included).
- Criterion: readability, consistency between views.
- Description: `m1-11.json` and `m1-parity.json` sort before `m1.json` ('-' before '.'), and `m1-10` before `m1-2`. On screen, 进行中 lists 1.11 L4 真机验收 and coding-plan … before their parent M1 底层收口 (`.agents/tasks/m8-doing-layout/after-doing-1.png`), and M1's 下面的节点 reads 1.1, 1.10, 1.11, 1.2 … (`after-detail-m1.png`). The 图 view orders siblings by creation time (src/graph/layout.ts:320-329), so lists and the graph disagree.
- Proposed fix: a pure comparator in ui/src/graph/model.ts with the layout's rule (time of the first history entry, then id), applied to 进行中, 可以开工, 采纳了还没验证的决策 and the detail's children; test it in tests/graph-panel-model.spec.ts with ids m1, m1-2, m1-10, m1-parity. Do not change engine or layout order (graph.svg would change; docs/graph belongs to the orchestrator).
- Verify: L2; L4 screenshot of 正在做 and the m1 detail.
- In flux: no.

### F-08 Keyboard cannot open nodes (medium)

- Surface: panel-doing, panel-decisions, panel-detail, panel-needs-you, panel-graph. Files: ui/src/graph/Doing.tsx:26, Decisions.tsx:29, 46, NodeDetail.tsx:126, NeedsYou.tsx:27, GraphCanvas.tsx:90, 308.
- Criterion: accessibility (keyboard reachability, roles).
- Description: the elements that open a node are `div`, `h3` and SVG `g` with onClick only: no tabIndex, no role, no key handling. A keyboard user cannot open rows in 正在做, decisions in agent 定的, children in the detail, card titles in 需要你, or nodes in 图. The SVG has `role="img"`, which hides its interactive children from assistive technology. Reachable today: view tabs (SegmentedTabs handles arrows, Home, End), buttons, 在「…」 links, crumbs, 展开.
- Proposed fix: rows become `role="button"` with `tabIndex={0}` and Enter/Space handlers (or the title becomes a `button`), with nested controls outside the row handler (Decisions' expanded area already stops propagation); card titles become a `button` inside the `h3`; graph nodes get `tabIndex={0}`, `role="button"`, an `aria-label` (title and status line) and Enter/Space; the SVG becomes `role="group"` with the same label. Keep the browser focus ring.
- Verify: build, test; L4 Tab walk (Q-06).
- In flux: no.

### F-09 Dimmed 现场 rows below contrast (medium)

- Surface: panel-live. File: ui/src/graph/styles.ts:85-86 (`.glmg-agent.quiet{...opacity:.6...}` and hover to 1).
- Criterion: accessibility (contrast).
- Description: idle and stopped rows are dimmed with opacity 0.6. Their meta text (`--g-ink3`) ends at about 3.8:1 in the dark theme and about 2.1:1 in the light theme; the 上次在「…」 link is dimmed the same way. Full strength appears only on hover, which keyboard and touch users never get.
- Proposed fix: no opacity; make the row secondary through color only (title `--g-ink2`, meta `--g-ink3`, muted mark), all at full strength.
- Verify: L4 screenshots in both themes (Q-07).
- In flux: no.

### F-10 Idle main agent folded as stopped (medium)

- Surface: panel-live. File: ui/src/graph/Live.tsx:84-90 (`stopped` includes the idle main agent; `folded` is stopped plus earlier while anything runs).
- Criterion: status semantics.
- Description: while any child runs, every agent that is not running folds behind 另有 N 个 agent 已停下, including the main agent. With background dispatch (ORCHESTRATION.md §3, the main agent does not wait for its child) this is the normal state, and the main agent, which is idle and waiting for the human, is then hidden and counted as 已停下.
- Proposed fix: always show the main agent's quiet line; fold only children; toggle text 另有 N 个子 agent 已停下. Move the grouping into a pure helper with an L2 test if convenient.
- Verify: L2; the running state on L4 only if the orchestrator allows a scratch run.
- In flux: no.

### F-11 Relative times freeze (medium)

- Surface: panel-live, panel-detail, panel-needs-you, panel-decisions. Files: ui/src/graph/agents.ts:55-64 (`useNow` ticks only while active), Live.tsx:67, 83, NodeDetail.tsx:142, NeedsYou.tsx:31, Decisions.tsx:52.
- Criterion: stale information.
- Description: the tab is `keepMounted`. In 现场, `now` stops when nothing runs, frozen at the moment the last agent stopped, so 刚刚调过工具 stays 刚刚 for hours; a later tool time than the frozen `now` is clamped to 刚刚 by timeAgo. Other relative times (history, cards, decisions) are computed per render and change only when the graph changes.
- Proposed fix: one shared ticker, every second while something runs and every 60 s otherwise, passed to every timeAgo call; the absolute time in a `title`.
- Verify: L2 (timeAgo unchanged); L4: leave the panel open over a minute and see times advance.
- In flux: no.

### F-12 Enter in the reason input (medium)

- Surface: panel-needs-you, panel-decisions, panel-detail (Options). File: ui/src/graph/common.tsx:181.
- Criterion: error prevention.
- Description: Enter decides without the `writer.busy` check that disables the button, so two quick Enters send two decide commands; the second fails (bad_transition or stale_revision) and its refusal replaces the success line (see F-06). The handler also ignores IME composition: DSH's own shell code checks `nativeEvent.isComposing || keyCode === 229` before acting on Enter (an inline textarea editor and the composition guard behind `observeComposition`, both in `reference/dsh-desktop-0.2.1-rc.3/dsh-web-frontend/dist/assets/index-BXV-oxvX.js`), because the Enter that commits a Chinese composition otherwise submits a half-typed reason. Not testable read-only: any Enter there writes a real decision.
- Proposed fix: return early unless `event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229 && !writer.busy`.
- Verify: build, test; no L4 on the real graph.
- In flux: no.

### F-13 Reject without confirmation in the detail (medium)

- Surface: panel-detail. Files: ui/src/graph/NodeDetail.tsx:35-44, 113; compare NeedsYou.tsx:47-77.
- Criterion: consistency, error prevention.
- Description: in the detail, 不要 rejects at once with the fixed reason 在面板里否决 (the node becomes dropped); in 需要你 the same button opens a reason input with 否决 and 取消. The detail's buttons also sit outside any Part, unlike every other action group.
- Proposed fix: one shared proposal control in common.tsx used by both places (reject asks for an optional reason and confirms), placed in `<Part title="批准或否决">` in the detail.
- Verify: build, test; code reading (no proposals in the graph now).
- In flux: no.

### F-14 agent 定的 view not on the Part layout (medium)

- Surface: panel-decisions. Files: ui/src/graph/Decisions.tsx:19-21, 27, 40; styles.ts:22-23 vs 146-149.
- Criterion: consistency between views, empty state.
- Description: afccf93 put 正在做 and the detail on `Part` (a rule above each section, the same title gap, counts in titles). agent 定的 still uses bare `.glmg-section` titles with other margins, no counts and no rule between its two groups. With only pending agent questions, 最近拍板的 shows a title with nothing under it.
- Proposed fix: `Part` titles `agent 正要定的 · N` and `最近拍板的 · N`; a `.glmg-notice` 还没有拍过板的事 inside the second part when it is empty.
- Verify: L4 screenshot beside 正在做 (Q-09).
- In flux: no.

### F-15 History lines without results (medium)

- Surface: panel-detail. File: ui/src/graph/model.ts:252-262 (historyText).
- Criterion: text quality.
- Description: lines name the operation but not its result: a status change reads 改状态：<reason> without the new status (the entry carries `from` and `to`), verify does not say the state, link and unlink do not name the edge, supersede does not name the replacement. Example: 3 小时前 · agent · 改状态：L4 两条验收满足… (`.agents/tasks/m8-detail-layout/after-m2-9-l4-2.png`).
- Proposed fix: status 改为「完成」 (STATUS_LABELS[to]); verify 验证为「沙盒验证」 (VERIFICATION_LABELS); link and unlink 加连线 依赖 → <id> / 删连线 …; supersede 被 <by> 取代; extend the history test in tests/graph-panel-model.spec.ts (line 111).
- Verify: L2.
- In flux: no.

### F-16 Graph banner lists idle agents (low)

- Surface: panel-graph. Files: ui/src/graph/GraphCanvas.tsx:166, 325-331.
- Criterion: readability.
- Description: the top-left banner lists every agent whose place is not drawn, including idle agents whose focus is a closed node hidden by the default filter: 主 Agent：焦点被筛选隐藏了 · L4 验证：焦点+睡眠120秒：焦点被筛选隐藏了 (`.agents/tasks/m8-doing-layout/after-graph-1.png`). In the usual idle state it is noise over the top of the canvas.
- Proposed fix: list only running agents (idle ones are in 现场), or only agents whose focus node is open.
- Verify: L4.
- In flux: no.

### F-17 Graph initial view (medium, needs confirmation)

- Surface: panel-graph. Files: ui/src/graph/GraphCanvas.tsx:193-204 (home), 212-218 (placed once), 156-158 (filter state).
- Criterion: layout.
- Description: `after-graph-1.png` was taken right after `tab.js` switched to 图 (the canvas mounts fresh). Most of the canvas is empty and the visible nodes (M3 to M8, all 未开始) sit against the right edge with their children cut off. home() should centre, at 45% of the width and a readable zoom, the first waiting node, else the main agent's focus, else the first task in progress, else the goal. Code reading does not settle the cause; candidates: the first ResizeObserver size is not the final size and the view is placed only once, or the chosen anchor is not where the rule expects. A filter change keeps the old view.
- Proposed fix: after Q-05. Likely: re-home on size changes until the user pans or zooms, and on filter changes.
- Verify: L4 (Q-05).
- In flux: no.

### F-18 Hand-rolled pill, dialog and settings page (medium, partial)

- Surface: pill-glm, settings-glm. Files: ui/src/channel.js:130 (comment says portaled), 143-153 (place), 240-264 (dialog), 275-307 (settings page).
- Criterion: consistency with DSH (ORCHESTRATION.md §13 定案: build from ui-primitives; HANDOFF.md rows 47 and 80: the UI's look is not accepted).
- Description: the trigger, dialog, buttons, cards and settings page are hand-rolled with copied token values. The dialog renders inside the dock, not portaled (DSH's DialogPill portals its dialog), so `position:fixed` breaks if a composer ancestor is transformed or filtered. `place()` clamps the left edge with a 320 px width while the dialog is 340 to 460 px wide, so near the right edge it can overflow by up to about 140 px. The dialog has `role="dialog"` but focus does not move into it.
- Proposed fix now: portal the dialog to `document.body` with `react-dom` (in the module table), clamp with the measured width, move focus to the dialog on open and back on close; plus F-02 to F-05 and F-34. Reason not to replace everything with primitives (Pill, Button, MarkdownText, SettingsForm) in this run: ROADMAP.md M8 lists 替换现有设置页与 pill；按截图迭代，用户终审, which needs the user's review on screenshots, and `split` will move `channel.js` into the GLM package.
- Verify: build, preflight, test; L4 dialog position at the narrow width if Q-03 allows.
- In flux: m1-parity (file).

### F-19 Redo label claims a change (low)

- Surface: panel-detail, host-cmd-graph. Files: src/graph/run.ts:21-25 (`redo: '改了验收条件后重做'`), 48-53 (isRunEntry), ui/src/graph/NodeDetail.tsx:70.
- Criterion: text quality.
- Description: the redo button shows on every done task, including tasks whose acceptance never changed, and its label says the acceptance changed; the note above it says 已完成，可以按现在的验收条件重做.
- Proposed fix: label 按现在的验收条件重做, true in both cases. RUN_LABELS also builds history notes (runNote) and agent messages, and `isRunEntry` finds the last start or redo by the note prefix; it must also accept the old prefix 人在面板里点了「改了验收条件后重做」, which exists in the real graph (nodes m2-9-l4, m2-9). Update tests/graph-run.spec.ts:239; the probe imports runNote, so it follows.
- Verify: L2; run-control.ts and run.ts are DSH runtime code: `npm run probe` (glm-graph-run).
- In flux: no.

### F-20 Command descriptions and hints (low)

- Surface: host-slash-menu. Files: src/ui/index.ts:62, 65, 73; src/graph/panel-row.ts:170, 177.
- Criterion: text quality.
- Description: the `/` menu lists hourness, graph-apply and graph-run with English descriptions next to the Chinese glm-* entries; the two panel commands are listed to the human without input hints. /hourness errors are English (`Usage: /hourness (no arguments)`, `hourness report failed: …`).
- Proposed fix: Chinese descriptions (for example 晨报与积分用量; 项目图面板用：以人的身份改一次图; 项目图面板用：开始、暂停或重做一个任务), `input: { hint: 'start|stop|redo <节点 id>' }` for graph-run, Chinese usage and error lines. rc.3 commands have no hidden flag, so the panel commands stay listed. No test or probe asserts these strings.
- Verify: L2; L3 probe with the host batch; Q-10 before and after.
- In flux: no.

### F-21 English notice summaries (low, conditional)

- Surface: host-notice-model. Files: src/graph/reminder.ts:203, src/glm-prompt/todo-reminder.ts:137, src/glm-prompt/peak-reminder.ts:49, src/toolsearch/index.ts:197.
- Criterion: text quality.
- Description: `summary` strings are English: project graph projection of <id> (<reason>), todo reminder, peak hours <date>, deferred tools: N added, M removed. 对话 hides plain context, but a context with tool additions or removals keeps its row, so the tool-search announcement may show. 轨迹 is unknown (Q-11).
- Proposed fix: only if Q-11 shows them, Chinese summaries; the bodies stay (model-facing, partly verbatim-gated). Only tests/graph-run.spec.ts asserts a summary (the run-control one, already Chinese).
- Verify: L2, L3.
- In flux: no.

### F-22 Accessible text for counts and chips (low)

- Surface: panel-shell, panel-live. Files: ui/src/graph/Panel.tsx:25-28, 96-98; Live.tsx:47.
- Criterion: accessibility.
- Description: count badges are bare numbers inside the tab label (a screen reader reads 需要你3); failed tool chips are marked by color and a `title` only; SegmentedTabs sets `aria-controls` for every tab while only the selected tab's panel id exists.
- Proposed fix: visually hidden text or `aria-label` for counts (需要你，3 项; agent 待定 N 项) and failed chips (出错); one stable panel id for all tabs.
- Verify: L4 accessibility tree (Q-06).
- In flux: no.

### F-23 Fixed purple (low)

- Surface: panel-decisions, panel-graph. Files: ui/src/graph/styles.ts:9 (`--g-purple:#a371f7`), 69.
- Criterion: theme, contrast.
- Description: rc.3 has no purple token; the decision purple is fixed. The agent 定的 chip text on its 16% tint is about 2.8:1 in the light theme and about 4.2:1 in the dark theme at 11 px.
- Proposed fix: keep the purple for strokes and fills; derive the chip text color so it reaches 4.5:1 in both themes, for example `color-mix(in srgb, var(--g-purple) 70%, var(--g-ink))`.
- Verify: L4 in both themes.
- In flux: no.

### F-24 Font scale (low, optional)

- Surface: all panel views. File: ui/src/graph/styles.ts (11, 11.5, 12, 12.5, 13, 14, 16 px).
- Criterion: typography consistency.
- Description: seven sizes, two fractional (11.5 for meta, 12.5 for text, notices, quotes and quiet titles). DSH settings rows use 12 and 14 (description 12px/18px, title 14px/22px).
- Proposed fix: 11.5 to 12 and 12.5 to 13 (or 12), 11 kept for section labels and chips; check row heights. Reason it may stay: cosmetic; change only if the survey screenshots show a problem.
- In flux: no.

### F-25 Goal repetition, spacing, missing label (low)

- Surface: panel-needs-you, panel-decisions, panel-detail. Files: ui/src/graph/NeedsYou.tsx:30-31, Decisions.tsx:33, NodeDetail.tsx:101.
- Criterion: text quality, consistency.
- Description: row paths drop the goal because the header names it (Doing.tsx:23-24), but cards and pending rows write 挂在「<parent>」下 with the full goal title when the parent is the goal, and the detail crumbs start with the full goal title (two lines in `after-m1-parity-1.png`). Card meta writes agent提的 without the space used elsewhere (agent 定的, agent 来定). Pending rows show 倾向 A without the option label.
- Proposed fix: omit 挂在「…」下 when the parent is the goal; the first crumb reads 目标 (still a button to the goal); agent 提的; 倾向 A <label>.
- Verify: L4.
- In flux: no.

### F-26 Detail navigation and focus (low)

- Surface: panel-detail. Files: ui/src/graph/NodeDetail.tsx:83, 96; Panel.tsx:106.
- Criterion: navigation, keyboard.
- Description: 返回 closes the detail even after moving through crumbs or children (no back stack); Escape does nothing; focus is not moved into the detail on open nor returned to the opener on close.
- Proposed fix: a stack of opened ids (返回 pops, the last pop closes), Escape closes, focus handling with F-01.
- Verify: L4 (Q-06).
- In flux: no.

### F-27 Detail child rows (low)

- Surface: panel-detail. File: ui/src/graph/NodeDetail.tsx:124-131.
- Criterion: consistency, dead code (AGENTS.md 不留死代码).
- Description: child rows show only the status line, while Doing rows show type and progress. The `child.status === 'proposed' ? 'proposed'` branch is unreachable because `needsHuman()` is true for proposed nodes, so proposed children get the red wait dot, never the dashed proposed dot.
- Proposed fix: reuse Doing's row without the path (type, status, progress for features); test for proposed before the wait case.
- Verify: L4 detail of m1.
- In flux: no.

### F-28 Verification tag tones (low)

- Surface: panel-detail. File: ui/src/graph/NodeDetail.tsx:106.
- Criterion: status semantics.
- Description: 未验证 is warning and every other state is info (blue), including 被推翻 and 被取代.
- Proposed fix: 沙盒验证 and 真机验证 success, 被推翻 danger, 被取代 neutral (all tones exist in the rc.3 Tag CSS).
- Verify: L4 on a decision node.
- In flux: no.

### F-29 Error states (low)

- Surface: panel-shell. Files: ui/src/graph/Panel.tsx:62-64, 100; tab.tsx:33-39; source.ts:81-86.
- Criterion: error and loading states.
- Description: the validation banner gives a count but not which file or issue; the render-error boundary shows the message with no way back except reopening the tab; a node file whose read fails is dropped silently and the node vanishes without an issue. The missing state explains the directory; an entry point to create or adopt a graph belongs to feature `bootstrap`, not to this task.
- Proposed fix: the banner names the first issue (file, message) with the rest behind 展开; the boundary gets 重新加载 (reset state); a failed read adds an issue. Keep the missing text until bootstrap.
- Verify: L2 for source.ts with the fake remote in tests/graph-panel-model.spec.ts.
- In flux: no.

### F-30 Graph view gaps (low)

- Surface: panel-graph. Files: ui/src/graph/GraphCanvas.tsx:98-105 (corner badge), 156-158, 332-338 (legend).
- Criterion: empty state, readability.
- Description: 只看等你的 with nothing waiting draws an empty canvas with only the legend (the case now). The corner count badge (a check mark, U+2713, followed by N) has no tooltip; it counts closed children the filter hides, decided questions included, and reads like progress. The legend has no entry for 提议 (dashed) or 风险.
- Proposed fix: an empty notice on the canvas (没有等你的事 / 这个筛选下没有节点); a `title` on the badge (N 个已关闭的子节点被筛掉了); legend entries for 提议 and 风险.
- Verify: L4.
- In flux: no.

### F-31 No-one-running note (low)

- Surface: panel-live. Files: ui/src/graph/model.ts:214-217; Doing.tsx:52.
- Criterion: text quality, semantics.
- Description: the note shown whenever nothing runs is two long sentences (`after-doing-1.png`); its count is every node in progress including container features (6 now: 3 tasks, 3 features), while the point (the work may be elsewhere) is about tasks.
- Proposed fix: shorter, for example 这个会话里没有 agent 在跑。进行中的 3 个任务可能在别的会话或 DSH 之外推进。; count tasks; the explanation 现场只看得见本会话的主 Agent 和它派出的子 agent as a `title` or a second dimmed line. Update the test at tests/graph-panel-model.spec.ts:89-97.
- Verify: L2.
- In flux: no.

### F-32 Token format (low)

- Surface: panel-live. Files: ui/src/graph/agents.ts:74-78; Live.tsx:27.
- Criterion: consistency.
- Description: rows read 282k tokens; DSH's composer stat reads 282K tok.
- Proposed fix: DSH's format (uppercase K and M, tok).
- Verify: L2 if tokensText is tested; L4.
- In flux: no.

### F-33 Settings page (low, after the m1-parity merge)

- Surface: settings-glm. Files: ui/src/channel.js:275-307, 317.
- Criterion: text quality, stale information.
- Description: a static page that repeats what the pill shows; it names the bundle GLM Hourness while the plugin manager says GLM-Hourness; it lists the commands but not the GLM pill, which is the main way to log in; a failed copy is silent; the credential-lifetime text changes on m1-parity.
- Proposed fix after m1-parity merges: GLM-Hourness; point to the pill (在输入框下方的 GLM 按钮里登录、查看状态); a failure note for copy. Reason not to show live status here: the settings section has no session, and commands need one.
- In flux: m1-parity (these lines).

### F-34 Pill states (low)

- Surface: pill-glm. Files: ui/src/channel.js:238 (检查中…), 251 (套餐 default), 262 (登出), 312 (unknown command).
- Criterion: states, error prevention.
- Description: when /glm-status is unknown (glm-login row off, line 312) or its text does not parse, the status stays 检查中… for good; 套餐 shows coding-plan before any status is known; 登出 deletes the local credential in one click, and logging back in needs the browser flow.
- Proposed fix: status 未知 with the reason (glm-login 行没有加载 / 返回内容读不懂); 套餐 shows — until known; 登出 asks once (再点一次确认登出, a few seconds).
- Verify: build, test; L4 closed-pill only, or code reading.
- In flux: m1-parity (file).

### F-35 Plugin manager meta (low)

- Surface: plugin-manager-meta. Files: locale/zh.json:4, locale/en.json:4, ui/package.json:5.
- Criterion: text quality, stale information.
- Description: the main bundle's description lists the prompt mirror, lazy tools, guard, journal, memory and /hourness, not the project graph and its panel. The UI package has no locale meta and no icon, so the inventory falls back to the technical name dsh-glm-hourness-ui and the English package.json description (rc.3 dsh-host-plugin-inventory: description "after locale and package-field fallback").
- Proposed fix: name the project graph in both locale descriptions; give the UI package locale meta and an icon the way the main package exports them (`./locale/*.json`, `./icon`), after reading how dsh-host-plugin-inventory resolves them; update `files` in ui/package.json.
- Verify: `npm run preflight`; L4 (Q-12).
- In flux: no.

### F-36 Markdown outputs in command cards (low, not now)

- Surface: host-cmd-glm, host-health, host-cmd-hourness. Files: src/shared/health.ts:142-152; src/workflow/morning-report.ts:34-77; src/ui/index.ts.
- Criterion: readability in the conversation.
- Description: DSH's GenericCommandCard shows the outcome text as a one-line summary and multi-line text in a `pre`. /glm-status and /hourness are Markdown, so the glm-status summary reads `glm-zcode：已登录（…） ## 行健康（会话 session-…` (`before-doing-window.png`) and the bodies show `#`, `##`, `|` and `- `.
- Reason not to fix now: the alternative is a `conversation.chat.commandview` entry keyed by command name, which rc.3 uses internally (CommandNodeView) but does not document, and the L3 probe parses the table format. /hourness's in / out / total labels stay too: morning-report.ts:19 names them as the ZCode panel vocabulary on purpose (tests/workflow.spec.ts:59 asserts it). Track the card view under M8.
- In flux: no.

### F-37 Stale comments and docs (low)

- Surface: docs and comments. Files: ui/index.js:6-7 (a Remote service later; DEVELOPMENT.md §5.6 says there is no third-party path), ui/src/channel.js:130 (portaled), docs/DESIGN.md §2.2 row glm-hourness/ui (settings page and pill, no graph panel), §2.5 (raw /glm-status on the settings page; 9 rows, now 11), docs/HANDOFF.md:13 (dsh-glm-hourness-ui@0.1.0, now 0.2.0), 20 (纯 JS，不参与 tsc), 90 (#19, settings page instead of the pill).
- Criterion: stale information.
- Proposed fix: correct each with the related code change in the same commit (AGENTS.md 文档).
- In flux: no.

### F-38 Progress over direct children (low, not fixing)

- Surface: panel-doing, panel-detail. File: ui/src/graph/model.ts:172-192.
- Description: progress counts direct work children: 底层 shows 工作完成 0/1 (its one work child M1 is open) while M1 is 18/21 (`after-doing-1.png`).
- Reason not to fix: afccf93 kept the direct-children rule on purpose so the count matches the 下面的节点 list the user can check, and ORCHESTRATION.md §2.10 documents it. A recursive count is a product decision for the user.

### F-39 Tab name agent 定的 (low, not fixing)

- Surface: panel-shell. File: ui/src/graph/Panel.tsx:78.
- Description: the tab lists every recent decision, including 你拍的 and 你在对话里说的; its badge counts the agent's pending questions, while the 需要你 empty-state button counts decided ones (看看 agent 自己定的 N 件事).
- Reason not to fix: the four view names come from the user-approved prototype (ORCHESTRATION.md §2.10); renaming is the user's call. F-22 adds an accessible label to the badge.

### F-40 Pill in every session (low, not fixing)

- Surface: pill-glm. File: ui/src/channel.js:319-321.
- Description: the pill shows in every composer, DeepSeek sessions included.
- Reason not to fix: login must be reachable before any GLM session exists, and the client does not know a new session's route before its first request.
- In flux: m1-parity (file).

### F-41 Generic tool rows (low, not in this task)

- Surface: host-tool-rows. Files: src/graph/tools.ts, src/memory/tools.ts, src/guard/rules.ts.
- Description: graph_* and memory tool calls and guard denials render as DSH's generic tool rows with model-facing text (English, JSON).
- Reason: the texts serve the model; the planned UI is the M8 tool-row view and guard card (ORCHESTRATION.md §13), whose seams are unverified (ROADMAP.md 核实清单 10, 11).

## 4. Questions the desktop survey must answer visually

Each question names the findings it settles. Record screenshots and the raw values asked for in `.agents/tasks/ui-audit/survey.md`.

- Q-01 (F-01). 正在做: scroll `.glmg-body` to the end and click the last row (第一理念：在图上编程); screenshot; record `body.scrollTop`, the body's and `.glmg-detail`'s bounding rects. agent 定的: expand a decision near the end (no option click) and press 看这张卡的全部内容; same records. In the m1 detail, scroll `.glmg-detail-body` to the end and keep wheeling (CDP `Input.dispatchMouseEvent` type `mouseWheel`): does `.glmg-body` move? Switch views after scrolling: does the new view open at its top?
- Q-02 (F-03). Composer dock with the right sidebar open, at the current window size and at 1280x822: screenshot; record computed `flex-shrink`, `min-width`, `overflow` and width of `.glmh-anchor`, `.glmh-pill`, `.glmh-pill-label` and each ancestor up to the dock row.
- Q-03 (F-02, F-04, F-18). Default: skip, and F-04 and F-18 stay on code reading. Only if the orchestrator has already allowed one /glm-status card in the read-only validation session: open the pill once, screenshot the dialog (position against the pill and the viewport, width, output box), close with Escape, press no dialog button.
- Q-04 (F-36, F-02). In the read-only validation session, expand the existing glm-status, graph-run and graph-apply cards; screenshot summary and body. Look for any hourness card in other sessions.
- Q-05 (F-17, F-16, F-30). Switch to 图 from another view (the canvas remounts); screenshot the first view; record the canvas rect and the rect of the expected anchor (`g.glmg-node[data-id=…]`: first waiting node, else the main agent's focus if drawn, else the first task in progress); press 回到重点, then 全貌, screenshot each; set the filter to 只看等你的, then 全部, screenshot each.
- Q-06 (F-08, F-22, F-26). Keyboard: focus the view tabs, press Tab repeatedly in each view and inside a detail, and log `document.activeElement` (tag, class, text) per press; note whether the focus ring shows; press Escape inside the detail. Read the accessibility tree (CDP `Accessibility.getFullAXTree`) for tabs, counts, rows and the SVG.
- Q-07 (F-05, F-09, F-23). Light theme without saving a preference: find how the theme is applied (attribute or class on `html`), switch it in the DOM only, screenshot 正在做 (现场 rows), agent 定的 (chips), a detail, the settings section and the closed pill, then switch back. Record computed colors of quiet-row meta text, links and chips. If the theme cannot change without saving a preference, record that and skip.
- Q-08 (F-07). Record the row order of 进行中 and of the m1 detail's 下面的节点 (titles).
- Q-09 (F-14, F-24). Screenshot agent 定的 and 正在做 at the same scroll position; record computed margins of section titles and the font sizes in use.
- Q-10 (F-20). In a GLM-Hourness session, type `/` in the composer without sending, screenshot the menu with this bundle's six commands, then clear the draft.
- Q-11 (F-21). 轨迹 tab of the read-only validation session: are this bundle's notices listed, and with which labels?
- Q-12 (F-35). Plugin manager (left nav 插件) and the Settings plugin inventory: screenshot both packages' entries (title, description, icon).
- Q-13 (F-33, F-05). Record the navigation path to the GLM Hourness settings section; screenshot it beside a DSH section; does DSH draw its own title above our `h2`; record DSH's section title size.
- Q-14 (panel-shell). Open a session outside the GLM-Hourness workspace (for example under 未分组); screenshot the panel state (missing or failed) and its text.
- Q-15 (tab-graph). Screenshot the right sidebar tab strip. Default: no new tab. Only if the orchestrator accepts the saved-layout change: open the 开始 page with `+`, screenshot the 项目图 entry, close the tab.
- Q-16 (model-picker-glm). Open the model picker, screenshot the GLM entries and the effort menu, close with Escape.
- Q-17 (narrow sidebar). At the right sidebar's minimum width (or the 1280 window): screenshot the top of 正在做, a detail and the 图 toolbar; check tab labels with counts and how far the 现场 note wraps.
- Q-18 (motion). CDP `Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce`: breathing dots, the 实时 ping and graph halos stop; reset afterwards.
- Q-19 (all). Collect page console messages, exceptions and failed requests for the whole survey (`cdp.mjs logs`); list anything from dsh-glm-hourness-ui or `glm-hourness graph panel:`.

Not observable read-only, code reading only: populated 需要你, proposal actions, panel outcome lines, the validation banner, failed and not-live states, the boundary, Enter in the reason input (F-12), and running 现场 (default: skip; a scratch agent run writes a session and costs credits, so it needs the orchestrator's go-ahead).

## 5. Notes for the fix steps

- Gates (DEVELOPMENT.md §1.1, §2, §12): every change `npm run build`, `npm run preflight`, `npm test`. Host rows touched (src/graph/panel-row.ts, run-control.ts, run.ts; src/ui/index.ts; src/glm-llm/login-row.ts; src/shared/health.ts): `npm run probe` once for the batch (the glmsandbox junctions point to the main checkout's dist; a worktree needs a temporary profile, DEVELOPMENT.md §3). UI-only changes: L4 in the final walkthrough, after restarting DSH (a refresh can 404 the client half, DEVELOPMENT.md §7, 2026-10-28 row).
- Tests to touch: tests/graph-panel-model.spec.ts (F-07 comparator, F-15 history, F-31 note, F-10 grouping if extracted, F-29 source read failure), tests/graph-panel.spec.ts:69-82 (F-06), tests/graph-run.spec.ts:239 (F-19). Leave tests/health.spec.ts and the probe's table parsing alone (F-04 keeps the host format).
- Docs in the same commits: ORCHESTRATION.md §2.10 (detail placement, refusal lines, 现场 presentation, redo label), DESIGN.md §2.2 and §2.5, HANDOFF.md (F-37). Do not write `docs/graph/`; the orchestrator records graph state.
- `ui/client.js` comes from `npm run build`; never edit it. New ui-primitives exports must be declared in ui/src/primitives.d.ts with props taken from rc.3 call sites (`.agents/tasks/m2-panel/primitives.txt` lists the exports and sample calls). No new dependencies.
- `ui/src/channel.js`: keep `Panel()` text untouched until m1-parity merges (F-33); pill changes can go in now.
- Suggested order, each step buildable: (1) F-01 with F-26 (Panel.tsx, styles.ts); (2) model.ts helpers and their tests: F-07, F-15, F-31; (3) keyboard and labels: F-08, F-22, F-25, F-27, F-28; (4) 现场: F-09, F-10, F-11, F-32; (5) actions: F-12, F-13, F-14; (6) graph: F-16, F-17 after Q-05, F-30, F-23; (7) channel.js: F-02, F-03, F-04, F-05, F-18 (partial), F-34; (8) host text with one probe run: F-06, F-19, F-20, F-21 if Q-11 says so; (9) meta and docs: F-35, F-37, and F-29, F-24 if still worth it.
