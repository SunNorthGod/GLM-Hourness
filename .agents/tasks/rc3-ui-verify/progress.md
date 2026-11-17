# rc3-ui-verify progress

Lane: rc3-ui-verify (main checkout @ 4437dd3a, dist rebuilt clean,
build-info `4437dd3 dirty:False`). Isolated rc.3 desktop instance only (CDP,
no system input, never the person's instance/inputs). Launch recipe:
`.llm/rc3uiv/scripts/start.ps1`, port 9357, marker `--glm-hourness-rc3uiv`,
DSH_HOME `.llm/rc3uiv/dsh-home` (B10 profile trio, package junctions to this
checkout's packages, credentials/device-mid COPIED read-only 1374/36 B —
delete at teardown), workspace `%TEMP%\rc3uiv-ws\ws-main` (outside the repo,
git init + one seeded proposed goal-1 via the graph CLI), storages/
workspace.json written with python json.dump per the real schema. rc.3
welcome-window rule: pass it in its own window (添加 API Key → 稍后配置),
NEVER CDP-close the welcome target. Hard rule: never touch the person's
inputs or instance; own instance closes via CDP Browser.close only.

Task: desktop verification of the rc.3 UI adaptation (b335f1dd, CSS anchors
on the GLM channel dialog + the wish popover) — the surfaces the desktop-l4-new
lane recorded broken (finding 4): 1 GLM pill + dialog, 2 wish button/交给主
Agent + the two anchored dialogs, 3 panel pages (项目图 tab, loops board page,
rules board page), 4 onboarding hero/cards regression glance.

Note on history: the archived rc3-ui lane record (`.agents/tasks/rc3-ui`,
commit 4437dd3a) already carries a [desktop] entry with shots c0–c11 taken
against its WORKTREE build at 05:50–06:00. This lane re-runs the verification
against the LANDED main build (4437dd3a dist) as briefed; its verdicts stand
on their own evidence below.

## Log

- [prep] 2026-11-18 07:3x+08 — main @ 4437dd3a, tracked tree clean (git
  status empty); installed app FileVersion 0.2.2-rc.3 verified; both bundle
  ui clients carry the anchor pair (grep: 2 hits each of
  anchor-name/position-anchor forms in packages/glm/ui/client.js and
  packages/hourness/ui/client.js); no DSH process at start; desktop-lock
  created. Scratch home assembled: B10 profile trio copied, junctions
  dsh-glm-zcode→packages/glm + dsh-hourness→packages/hourness verified
  (build-info.json reachable through both), credentials/device-mid copied
  (sizes 1374/36 B, chmod 444), goal-1 seeded proposed into the temp
  workspace (graph CLI exit 0), workspace.json written via python json.dump.
- [boot + welcome PASS] 2026-11-18 07:41+08 — pid 15332, port 9357; the
  rc.3 welcome window popped on the fresh user-data-dir as recorded, passed
  in its own window (添加 API Key → 稍后配置, two CDP clicks in the
  welcome target); it closed itself, app alive, never CDP-closed.
  Workspace rc3uiv loaded from the python-written workspace.json (no stuck
  picker). Shots v0-welcome.png, v1-after-welcome.png.
- [item 4 PASS] onboarding hero/cards on the opening screen (v1 shot):
  探索未至之境 hero + rc3uiv/标准模式 chips + 「◎ GLM · 上手」 hero pill
  (glmh-hero), the wish card 把这个工作区交给主 Agent with 写一句你想做的 /
  接着推进现有项目, /wish line, 第一次用? 看看项目图怎么用› — the panel-2
  surfaces render unchanged on the landed build. Boot console clean:
  every cdp.mjs run so far reports 0 other errors, 0 entries naming our
  packages.
- [item 1 PASS] GLM pill + dialog (shots v2-conversation.png,
  v3-glm-dialog.png): one flash turn (session-3b9798c2) switches to the
  conversation view; the dock renders `.glmh-pill` 「◎ GLM · 上手」(later
  「◎ GLM」 once the logged-in read recorded the 上手 half) next to
  `.hw-pill` 「交给主 Agent」 — no 「GLM ⚠」 boundary state, no wish
  RenderGuard failure. The dialog opens through the anchor pair: the
  trigger's `.glmh-anchor` span carries computed anchor-name
  `--glmh-pill-r1o`, the portaled `.glmh-dialog` carries position-anchor
  `--glmh-pill-r1o` (dialog inline `--glmh-anchor` both sides); full
  content renders (已登录, coding-plan, quota 5h/weekly, 各行健康 glm-llm
  etc. 生效). Geometry (in-page measurement): left edge 828.58 == anchor
  left edge exactly (leftAligned), top pinned at 60px =
  max(12px, --dsh-frame-overlay-top 60px), computed bottom inset 34px =
  (vh−anchor top)+8 → the CSS band lands the panel 8px above the trigger
  when content fits; in-viewport on both axes. Note for the record: with
  the full health table the content exceeds the band (728px) and the
  max-height cap (750px) wins, so the dialog pins at the top frame inset
  and its bottom overlaps the dock row by 14px — that is the design's own
  "taller than the band → pinned at the top" fallback, the same geometry
  the removed JS hook produced (commit message), content scrolls
  (overflow-y auto). Not a placement bug; measured, not assumed.
- [item 2 PASS] wish button + popover (shot v4-wish-popover.png): `.hw-pill`
  「交给主 Agent」 renders in the dock; its popover opens with anchor-name
  `--hw-wish-r1p` (anchor) == position-anchor `--hw-wish-r1p` (dialog);
  measured gap above trigger EXACTLY 8px (dialog bottom 788, pill top
  796), left edges aligned (901.24 both), fully in viewport, height 157
  fits the band; content = 让主 Agent 接手这个工作区…/命令是 /wish…/主
  Agent 用强一点的模型/写一句你想做的 + 接着推进现有项目 — the full
  ordinary-session content. Both b335f1dd dialogs verified positioned on
  rc.3. rc.3 driver notes reconfirmed: 发送消息 is aria-label only (click
  by selector, not text), composer insertText needed the post-session
  reload, Escape via guarded key works.
- [SELF-INFLICTED QUOTA BURN, for the record] the l4-w1/l4-new MSYS trap
  bit twice here: a literal "/loops" argv became "C:/Program Files/Git/loops"
  (path conversion), typed AND sent once before I noticed — one real flash
  turn (~87K tok mostly cache, 21 s) asking what that path meant; left
  unanswered, turn ended. Second attempt was typed but caught before send
  (cleared via selection + Backspace key event). All composer input from
  then on went through cdp.mjs typefile (message files), zero further
  mangling. Same lesson as w1's setup fix 2; do not pass composer text as
  argv, ever.
- [item 3 PASS] panel pages, all reachable and rendering (command rows
  first: /loops and /rules sent via typefile rendered as rc.3 command rows
  in-session and wrote .llm/loops/view.json + .llm/rules/view.json in the
  workspace, no model turns):
  - 项目图 tab: the right sidebar's 开始 pane lists the 项目图 card
    (v6-rightbar.png) — the l4-new finding-4 "tabs do not appear" does NOT
    reproduce; clicking it opens the panel tab (v7-graph-panel.png): tab
    labeled 项目图 with its own close button, header rc3uiv 核验项目 +
    green 实时 badge, the guide page (一眼看看 / 你要做的只有回话 / 让主
    Agent 接手 / 规则板 preview), footer jump lines (规则板› 循环板› 经验›
    指标› 上手说明› 整张图›).
  - loops board page (footer 循环板›, v8-loops-board.png): renders in full —
    循环板 title + 到点了或碰到某件事 tagline, 还没有主 Agent：在输入框打
    /wish, the SCHEDULE_NOTE paragraph, 此刻/下一个高峰 line, the plugin
    entries as cards (依赖文件变了之后 / 有事等你太久时 / GLM 高峰开始时 /
    GLM 高峰结束时, each with 详细点), footer jump lines intact.
  - rules board page (footer 规则板›, v9-rules-board.png): renders in full —
    规则板 · 一件事要发生时，让不让做, 撤下的规则：无 + 高峰 line, 会挡住
    动作的门 (合入前的检查 / 必须全审的改动), 要改 line, 默认规则与高峰模式
    with builtin:glm-peak-pricing and the 无影响/少做/不做 three-mode card,
    footer jump lines intact.
- [console] whole-session tally (cdp-log.jsonl, 1282 entries): every
  entry is the known host noise (ws://127.0.0.1:9230/ingest inspector
  channel failures); 0 exceptions, 0 entries naming our packages, no
  `useAnchoredPosition` throw, no wish RenderGuard message. Nothing for a
  fix lane.
- [teardown] 2026-11-18 07:55+08 — Browser.close CLEAN (no #32770;
  process count 0 within 8 s). credentials.json + device-mid.txt copies
  deleted from scratch dsh-home/glm-hourness (find over the whole scratch
  dir: 0 hits); profile junctions removed (junction targets — the real
  packages — verified intact); dsh-home, user-data-dir and
  %TEMP%\rc3uiv-ws wiped; desktop-lock owner.txt deleted (real ~/.dsh
  untouched all along). Kept as evidence: .llm/rc3uiv/shots (v0–v9),
  scripts, desktop-out/err.txt, seed-goal.json.
- [quota] flash tier only, scratch-home usage.jsonl: 10 GLM calls, input
  15.4K + cache-read 99.8K, output 636 (one intended turn + the stray
  mangled-argv turn above; dock showed 已用 3%).
