# desktop L4 batch (2026-11-18 wave) progress

Lane: desktop-l4-bat (main checkout @ 429b1e38). Verification lane, no code
changes, no merges, no pushes. Isolated desktop instance only (CDP, no system
input). Launch recipe adapted from `.llm/desktop-l4-w1/scripts/start.ps1`:
port 9353, marker `--glm-hourness-l4bat`, scratch root `%TEMP%\l4bat\`
(dsh-home + user-data-dir + ws-* all under it, deleted at teardown),
credentials/device-mid COPIED read-only into the scratch home (deleted at the
end). Do NOT touch `.worktrees/ablation-trial`, `.worktrees/comms-split`.

Checks: 1 clock 下次+real fire (39441048) / 2 loop_note after reconcile fix
(62bb7d7b) / 3 双板洪水复验 / 4 UI 常态批 / 5 patrol spot (m7-7 desktop).

## Log

- [prep] 2026-11-18 — main @ 429b1e38, working tree clean on tracked files.
  dist was stale (build-info `ca950d9` from the previous wave); probe-lock /
  probe-lock-2 / desktop-lock all empty (no holders), so rebuilt per §5:
  `npm run build` exit 0, build-info now `429b1e3` (dirty=true from untracked
  task docs only — acceptable per §1.1). No DSH process was running.
- [instance] Desktop runtime is `@deepseek-ai/dsh-desktop/0.2.2-rc.3`
  (Electron 44.7.0 / Chrome 152). Fresh user-data-dir did NOT show the
  welcome window this time (DSH home had `.credentials.yaml` + anonymous-id
  copies) — went straight to the main UI. The window started MINIMIZED
  (Windows parked it at -21333; outerWidth reported 159x27, viewport was
  fine). Operating posture: CDP only; screenshots via `Page.startScreencast`
  (frames flow even while parked). Later restored my own window with
  ShowWindow(SW_RESTORE) on pid 64552's MainWindowHandle — window STATE
  management of my own instance, no input injection; screencast frames
  resumed after. CDP notes: Electron 44 has no Browser.setWindowBounds /
  Target.createTarget(newWindow); dsh host inspector on 9230 is a bare
  cross-realm (no require) — cannot drive windows from it.
- [setup] Scratch root %TEMP%\l4bat: dsh-home (profile b10-shape: dsh-base +
  dsh-web-app + both our packages + 9 experimental; patch turns glm-llm on,
  flash/low, danger-full-access, OPERATE row ON for check 2), junctions to
  this checkout's packages, credential copies read-only (sizes: credentials
  1374 B, device-mid 36 B, .credentials.yaml 551 B, anonymous-id 37 B),
  workspaces ws-a (l4bat-a) + ws-b (l4bat-b) git-inited. ws-b pre-seeded for
  check 5: branch hz/test @23da7b49 (unmerged), graph goal root + task test
  done (commit evidence), via graph CLI.
- [checks 1+2 PASS] Consent path in ws-a (session-662f5f11, /wish made it
  main agent, takeover tk-q5g3m3fh, new project; goal-1 proposed by the
  agent as the question card's required parent). Both loop_propose →
  propose_to_human (kind question) → my chat answer → record_human_answer →
  harness accept: journal.jsonl seq 1-6, `via: chat`, relay = my verbatim
  answers, questions question-1/question-2.
  - CHECK 1 (clock 下次 + real fire, 39441048): entry u-d7c064d7 (person
    script entry, once) — view.json showed `next: 2026-11-18T02:54:47.000Z`
    exactly the consented `at` while armed (下次 from the clock); at the time
    the clock FIRED it: metrics stream `loop-fired` 02:55:13.443Z
    {entry u-d7c064d7, run run-640fafe103db, source person, trigger once,
    occurrenceAt 02:54:47.000Z} then `loop-done` outcome ran, exits [0],
    58 ms; script ran — `fired-flag.txt` written 02:55:13.490Z (26 s after
    occurrence = the beat), script log at .llm/loops/logs/u-d7c064d7/. First
    real-desktop confirmation of clock-fire.
  - CHECK 2 (loop_note after reconcile fix 62bb7d7b): entry u-afc9c868
    (person tell-main, once) — `loop-fired` 02:55:48.033Z + `loop-done`
    outcome delivered, delivery: dsh (messageId) — the DSH timer delivered;
    the delivery arrived in the session as a 自动化任务 message at 10:55,
    the main agent called loop_note and it SUCCEEDED: notes.jsonl
    {entry u-afc9c868, run run-6da3cd420098, text "l4bat tell-main
    核验成功"} + metrics `loop-note` event. The 「这一项还没有交给你的运行」
    refusal is gone — reconcile bound the delivered one-shot to a run and
    loop_note hung the note on it. Screenshot shots/c12-delivery.png.
  - Pre-check detour, worth recording: a plain session in ws-a is role root
    (lead), NOT main agent — loop_propose refuses with forbidden until /wish
    makes the session the project's main agent; design-row tools
    (propose_to_human/record_human_answer) are also absent off the main
    agent. Two burned flash turns before the /wish fix (my prompt assumed
    any session works). Also: my first prompt lost its computed `at` values
    (bash ate ${...} in the heredoc); steer corrected mid-turn.
- [check 3 PASS] 双板复验, ws-a + ws-b both with boards alive and
  main-agent sessions (ws-b got its own via /wish, takeover on; its /wish
  also put goal-1「桌面批次核验双板」on the seeded graph). Snapshot pair
  %TEMP%\l4bat\t0.json (03:13:14Z) → t5.json (03:23:15Z, 10 min): ws-a
  journal 6→6, removed-tasks 130→130, notes 1→1, view 26→26 entries,
  metrics loop-* 139→139; ws-b removed-tasks 20→20, view 24→24, metrics
  25→25, metricsLast unchanged after the 03:13 arming beat. Zero new
  records in both boards across the window — the mutual delete/recreate
  flood is gone. The 自动化任务 page lists the two boards' reminders as
  doubled rows (one per project, 4+4), counts stable; UI badge "4 个自动
  化任务" per workspace, stable. rc.3 note: at board arming the reconcile
  sweep logged ~20 「删掉/没删成 DSH 里的旧提醒」 lines at 11:13 in ws-b's
  board page (matches removed-tasks 20), then nothing — arming-time sweep,
  not a loop.
- [check 4 PASS] UI 常态批 on rc.3:
  - /loops command card (ws-a live session): 24 plugin entries + 你自己加的
    2 项 with 上次/ outcomes, 在等的 0 件; 下次 times all sane (晨报
    11-19 08:30, 周报 11-23 09:00, 夜间巡检 11-19 02:30, 记忆候选 18:35,
    下班前 18:05). Full text extracted from the DOM; screenshot
    shots/c4-loops.png (collapsed row + delivery + loop_note turn).
  - /glm-status command card renders in the live rc.3 session: 已登录
    (coding-plan), 高峰/额度 lines, full 行健康 table (21 rows; loops row
    notes the tell-main 「已跑过」; operate's three time entries visible on
    the board). Text extracted from DOM. Note (scratch-config artifact, not
    a defect): my patch ships no data-row projectHome override, so data 行
    部分生效 and workflow 未生效 无项目目录 — the person's profile carries
    those overrides; L3 probe scenarios cover workflow with configured
    homes.
  - Panel pages: right sidebar (「打开右侧边栏」header button → 开始 menu →
    项目图) opens the project panel for ws-b: 项目图 page renders (桌面批
    次核验双板 · 巡逻样本目标, 实时; user-view sections + rules/loops
    previews), 循环板 panel page renders (entries + 下次 + 最近跑过的),
    规则板 panel page renders (all guard/design/rules rules with 生效 +
    7-day counts, glm-peak detector 下一次 11-18 14:00). Screenshots
    shots/c4-panel-graph.png / c4-panel-loops.png / c4-panel-rules.png.
    The 自动化任务 page (loops board page with filters + 下次计划时间)
    also renders: shots/c4-auto-page.png.
  - GLM pill dialog: the empty-state hero「GLM · 上手」is one-shot by design
    (ui/src/channel.js: once the channel reads logged-in, onboarding is
    marked done and the hero hides; label shortens to「GLM」). The live
    composer dock pill (glmh-pill, status bar "GLM") opens the「GLM 通道」
    dialog: 已登录/coding-plan/模型/高峰/额度/各行健康(本会话) + 登录/刷新
    状态/登出; opens and positions on-screen (dialog 460x641 at x=480,
    y=147). One observation, not chased to root: measured dialog center
    cx=710 vs viewport center 640 (code anchors left:50% top:38% translate
    -50%,-50% — expected cx 640); fully visible, nothing clipped.
    Screenshot shots/c4-pill-dialog.png.
- [check 5 PASS] Patrol spot (m7-7 desktop confirmation, ws-b): seeded
  branch hz/test @23da7b49 (unmerged, content commit) + graph task `test`
  done with commit evidence (via graph CLI). Main agent called
  hourness_report {kind:'patrol'}; the report rendered in conversation:
  工作树与分支「1 个任务已关、内容没进主干的分支：hz/test（test）」 plus
  the honest extra findings my seed implies (trunk-outside 88cb25746416 —
  seeded by git CLI outside DSH; evidence-lacking for `test` — done node
  without trunk-evidence annotation) and 已在后台 trunk-check job.
  <ws-b>/.llm/operate/patrol.jsonl landed: run line {found:{trunk-outside:1,
  evidence-lacking:1, branch-unmerged:1}, did:[], trunk:started} followed by
  the settled {kind:trunk-check, outcome:passed}. Screenshot
  shots/c5-patrol.png.
- [window notes for rc.3 lanes] The instance window minimizes/hides itself
  repeatedly when it loses foreground (tray behavior); screenshots need a
  visible window. Working tricks, in order of preference: relaunching the
  exe with the SAME --user-data-dir (second-instance → the first instance
  shows its window; the second process exits — poke-show.ps1), and
  ShowWindow(SW_RESTORE) on the shell pid's MainWindowHandle. Screencast
  returns STALE frames when the window is hidden — always pair screenshots
  with DOM text extraction.
- [bonus watch] tclose.json (03:44:02Z): ws-a unchanged since T0; ws-b's
  post-T5 deltas (+10 removed-tasks, +12 loop events) are exactly the /wish
  off holder change (loop-holder state none at 03:39:13, one beat at
  03:41:13 deleting the board's DSH reminders why=no-holder) — one-shot,
  bounded, expected; no recurring churn. Check 3 conclusion stands.
- [teardown] Browser.close 03:44:28Z → all DeepSeek Harness processes
  exited within 20 s, NO #32770 exit-confirm dialog (idle sessions, no
  queued inbox items). Credential copies DELETED from the scratch home and
  verified absent by a recursive name scan under %TEMP%\l4bat
  (credentials.json, device-mid.txt, .credentials.yaml,
  .anonymous-user-id). The rest of %TEMP%\l4bat (sessions, boards,
  screenshots, logs) left in place as evidence; the whole directory can be
  wiped after review. Main checkout untouched on tracked files (clean at
  429b1e3); the only repo-side writes were this progress file, the
  gitignored .llm/desktop-l4-bat/ lane dir, and one `npm run build`
  (dist 429b1e3, per §5). No merges, no pushes; .worktrees/ablation-trial
  and .worktrees/comms-split untouched.
- [quota] 8 real flash-tier turns total, all GLM-5.3-Flash low: ws-a 6
  (two failed loop_propose attempts before the /wish fix — my own prompt
  assumed any session works; /wish; acceptance chain after answer-1;
  summary turn after answer-2) + the tell-main delivery turn (7 s);
  ws-b 2 (/wish; patrol call, 17 s). Plus local /commands (/loops,
  /glm-status) which read no model. /glm-status at 11:17 read 5 h quota
  20% used, weekly 7% (includes the person's other clients).



