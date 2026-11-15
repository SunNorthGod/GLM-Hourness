# desktop L4 wave-1 progress

Lane: desktop-l4-w1 (main checkout @ 32b266c6). Isolated desktop instance only
(CDP, no system input). Launch recipe: `.llm/desktop-l4-w1/scripts/start.ps1`,
port 9351, marker `--glm-hourness-dl4w1`, DSH_HOME `.llm/desktop-l4-w1/dsh-home`,
profile copied from the B10 layout (bundles dsh-base + dsh-web-app + our two
packages + 9 experimental; glm channel on + flash model + danger-full-access via
cordis.patch.yml), node_modules junctions to this checkout's packages,
credentials/device-mid COPIED into scratch home (deleted at teardown).
Checks: 1 row load / 2 design relay root fix / 3 nowait / 4 schedule_edit arg
shape / 5 metrics pricing note / 6 user-graph widths / 7 L4-3 face-class /
8 A3 real-session. One hard rule: never touch the person's inputs or instance.

## Log

- [prep] 2026-11-16 05:15+08 — main @ 32b266c6, `npm run build` exit 0
  (build-info `32b266c dirty`, dirty = untracked .agents/tasks only). No DSH
  process running at start; desktop-lock created (owner.txt). Scratch home
  assembled: profile files from B10 layout, two junctions verified, credentials
  copied (sizes only).
- [setup fix 1] First boot failed: my sed edit left a `~` line in cordis.patch.yml
  (YAML parse error, host crash log crash-2026-11-15T21-20-13-658Z-host.log in the
  isolated user-data-dir). Fixed, restarted clean. Self-inflicted, not the dist.
- [setup fix 2] Git Bash mangles a literal `/glm-status` argument into
  `C:/Program Files/Git/glm-status` (MSYS path conversion); the mangled text was
  sent to a real session and burned one flash turn before I stopped it. All
  composer input now goes through cdp.mjs typefile.
- [setup fix 3] Workspaces originally under `<repo>/.llm/desktop-l4-w1/ws-*`
  resolved their project root to the MAIN CHECKOUT (projectOf walks up to the
  repo) — test sessions would write violations/memory/metrics into the real
  project state. Relocated to `%TEMP%\l4w1\ws-*`, each `git init`ed,
  workspace.json repointed, instance restarted. Lesson for wave 2: temp
  workspaces must live OUTSIDE the repo.
- [check 1 PASS] Row load on main 32b266c6: build-info `32b266c dirty`;
  boot console 0 errors from our packages (only known host noise); host
  stdout/stderr clean; no new crash log on the clean boot; plugins page both
  bundles installed+enabled (shots/c1-installed.png); /glm-status in
  %TEMP%\l4w1\ws-plain lists 21 rows, all 生效/部分生效/已加载, only `operate`
  未加载 (factory-disabled), no failure rows. Session log:
  dsh-home/sessions/--C-Users-29596-AppData-Local-Temp-l4w1-ws-plain--/
  session-b54d3c27-619a-4ad6-952a-65844d92f033.
- [check 5 PASS] metrics row note: no `积分口径` note in either /glm-status run
  (in-repo run: metrics 部分生效 with 拒收 1 条; Temp run: metrics 生效, 5 条,
  自查还没跑). The reactive fix (cbc46d36/a58471e8) holds on desktop rc.1.
- [NEW DEFECT, pre-existing, not from this wave] env row suppression count
  event always rejected when marker names are id-invalid: writer logged
  `reject {of:'count', field:'byKey'}`; root — src/env/metrics.ts emits
  byMarker keys like `# shellcheck disable=` / `#[allow(` / `# noqa` as map
  keys, but checkMap (src/metrics/schema.ts:170) requires METRICS_ID_PATTERN
  `/^[A-Za-z0-9_.:@+/-]{1,120}$/`. So the count event can never land for real
  repos; row health honestly reports 拒收 1 条. Root hint only, not fixed here.
- [check 2 PARTIAL] Design relay root fix, desktop rc.1, real GLM session
  (session-b6e9506d in %TEMP%\l4w1\ws-relay, /wish on, goal l4-goal approved):
  PASS — main-agent branch: main agent's paraphrased relay graph_edit refused;
  journal `main-agent-graph-relay` (NOT worker-graph-readonly), tool graph_edit,
  full four-piece correction text, goal untouched; design row 生效 with the
  main-agent face note (write tools + ask_user_question off the face).
  BLOCKED — delegated branch trio (subagent refusal + glm-design-bypass notice +
  design row 部分生效) is not reachable by a real model on desktop rc.1: the
  main agent's fork subagents have the 11 graph writes off their face
  (removalsOfRole dispatched=true, documented read-only-subagent design), and
  every by-name path dies at the runtime availability check BEFORE the guard —
  LocalToolSearch select:graph_edit => "No matching deferred tools found";
  DeferredToolCall => "Error: Tool not available in this request: graph_edit";
  an instructed native tool_call cannot be constructed (name absent from the
  request's function schema). Three child sessions (7cd694b0, a1c6c9b5,
  22a53b68), zero guard events, violations.jsonl only the one main-branch line.
  Root hints (not fixed): faces.ts docstring "a call by name still executes"
  does not hold on rc.1 for DeferredToolCall (availability precedes pre-execute);
  delegated-branch main-agent-graph-relay and worker-graph-readonly for
  subagents are probe-only paths on desktop rc.1 — the root fix's desktop
  distinction remains L2/L3-only evidence.
- [check 3 PASS] nowait on desktop: same relay session (main agent), `Bash sleep 30`
  refused; violations line 2: rule `main-agent-no-wait`, tool Bash; correction
  four-piece with the run_in_background right-path and the guard_lift exception
  tail verbatim. Policy-drift (政策差) path untouched by nowait code (reval R3
  `1ae02a9e` files disjoint from main-agent-rules/main-agent filter); its full
  desktop trigger (dispatch chain + stale policy line) not exercised this batch —
  L2/L3 evidence stands.
- [check 4 PASS] schedule_edit tool-arg shape resolved on desktop rc.1 (session
  session-d46c8dbc in %TEMP%\l4w1\ws-loops). The REAL model tool face (verbatim
  schema captured from the LocalToolSearch result in the session log):
  schedule_create {title*, prompt*, rrule*, target*} with target an ENUM STRING
  this_session|new_once|new (no object, no arbitrary sessionId);
  schedule_edit {id*, action*(update|delete), title?, prompt?, rrule?, target?,
  active?, expectedUpdatedAt?} — id TOP-LEVEL, so the loops guard's args.id
  read (src/loops/guard.ts) is correct against the real face; the tool layer
  differs from the SERVICE layer (rc.1 typert.host.js: create(request,
  actorSessionId) with {kind:'session',sessionId} object targets and typed
  timing) — the record returned to the model shows the service resolved
  "this_session" into {kind:'session',sessionId:<caller>}. Real round trip:
  create args
  {"title":"l4w1 提醒","prompt":"l4w1 的测试提醒","rrule":"DTSTART:20261116T060000Z\nRRULE:FREQ=DAILY;COUNT=1","target":"this_session"}
  => id schedule-9cc89a1b-f8aa-4972-bd7b-05141787d07a, target
  {kind:'session',sessionId:session-d46c8dbc…}, status active; edit args
  {"action":"update","expectedUpdatedAt":"2026-11-15T21:47:23.030Z","id":"schedule-9cc89a1b-f8aa-4972-bd7b-05141787d07a","rrule":"DTSTART:20261116T070000Z\nRRULE:FREQ=DAILY;COUNT=1"}
  => scheduledAt 06:00Z→07:00Z, new updatedAt; loops:schedule-tools gate did
  not misfire (ordinary-prompt create passes; args.prompt read also matches).
  First attempt errors quoted for the record: create without rrule =>
  `invalid arguments: missing required property "rrule"; "target" must be a
  string`; edit with null id => `"id" must be a string; "expectedUpdatedAt"
  must be a string`. UNVERIFIED annotation in src/loops/guard.ts + HANDOFF §10
  item 6 can be closed by the next docs lane.
- [check 6 PASS] 用户怎么用 page at two widths (U6/U7 leftover), panel page over
  the ws-ug mini user graph (18 nodes, roles 读者/管理员, flows 登录/搜书/录入新书,
  steps with serves+next): both tabs render (用户视角 with per-flow step lists,
  walk-gap lines 「没写怎样算做成」x3 + 还有 10 处要注意, 条件行「└ 密码对 › 到第
  3 步」, 从起点走不到 notes; 开发视角 with features→tasks and 服务 N 步).
  Measurements (in-page, no OS window change): panel 320px / 420px / 575px native
  — clipped rows 0, horizontal scroll none in all three; window 2560x1100 → panel
  575px, no overflow; window 1024x700 and 800x640 → the HOST collapses the right
  sidebar entirely (host responsive behavior, panel absent — not a panel defect).
  Screenshot shots/c6-ug-320.png. Note: the 3 graph validation warnings are my
  fixture's shortcut (done nodes without evidence), not a product defect; the
  read-only panel renders them as designed.
- [check 7 PASS] Face-class conclusions of batch L4-2 re-verified on this rc.1
  build, from live desktop evidence: (1) main-agent face — design row health in
  the relay session reads 主 Agent：身份节已加上，写文件的工具和 ask_user_question
  已从工具面去掉; (2) subagent face — the relay child enumerated its resident
  functions verbatim: Bash, DeferredToolCall, Edit, Glob, Grep, Read, Write,
  ask_user_question, bootstrap_review, get_goal, lessons_query, skill, subagent,
  subagent_fork, workflow — execute/operate/worker tools absent (non-main
  removals), graph writes absent (dispatched-chain removal), propose_to_human /
  record_human_answer absent (non-main design removals), Write/Edit/ask kept
  (design removes them only from the main agent), lessons_query resident and
  memory tools deferred — exactly the A3 adoption shape; (3) deferral + 检索 —
  LocalToolSearch select loads deferred tools live (schedule pair loaded and
  called in check 4; graph reads announced deferred to children);
  (4) NOT exercised here: non-GLM-route face-keeps-all + guard-by-name downgrade
  (no DeepSeek credentials in the isolated home) — L2-covered, noted honestly.
- [check 8 PASS] A3 real-session check on this build (session session-8f3a64cc
  in %TEMP%\l4w1\ws-relay): LocalToolSearch select:graph_comment,memory_store
  surfaced both deferred tools with schemas; graph_comment on l4-goal landed
  (result rev 6161c10835f6, revision 0b8dd12b94bc; node file history tail
  {"op":"comment","actor":"llm","text":"l4w1 A3 桌面核验"}); memory_store wrote
  the project fact (stored:true, memory.jsonl contains it); memory_query focus
  "A3" matched and read it back. Matches the L4-2 (批次二 2026-11-10) acceptance
  shape: 延迟公告 + 检索链 + 图/记忆工具真实落地.

## Teardown state

- Instance NOT closed: on Browser.close the shell raised the #32770 exit-confirm
  dialog (a queued inbox item in an idle session — the ws-relay main-agent session
  is the likely holder; every lane session log ends turn/end completed, so the
  item is host-side). Per the hard rule the dialog was NOT dismissed and no
  process was killed. The instance is left RUNNING with the dialog up; the
  person may click 退出 (or 取消). CDP port 9351 still open.
- Credential/device-mid copies still in dsh-home/glm-hourness/ (deleting them
  under a running host was judged worse; delete after the person closes the
  instance, or wipe the whole .llm/desktop-l4-w1 directory then).
- desktop-lock released (deleted) after the last item.
- Quota: flash tier only; isolated-home usage.jsonl totals are in the report.
