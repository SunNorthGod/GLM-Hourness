# desktop L4 wave-2 progress

Lane: desktop-l4-w2 (main checkout @ 6e967cf9). Isolated desktop instance only
(CDP, no system input; never the person's instance/inputs). Launch recipe:
`.llm/desktop-l4-w2/scripts/start.ps1`, port 9352, marker `--glm-hourness-dl4w2`,
DSH_HOME `.llm/desktop-l4-w2/dsh-home` (fresh; profile files modeled on the B10
layout; glm channel on + flash model + danger-full-access via cordis.patch.yml
same as wave-1), node_modules junctions to this checkout's packages,
credentials/device-mid COPIED read-only from the real home into the scratch
`dsh-home/glm-hourness/` (delete at teardown; NOT while the host runs).
Wave-2 difference: the scratch profile patch enables the operate row
(`- id: glm-hourness/operate`, `disabled: false`) — factory-disabled by default.
Workspaces live OUTSIDE the repo, in `%TEMP%\l4w2\ws-*` (wave-1's first-batch
lesson), each `git init`ed: `ws-plain` (row load), `ws-report` (reports + patrol;
seeded: branch `hz/t-test` merged into main via commit 96000f0 with
`Hourness-Task: t-test` trailer, committer date 2026-10-28 = 19 days ago, so the
14-day branch-merged rule sees it; graph `docs/graph/nodes/{g-seed,t-test}.json`
hand-written to the §2.6 schema — g-seed goal, t-test task done with the
harness `进主干 96000f0` comment so evidence-lacking does not also fire;
all repo commits dated 19–20 days back so the 7-day trunk-outside window stays
empty), `ws-loops` (/loops + board page). desktop-lock owner.txt created.
Checks: 1 operate row load / 2 morning report / 3 weekly report (两张单子 +
规矩的提议) / 4 patrol render + journal / 5 board 两张单子 + /loops listing /
6 cold-fire readiness of operate.morning. One hard rule: never touch the
person's inputs or instance; own instance closes via CDP Browser.close only.

## Log

- [prep] 2026-11-16 06:12+08 — main @ 6e967cf9, `npm run build` exit 0
  (build-info `6e967cf dirty`, dirty = untracked .agents/tasks/m7-8 only).
  preflight + npm test started in background before boot. No DSH process
  running at start. Scratch home assembled: profile trio + junctions verified
  (dsh-hourness resolves to packages/hourness), fresh user-data-dir, fresh
  storages/workspace.json (3 workspaces -> %TEMP%\l4w2), credentials copied
  (sizes only, contents never read).
- [gates] preflight OK (23 rows composed: dsh-glm-zcode 5, dsh-hourness 18);
  npm test exit 0, `# fail 0`. desktop-lock owner.txt created before boot.
- [boot] 06:22+08 pid 57320, CDP 9352 open. Boot console 0 errors from our
  packages (only known host noise), desktop-err.txt clean. Shots/c1-boot.png.
- [check 1 PASS] Operate row loads enabled. Plugins page 已安装插件 lists GLM
  ZCode 通道 + Hourness 编排层 (shots/c1-plugins.png). /glm-status in
  l4w2-plain (session-a023ea36, %TEMP%\l4w2\ws-plain): 22 rows, all
  已加载/生效/部分生效, no failure rows — `dsh-hourness | operate | 已加载，
  本会话未触发 | 已加载；hourness_report 在本行，晨报、周报与巡检三条时间条目
  交给循环板` (wave-1 read 未加载 factory-disabled here). loops row: 循环板
  自己的 24 项条目已登记 (the three operate time entries included), 还没有
  主 Agent. Session log: dsh-home/sessions/--...-ws-plain--/session-a023ea36…
  (command/done seq 4 carries the full table; UI renders the conversation
  view but the output card was not visible in the shot — log is the evidence).
- [fixture fix] The seeded graph nodes were done without evidence -> 2
  validation errors (the ws-report main agent's first turn noticed them
  before my fix landed). Fixed on disk: g-seed -> approved, t-test keeps
  done + commit evidence 96000f0 on node and on the to-done history entry.
  My fixture's shortcut, not a product defect.
- [main agent] /wish in ws-report (session-2ba25999): takeover read the
  seeded graph, interview ran 3 rounds (all answers typed via CDP), fork
  ① 只核对只报不改 approved, requirement card approved, release approved
  (one explicit confirm the host requires). Goal goal-1 on the graph; the
  agent decomposed to task-1..3 and dispatched (worktrees .worktrees/
  hz-task-1, hz-task-3 spawned as child sessions hz-task-1-a1-qhkyw9,
  hz-task-3-a1-6koi0x). Wrap-up sent 07:15 (no new dispatches).
- [check 2 PASS] Morning report on desktop rc.1, real GLM session as main
  agent: hourness_report {kind:'morning'} called by the real model (session
  log seq 670, turn 6). Result text (shots/report-morning-raw.txt): 现在 /
  一、目标 (graph goals with 任务完成 N/N、本期进主干 N 次) / 二、规划 / 三、
  理由 / 四、架构 / 在等你回话的 / 检查与审查 / 花了多少 / 例外 all render
  against live data. 规则提议的核对 omits by its rule (scratch has no agreed
  proposals to re-check — omission is the designed state, ten-section shape
  is L2-pinned). 花了多少 = `- 合计：积分 120.33 · 高峰 0% · 缓存命中 98%` +
  `- glm-5.3-flash：101 次 · 积分 120.33 · 高峰 0% · 缓存命中 98%` — the
  collector entry shape (totals line + model line, no basis/scope lines):
  cache-hit cross-checks against the scratch home's
  glm-hourness/audit/usage.jsonl (8067456 cacheRead of 8249449 total tokens
  = 97.8% -> 98%), call count consistent (101 at report time 06:45; 165 by
  07:10 as the session continued). 例外 reports the session's real
  violations: 拦下 main-agent-graph-relay × 2 (its paraphrase graph_edits
  refused), 撤下的规则：无, lifts.jsonl 读不出（ENOENT） honest note (fresh
  project has no lifts file), 压制注释 0 处.
- [check 3 PASS] Weekly report: hourness_report {kind:'weekly'} (session log
  seq 676; shots/report-weekly-raw.txt). 减负 numbers in 人的负担: 问你几次
  0 次, 每次要读的字（中位数）—（最长 —）, 你回话等了多久（中位数）—（最长 —）
  — metrics/load entries absent in scratch so the em-dash placeholder shape
  renders (不写假零), 因人的决定返工 0 次 computed from the graph; closing
  line 其余的数字在面板的指标板上 present. 两张单子 section correctly OMITS
  (no loops/stale, loops/timeouts entries exist in scratch). 规矩的提议
  renders counts only per §3.12.1: `- 规范 3 条，其中带规则标签的 0 条` —
  no draft lines at all, so the `**升一级**：` bold shape was not exercised
  on desktop (nothing rendered it; L2 covers the shape). Data missing for
  real proposals: no rule with 近 7 天拦截 ≥ 3 (only the 2 relay refusals),
  no labeled gate-level norms on the graph, and changed-file paths have no
  durable source so floor-add cannot propose — as the docs state.
- [check 4 PASS] Patrol: hourness_report {kind:'patrol'} (session log seq
  678; shots/report-patrol-raw.txt). Findings table rendered with real
  data: 主干 — `1 个带任务尾注的主干提交没有成立的前进覆盖：96000f086b4e`
  (the seeded merge commit's Hourness-Task trailer has no advance coverage
  in scratch — honest); 工作树与分支 — `1 个分支的内容进主干超过 14 天，
  可以删：hz/t-test` (THE seeded finding, branch-merged fired exactly as
  designed: done task node + trailer commit 19 days old + tip ancestor of
  trunk). 已在后台 — trunk check job line. Journal: ws-report/.llm/operate/
  patrol.jsonl has `{kind:'run', found:{trunk-unchecked:1, branch-merged:1},
  did:[], trunk:'started'}` (two runs: the model re-called the tool after my
  queued message) + `{kind:'trunk-check', outcome:'failed'}` — the failed
  trunk check is the gate norm the main agent itself proposed
  (`$ git status --porcelain` must print nothing) evaluated in a worktree
  full of untracked scratch files; failure notice path recorded, direction
  conservative (§17.16). All per design.
- [check 5 PASS] /loops in ws-loops plain session (session-226292f7):
  command output (session log cmd-e0a6a578-3) lists 插件带来的（24 项，只能看）
  including `晨报 · 每天 08:30 · 还没跑过 · 下次 11月16日 08:30`, `周报 ·
  每周一 09:00 · 下次 11月16日 09:00`, `夜间巡检 · 每天 02:30 · 下次 11月17日
  02:30` — the operate trio, 只能看, correct next-run times; 你自己加的
  （0 项）; 在等的 0 件. Board page: opened via 项目图 tab (empty
  docs/graph/nodes dir made the panel render, then 去看看循环板 ›) —
  shots/c5-board4.png: header 循环板 · 到点了或碰到某件事，就去做一件事,
  holder line 还没有主 Agent（ws-loops has none）, DSH-task-page note, peak
  line 此刻：不是高峰；下一个高峰 11月16日 14:00 · 少做（出厂默认）, entry
  cards with 项目编排带来的 · 只能看 + 讲细点. 两张单子 group: OMITTED when
  view.items is empty — view.json (ws-loops/.llm/loops/) has items: [] and
  ui/src/loops/LoopsPage.tsx renders the group only when
  model.items.length > 0 (`model.items.length === 0 ? null : …`), so the
  omission IS the sane empty state; populated render is L2-covered, not
  exercised on desktop (needs a stale/timeout person entry, scratch has
  none by design). Navigation note: board pages hang under the graph panel
  page and only render once the project graph is readable (empty graph
  counts); the 开始 tool grid has no board entries.
- [check 6 READINESS] operate.morning is wall-clock only; left armed for
  the orchestrator. Evidence: ws-report/.llm/loops/view.json holder = 主
  Agent 收得到这块板的消息 (session-2ba25999), operate.morning active next
  2026-11-16T00:30Z (08:30 +08 today), weekly next 01:00Z (09:00 today,
  Monday), patrol next tomorrow 02:30; the host 自动化任务页 (shots/
  c6-tasks.png) shows the bound tasks 已开启: 循环板 · 晨报 每天 08:30 下次
  11月16日 08:30. Near-time triggering is NOT reachable from my surfaces:
  the session tool face is create/edit only (wave-1 check 4), the board's
  reconciliation repairs outside edits of its bound tasks and respects a
  person's pause (§18.10), and rc.1's service-internal `run`/`runNow`
  (deliver now without consuming the occurrence, dsh-schedule index.js
  1187/2350) has no session-tool or UI wiring I could find. Waiting would
  be ~80 min at decision time (07:15) — over the 45-minute line, so no
  fire was forced. Startup catch-up exists: rc.1 drive() delivers any
  active task whose committed target has passed, so a restart after 08:30
  delivers the missed occurrence once.
- [host hygiene] Whole-run console (cdp-log.jsonl): 564 entries, all known
  host noise, 0 other errors, 0 naming our packages; desktop-err.txt only
  the DevTools line. Updater found 0.2.2-rc.3 (新版本 button) — ignored,
  nothing upgraded.

## Left-behind state (intentional, for check 6)

- Instance RUNNING (pid 57320, boot 06:22+08), CDP 9352 open, window on the
  自动化任务页. NOT closed: the 08:30 wall-clock fire of operate.morning
  (and 09:00 operate.weekly) is the orchestrator's to observe; Browser.close
  was not attempted so no exit-confirm dialog is expected.
- Sessions: ws-report main agent session-2ba25999 (goal paused/completing
  per wrap-up; worker child sessions hz-task-1-a1-qhkyw9, hz-task-3-a1-6koi0x
  were live at last check), ws-plain session-a023ea36, ws-loops
  session-226292f7, plus one empty stray session-48093ffd in ws-report
  (navigation mis-click, harmless).
- Scratch home credential/device-mid copies STILL in
  .llm/desktop-l4-w2/dsh-home/glm-hourness/ — delete only after the person
  closes the instance (deleting under a running host is worse; wave-1
  precedent), or wipe the whole .llm/desktop-l4-w2 directory then.
- desktop-lock still held (owner.txt) while the instance runs; release it
  when the instance closes.
- Quota: flash tier only; ~165 GLM calls / 8.25M tokens total (14.8M input
  incl. cache) by 07:10, window showed 已用 5% (5h) and 23% (weekly) at
  06:26. The 08:30 morning fire will spend one more holder turn.
- No new product defects found. Observations only: (a) the /glm-status
  output renders in the session log but the command-output card was not
  visible in the conversation DOM/screenshot (evidence taken from the log;
  wave-1 did the same); (b) 例外's `lifts.jsonl 读不出（ENOENT）` note is
  honest but noisy on a fresh project with no lifts file.

## cold-fire morning observation (orchestrator, 2026-11-16 08:36)

**Fired.** Evidence chain, all times local (UTC+8):
- runner stepped at 08:30:00.129 (`dsh-home/glm-hourness/loops/machine/last-step.json`, session-2ba25999, project ws-report)
- usage entries 08:30:08 / 08:30:19 (`dsh-home/glm-hourness/audit/usage.jsonl`, at 2026-11-16T00:30:08Z / 00:30:19Z, glm-5.3-flash, 117553+466 in / 14+480 out / 117504 cacheRead)
- assistant reply at 08:30:19 in session-2ba25999 journal opens verbatim: 「# 晨报 2026-11-16 ¶ ## 现在 ¶ - 高峰：不是高峰；下一个高峰 14:00（GLM 积分套餐）」; 花了多少 = 积分 334.13 · 缓存命中 97%; 例外节记 `拦下 main-agent-graph-relay × 3`(根修规则在真桌面流水中工作)
- render matches the wave-2 lane's manual hourness_report render (same section order, same sources)

## cold-fire weekly observation + cleanup (orchestrator, 2026-11-16 09:07)

**Weekly fired.** Runner stepped at 09:00:00.124 (`last-step.json`, session-2ba25999, ws-report); usage 09:00:06/09:00:18/09:00:45 (audit/usage.jsonl, 2026-11-16T01:00:*Z); assistant reply at 09:00:18 opens verbatim 「# 周报 2026-11-16 ¶ ## 人的负担 ¶ 最近 7 天：问你几次 5 次…」; 规矩的提议 = 「规范 4 条，其中带规则标签的 0 条」(§3.12.1 counts-only); pointer line 「其余的数字在面板的指标板上」= d-metrics-ratios-person-only reroute working; `**升一级**：` not exercised (0 labeled norms → no drafts, data gap as recorded, L2 covers).

**Instance closed & cleaned.** Graceful taskkill blocked by the exit-confirm child (the same #32770 class as wave 1); marker-matched force-kill of PID 57320 tree, 0 dl4w2 processes remain; `.llm/desktop-l4-w2/dsh-home` (credential copies) and `user-data-dir` deleted; scripts/shots kept.

**Main dist rebuilt.** Was stale since 27ef708d (emfix deferred while the desktop lanes used this checkout). Stray untracked m7-8 lane progress archived and committed first, then rebuilt: build-info 97eedd8 = HEAD, dirty False, tracked tree clean.
