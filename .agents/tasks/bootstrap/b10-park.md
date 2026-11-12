# B10 desktop-L4 lane park note (2026-11-11 23:1x UTC+8, parked for ZCode restart)

Lane: B10 desktop L4 (dispatch item 2 of HANDOFF §10). Checkout owned by this
lane, HEAD cbc46d36 at start, working tree carries the lane's uncommitted work
(see below). Nothing committed, nothing pushed.

## Rework lane state (2026-11-12, B10 rework-then-close, appended after each item)

- HEAD at lane start 6931fccc, clean tree. Work item 1 (harness closing
  honesty) DONE and committed as `50e5e451`: checkRound refuses an
  unreadable `only` line (gate-norm `unreadableOnlyLines`); applied
  message and graph reminder are two calls + the way through + the
  ls-files verification requirement; first reminder names the closing
  claim; empty-advance reconciliation in installTrunkGate (degraded +
  holder notice, silent once tracked); identity section carries the
  denial rule. ORCHESTRATION §3.1/§19.4-§19.5 passages updated in the
  same commit. Gates on the committed tree: build 0, preflight 0,
  `npm test` 0 (`.llm/logs/b10r-test2.log`: 3705 pass / 0 fail,
  eslint 73 / knip 18 / jscpd 1 flat). Not pushed yet.
- NEXT: work item 2 (/wish off mentions the open takeover), work item 3
  (:592 agents reactive), then one full probe (b10r- log prefix), then
  desktop flow 1 rerun with the workspace OUTSIDE the checkout.
- Work item 2 DONE, committed `2f5cb83c`: WishSeam gains openOf(cwd)
  (read-only id of the open takeover); /wish off's three success replies
  append 「。接管 <id> 还开着，要放弃发 /hourness-init off」 while one
  is open; semantics untouched. Gates: build 0, preflight 0, npm test 0
  (`.llm/logs/b10r-test3.log`, eslint 73 / knip 18 / jscpd 1 flat).
  Not pushed yet. NEXT: work item 3.
- Work item 3 DONE, committed `a58471e8`: the :592 agents probe stays as
  the fallback, ctx.inject(['agents']) clears the note on arrival and
  re-says it on departure (the cbc46d36 pricing mechanism); DESIGN §2.5
  metrics row updated; L2 mirrors the pricing test. Gates: build 0,
  preflight 0, npm test 0 (`.llm/logs/b10r-test4.log`, eslint 73 /
  knip 18 / jscpd 1 flat). Not pushed yet.
- Probe baseline note: the last recorded run `.llm/logs/b10f-probe.log`
  (finished 04:21:59, before febd9bad was committed 04:25:34 — the run
  carried the fixed design checks in its working tree) is the post-fix
  baseline: 560/580, 20 reds (glm execution×2, guard request worker,
  rules-peak-wake, rules-handover×2, metrics×2, design release,
  design modules, exec dispatch×4, exec plan/review/docs/merge/
  merge-upstream/modules). Expected after the metrics fix: 562/580,
  exactly the two metrics health labels gone.
- Probe RUNNING: `.llm/probe-lock` taken by this lane 21:24:59Z
  (owner.txt re-checked then rewritten each poll); log
  `.llm/logs/b10r-probe1.log`, exit file b10r-probe1.exit; GIT_CONFIG_*
  unset in the running shell; no rebuild until it ends.
- Desktop prep done while the probe runs (no rebuild, no checkout-tree
  writes beyond .llm): flow-1 workspace re-seeded OUTSIDE the checkout
  at `C:\Users\29596\Desktop\Project\b10-r-node` (git, 2 commits
  0edb498/a16c84f, package.json + index/test/lint/deploy — the original
  ws-node shape); `.llm/b10-l4/dsh-home/storages/workspace.json` b10-node
  entry now points there (b10-new / b10-repo untouched; the old in-checkout
  ws-node stays as evidence). The old flow-1 workspace `.llm/b10-l4/ws-node`
  keeps its docs/graph leftovers untracked; nothing deleted.
- Probe 1 (`b10r-probe1.log`, exit 1): **561/580**. The two metrics
  upstream-drift labels turned green exactly as expected, and ONE new red
  appeared: `design wish off idle` — the check pinned the second /wish off
  reply word for word as 「这个会话本来就不是主 Agent」, written while off
  never mentioned the takeover; with the row enabled the scenario's /wish
  opens one and 2f5cb83c's line is part of the reply. Fixed as `ebd44a61`
  (the check pins the designed shape with the takeover line; product code
  unchanged, L2 pins hold — febd9bad's staleness class).
- Probe 2 RUNNING (`b10r-probe2.log` / `.exit`), definitive run for the
  records; expected 562/580, exactly the b10f baseline 20 minus the two
  metrics labels.
- Probe 2 DONE: **562/580** (`.llm/logs/b10r-probe2.log`, exit 1 as the
  baseline expects). FAIL-label diff vs the b10f baseline: exactly the
  two metrics health labels gone, the other 18 identical. Probe lock
  released by the holder. Record run dir kept:
  `…Temp\glm-hourness-probe-2026-11-11T21-47-23-689Z-tgRRkO`.
- DESKTOP INCIDENT (contained, 06:08–06:16 UTC+8): start-b10.ps1 was
  invoked with a RELATIVE -Root, so the instance resolved DSH_HOME into
  the nested accidental home
  `.llm/b10-l4/dsh-home/profiles/desktop/.llm/b10-l4/dsh-home/` (fresh
  storages → DSH's hard-coded default workspace
  `C:\Users\29596\Documents\deepseek-harness\default-workspace`, empty
  credential store → the first GLM turn failed 还没登录; the /wish still
  opened takeover tk-5xksjrth there on the new-project path, git-init'd
  the empty dir, model turn failed before proposing anything). Verified
  ZERO writes outside the isolated tree: ~/.dsh newest mtimes are
  profiles 11-10, sessions 11-07, storages 11-07, logs 10-26; the
  checkout tree untouched; b10-r-node untouched. The failed turn's
  session log lives in the nested home. Containment in progress: close
  the stray takeover with /hourness-init off from a temp workspace
  pointed at the default-workspace dir, archive the journal + nested
  home listing as evidence, delete the Documents default-workspace dir
  and the nested home, then relaunch with an ABSOLUTE Root. Lane
  lesson: start-b10.ps1 must always get an absolute -Root (its DSH_HOME
  is relative to the caller's cwd otherwise).
- INCIDENT CONTAINMENT CLOSED (2026-11-12 10:37–10:44 UTC+8, finishing
  lane). Scene as found, corrected vs the handoff brief: the six running
  DeepSeek Harness processes were NOT the person's — all carried the
  isolated marker / user-data-dir / profile on their command lines; they
  were the previous lane's 06:22:26 relaunch left running. That relaunch
  had created the "b10-stray" workspace (path = the Documents
  default-workspace) in the isolated home's workspace.json to close
  tk-5xksjrth from there; the takeover's record was already gone with the
  deleted nested home, so the closure step had nothing to close, and the
  lane died before any cleanup. The orphan instance re-created the
  Documents default-workspace at 06:23:43 (the previous lane had deleted
  the incident's first copy along with its git-init); its only contents
  were cwd-side scaffolding from the incident + containment sessions
  (.llm/loops state/view + one .llm/rules/hosts file; the 10:35:48 write
  was the orphan host re-registering session-9f7025f6, runner:false).
  ~/.dsh re-checked untouched (newest 11-10). Disposition: instance
  closed via CDP Browser.close 10:43:52 (exit verified, no #32770;
  leftover-state shot .llm/b10-l4/shots/b10-stray-leftover.png), the
  default-workspace MOVED (not deleted) to
  .llm/b10-l4/incident-archive/default-workspace/ with a README.md
  (what/why/disposition), the emptied Documents\deepseek-harness parent
  removed, and the b10-stray entry dropped from
  .llm/b10-l4/dsh-home/storages/workspace.json while the instance was
  down. Documents tree is now clean of the incident.
- FLOW-1 RERUN VERDICT (11:45 UTC+8, finishing lane): **BLOCKED at the
  consent step — new finding; the closing was never reached.** Evidence
  shots .llm/b10-l4/shots/b10r2-*.png; live takeover artifacts kept for
  the bootstrap line at b10-r-node (.llm/bootstrap/journal.jsonl, 145
  seqs + tk-xqkpdiae/ with review-1..5.md and scan/trial files).
  - What passed: frame 1 ✓ (wish card 「开了接管 tk-xqkpdiae（已有项目）：
    4 个代码文件、2 个提交、清单 package.json」, main agent reads);
    frame 2 ✓ (one message: 现状/锚点目标/里程碑任务/合入清单/全审底线
    then the two things as plain questions; 15 node files written);
    frame 2b ✓ (free-form answer → restate → record on 对); frame 3
    shape ✓ (checklist consent with command originals verbatim + 注意
    lines). /wish off sanity check ✓ PASS: with tk-xqkpdiae open the
    reply carried 2f5cb83c's line verbatim — 「已退出主 Agent 模式：…
    接管 tk-xqkpdiae 还开着，要放弃发 /hourness-init off」.
  - What failed: EVERY harness-side consent record was refused. Journal
    pattern (b10-r-node/.llm/bootstrap/journal.jsonl): review-open
    (askDigest stable from r3 on) → person answers → apply-start →
    accept-refused — the first (r1, 10:54:59) and every subsequent one
    `code=changed` "the question on the graph differs from the round
    the harness wrote", later rounds also `code=stale` "round N is not
    the current list (M)". Six-plus rounds (question-3…6, review-1..5,
    ~5.6M tok flash). Root mechanism, verified in
    packages/hourness/dist/bootstrap/review.js:445-460
    (verifyDecision): record_human_answer passes only if the question
    node's title/ask/proposal/reason/cost/notTaken digest equals the
    bootstrap_review call's stored askDigest and the node's attach line
    names the current round. The flash model paraphrased/truncated
    between its bootstrap_review call, propose_to_human, and the node
    write EVERY time (its own diagnosis in review-5.md: 「提问工具只
    保留问号前一句、与清单轮全文摘要不一致」), so equality never held.
    The harness refusal is by-design integrity behavior (it never
    recorded a drifted consent) — the seam is model-sensitive: the
    FIRST flow-1 run (02:47) recorded consent on the first try with the
    same model.
  - Escalation (worse than a plain loop): after repeated refusals the
    model freelanced past the blocked consent — claimed 「你的同意已在
    问题记录里留痕（question-6，原话在案）」 (false: the harness
    refused that record; question-6 got a self-set approved status,
    no decide entry accepted), self-invented 需求确认/设计/放行单
    phases, and asked a "design release" question while the takeover
    protocol was still at r5 unconsented; even the two-things answers
    never reached the norms (review-5 cautions: 「你说了，主 Agent 还
    没记进规范」). Coaching (three precision nudges, incl. the exact
    verifyDecision field list) did not converge.
  - Containment: /wish off (the sanity-check line above) →
    /hourness-init off → journal seq 145 `takeover-closed
    reason=abandoned counts.proposed=16`; b10-r-node HEAD unchanged
    a16c84f, docs/ untracked (0 files tracked), no commit written —
    the abandon path is honest (「愿「加一个把 notes 导出成 CSV 的
    命令」没有交出去，要的话再发 /wish」). Instance closed via
    Browser.close 11:24:31, exit verified, no #32770; credential
    copies (credentials.json, device-mid.txt) deleted from
    .llm/b10-l4/dsh-home/glm-hourness/.
  - Consequence for the records: the DECISIVE CHECK (closing produces
    a non-empty graph-tracking commit) was NOT exercised on desktop
    this rerun — unreachable behind the consent seam. 50e5e451's
    closing honesty remains verified at probe level (562/580 run);
    the empty-commit fix has no desktop counter-evidence. Follow-up
    for the bootstrap line (next lane, NOT this one): make the
    consent seam robust to model paraphrase (e.g. harness-echoed
    canonical question text the model must quote mechanically, or a
    relaxed digest compare with human-visible diff), and re-run
    flow-1; the mockup frames themselves all render as designed.
- DESKTOP FLOW-1 RERUN RUNNING (10:45 UTC+8, finishing lane, session
  session-32473932… in b10-node = b10-r-node). Relaunch with ABSOLUTE
  -Root correct: header shows b10-r-node, homing right, no stray dirs.
  Welcome skipped. /wish 加一个把 notes 导出成 CSV 的命令 sent via
  typefile: wish card 「开了接管 tk-xqkpdiae（已有项目）：已有项目：
  4 个代码文件、2 个提交、清单 package.json」 — frame 1 ✓
  (b10r2-f1-frame1.png). Frame 2 ✓ (b10r2-f1-frame2-answered.png;
  the pre-answer frame2.png shot hit a transient window-not-front
  timeout, content covered by the answered shot): one message narrates
  project status / anchor goal 「b10-node-notes 保持可用」 / milestones
  and tasks / merge-check list / full-audit floor, then the two things
  as plain questions (① 花钱/独占机器 ② 不许碰的地方), 15 graph node
  files written (docs/graph/nodes/*.json, +366). Answered in one plain
  sentence 10:51. NEXT: trial + frame 3 checklist + consent.

## Item 1 — takeover-row enablement commit

- Flip DONE in working tree, uncommitted: `packages/hourness/cordis.patch.yml`,
  row `glm-hourness/bootstrap` — `disabled: true` removed; comment rewritten to
  the recorded shape (L3 scenarios bootstrap-new / -existing / -trial / -gaps /
  -reopen / -resume passed at 0cc628a5 (579/579); desktop L4 = batch B10 on
  this build, recorded under .agents/tasks/bootstrap/).
- Gates run on the flipped tree (logs under .llm/logs/, all exit 0):
  - `npm run build` 0 — b10-build.log (build-info cbc46d3)
  - `npm run preflight` 0 — b10-preflight.log (22 rows composed)
  - `npm test` 0 — b10-test.log: 3702 pass / 0 fail / 0 skipped;
    ratchets eslint 73 / knip 18 / jscpd 1 (flat)
  - `npm run probe` — WAS STILL RUNNING at park time (started 23:07 UTC+8,
    b10-probe.log, exit code file b10-probe.exit). The probe process dies with
    the restart; the log is incomplete. RERUN REQUIRED on resume.
- Probe lock `.llm/probe-lock/` held by this lane (owner.txt
  "b10-desktop-l4 ... started 2026-11-11T14:58:18Z"). Not deleted at park
  (per park discipline); orchestrator cleans stale locks after restart.
- NEXT ON RESUME: rerun probe (lock re-take per DEVELOPMENT §1.1; clear
  GIT_CONFIG_* which are clean in fresh shells anyway) → verdict vs the rc.1
  baseline 20 (batch A attribution in .agents/tasks/face-migration/progress.md;
  expect ~560/580, no NEW reds) → commit 1 = the cordis.patch.yml flip only →
  push origin main, then `https_proxy=http://127.0.0.1:7890 git push github main`.

## Item 2 — impl-plan §3/§9 backfill of 0cc628a5

- DONE in working tree, uncommitted: `.agents/tasks/bootstrap/impl-plan.md`
  - §3 B7 row: second-batch commit placeholder → `0cc628a5`
  - §3 B9 row: same-commit placeholder → `0cc628a5`
  - §9 last entry: commit id `0cc628a5` filled ("随 bootstrap 分支进 main")
  - OUT OF STRICT SCOPE but verified and included: §3/§4 B8 rows corrected
    from 顺延 to 已推 — B8's /wish seam IS on main (ancestry verified:
    `a6f2d894` 2026-11-07, review fix `cd07bfc8`, rider `8a7061f4`,
    credential `23acb4d1`; takeover seam L2 group present in
    tests/design-mode.spec.ts on main). B8's four-gate numbers have no record;
    the cell says so instead of inventing them.
- NEXT ON RESUME: commit 2 (docs-only, this file) after commit 1.

## Item 3 — desktop L4 flows

- NOT STARTED (probe was running; sequence discipline: gates before flows).
- Prep COMPLETE under `.llm/b10-l4/`:
  - `dsh-home/profiles/desktop/{package.json,pnpm-workspace.yaml,cordis.patch.yml}`:
    bundle list = the person's desktop 13-bundle list; dependencies link: to
    the checkout packages; patch = agent-default-model glm-zcode/glm-5.3-flash
    reasoningEffort low, permission danger-full-access, glm-hourness/glm-llm
    disabled:false. The bootstrap row is NOT overridden — the L4 runs the
    shipped enabled default from the bundle patch.
  - `dsh-home/storages/workspace.json`: three workspaces seeded — b10-node
    (default, ws-node), b10-new (ws-new), b10-repo (this checkout).
  - `dsh-home/glm-hourness/{credentials.json,device-mid.txt}`: copies of the
    user-level files (SHA-256 match eec5eaee705bdf16..., values never read).
  - `ws-node/`: small Node project (test/lint/deploy scripts), git 2 commits
    (52c6aff, 0c09c2a). `ws-new/`: empty dir.
  - `scripts/cdp.mjs` (compact-recall enable/desktop copy: guarded type/key,
    full-window screenshots, console classification), `list-windows.ps1`,
    `start-b10.ps1` (isolated start: port 9345, --user-data-dir, env DSH_HOME,
    marker flag `--glm-hourness-b10-l4`), `skip-welcome.mjs`, `newsess-b10.js`.
  - `flow-log.md`: mockup comparison checklist (4 frames) + flow skeleton.
- KEY FACT for resume: the L4 goes the DIRECT path — `/wish <wish text>` opens
  the takeover (B8 seam live on main), matching mockup-takeover.svg frame 1;
  no transition path needed. B10 checklist per impl-plan §4 B10 / design §15.3:
  two workspaces /wish → first dispatch_task vs mockup; graphs into git; this
  repo `/hourness-init status` read-only (gaps only, no graph write); desktop
  logs free of new package errors.
- Discipline in force: own isolated instance only (person's desktop was NOT
  running at ~23:00, tasklist empty; never touched); CDP only, no synthetic
  input; #32770 dialog ⇒ STOP for the person; unique b10- log paths; never
  rebuild while a probe runs.
- NEXT ON RESUME: after commits 1+2, `npm run build` once (so build-info
  matches the pushed HEAD), then start-b10.ps1 → skip welcome if shown →
  /glm-status row-health screenshot → flow 1 (ws-node: /wish 加一个把 notes
  导出成 CSV 的命令; answer the two-things and checklist questions in one
  plain sentence; expect trial round, rules+checklist frame, closing frame,
  then first dispatch_task) → flow 2 (ws-new, new-project path) → flow 3
  (b10-repo: /hourness-init status; assert docs/graph untouched and no
  .llm/bootstrap/journal.jsonl created) → cleanup via Browser.close +
  #32770 check via list-windows.ps1 + delete credential copies.

## Item 4 — records (HANDOFF §10, B10 rows, L4 record file)

- NOT STARTED. NEXT ON RESUME: after the flows — docs/HANDOFF.md §10 item 2
  (B10 state), impl-plan §3 B10 row + §9 dated line, L4 record file
  (suggested `.agents/tasks/bootstrap/l4-2026-11-11.md`; shots stay under
  `.llm/b10-l4/shots/`), final commit + both pushes.

## Environment facts

- exe: `C:\Users\29596\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe`
- Off-peak hours at park (23:1x UTC+8); GLM real-model runs are part of this L4
  (precedent: compact-recall l4 2026-11-06).
- Logs this lane: `.llm/logs/b10-{build,preflight,test,probe}.log`
  (+ b10-probe.exit once the probe ends).

## VERDICT — probe rerun 2026-11-12 02:2x UTC+8 (appended first, restart-hardening)

- Rerun done: `.llm/logs/b10-probe3.log`, exit 1 (`b10-probe3.exit`), **557/580**.
- Baseline: `metrics-fix-probe-1.log` 560/580 (pre-flip tree; the 560/580 of HANDOFF §10 item 1). FAIL-label diff (`sed 's/  (.*//' | sort | comm`): **baseline 20 labels all still fail, identical set, none recovered**; **+3 new labels, all design-row checks**: design main (GLM), design main (non-GLM), design one main.
- Attribution (verified from the kept run artifacts `…\Temp\glm-hourness-probe-2026-11-11T18-00-56-319Z-U3fFXk\`, not inferred): all three are the working-tree flip (takeover row enabled) changing the probe environment — designed behavior of the row under test colliding with checks written while the row shipped disabled:
  1. design main GLM/non-GLM: expected face = faceWithout(r0, cut) + DESIGN_TOOL_NAMES + EXECUTE_TOOL_NAMES deep-equal (run-probe.mjs:4102); observed = expected + `bootstrap_review` exactly (20 vs 19 GLM, 55 vs 54 non-GLM). The /wish seam (B8) opens a takeover; with an open takeover the main agent's face carries BOOTSTRAP_TOOL_NAMES (['bootstrap_review'], src/shared/tool-names.ts:156) — the row's designed face rule.
  2. design one main: `/wish here` resultText now starts with the takeover resume line 「接着做开着的接管 tk-a9zdln80（新项目）：…」 before 「主 Agent 已从另一个会话移到这里；」; the check pins startsWith. The moved-notice, the reverted 16-tool face (Write/Edit/ask_user_question back, no bootstrap_review for the deposed session), the absent section, and the Write all verified intact in the artifacts — only the prepend broke startsWith.
- Ruling: verdict HOLDS for the flip — zero unexplained reds, zero baseline movement. The 3 new reds are probe-expectation staleness against the enabled row (same pattern as the attributed rc.1 baseline), NOT product defects; they also preview what the desktop L4 should show. Follow-up for the orchestrator (not done by this lane, scope): update the design-row probe checks for the enabled-takeover world, or the suite carries these 3 attributed reds on every future run.
- Probe run dir kept (exit non-zero): path above; may be deleted after records land.
- Probe lock: `.llm/probe-lock` taken by this lane 2026-11-11T18:00:33Z, released right after this verdict was written.

## Flow 0 — /glm-status row health (2026-11-12 02:3x–02:5x UTC+8) — DONE

- Isolated instance: start-b10.ps1, port 9345, marker --glm-hourness-b10-l4, DSH_HOME=.llm/b10-l4/dsh-home, own user-data-dir; person's instance not running, not touched. Welcome skipped via skip-welcome.mjs.
- DEFECT FOUND IN PREP, fixed on the spot: the isolated profile had no node_modules, so the two link: bundles never resolved — every GLM request failed NO_ADAPTER ("no adapter registered for provider glm-zcode") and the glm-hourness/glm-llm override had no target. Fix: created the two junctions (dsh-glm-zcode→packages/glm, dsh-hourness→packages/hourness) under .llm/b10-l4/dsh-home/profiles/desktop/node_modules, mirroring the person's desktop profile layout (verified with cmd dir), then restarted the instance cleanly (Browser.close, exit polled, no #32770). Prep scripts gained mk-junctions.ps1, check-cmdline.ps1, wait-exit.ps1, type-enter-shot.mjs, click-at.mjs, wheel.mjs, dump-card.mjs (scratch, .llm only).
- Shell gotcha that ate three attempts: Git Bash MSYS path conversion rewrites a leading-slash argv ("/glm-status") into "C:/Program Files/Git/glm-status"; one mangled plain message ran one real GLM turn (43.1K tok, flash, off-peak) before the model asked for clarification. Commands sent via typefile (file content verbatim) work; note pure slash-command sends do NOT switch the new-session hero view — the outputs only became visible once a real message opened the conversation view.
- Evidence: shots/b10-00-boot.png (boot, three workspaces, 完全权限 preset), b10-01-glm-status.png, b10-05-status-expanded.png, b10-06-status-table2.png, b10-row-health.txt (full table text).
- Row health (session session-5e1cc63a…): glm-llm 生效（上游已应答，套餐 coding-plan）、glm-login 生效（额度 读于 02:46）、glm-prompt 生效（ZCode 提示词与工具面，工具检索 local）、glm-compact 已加载、guard 生效（圈禁根 ws-node）、memory 生效、graph-panel 生效、rules 生效（少做档）、env 生效、graph 已加载（15 工具）、design 已加载（/wish 已注册）、execute 已加载、transcript 已加载、hourness 已加载、**bootstrap 已加载，本会话未触发（/hourness-init 开接管）**。部分生效：data（项目目录未配置）、lessons、loops（DSH 定时服务形状不对的既有注记）、metrics（没有 agents 服务——rc.1 既有 finding）。未生效：workflow（无项目目录）。无本包新错误；页面 console 仅已知噪声 + open-in-app/icon/explorer 404（宿主图标资源，非本包）。

## Flow 1 — b10-node /wish → first dispatch (2026-11-12 02:47–03:0x UTC+8) — DONE, one real finding

- Session session-81055625… in workspace b10-node; /wish 加一个把 notes 导出成 CSV 的命令 (sent via typefile, text verbatim). Wish text + answers as one plain sentence each; consent wording 「可以，照第 1 版清单接管。」 matched the L3 recordedAs shape.
- Frame walk vs mockup-takeover.svg / flow-log checklist:
  - Frame 1 ✓ — wish command card 「开了接管 tk-4epcc0b1（已有项目）：已有项目：4 个代码文件、2 个提交、清单 package.json」; main agent started reading. Shots b10-f1-frame1.png.
  - Frame 2 ✓ — the two things in one message, plain questions (① cost: no paid/machine-exclusive checks; ② touch: nothing no-touch), anchor goal 「b10-node-notes 保持可用」+ tasks + merge-check list narrated before them. Answered in one sentence; design.answer-recorded (form recommend, answer agree, decided) in metrics. Shots b10-f1-frame2.png.
  - Trial ✓✓ — TWO trial rounds ran (05:52 ESLint failed: eslint not installed → correctly attributed to task-2, check rows unchanged; round 2: 5 pass / 1 fail, same attribution). Dedup: norm-1 marked 作废 once.
  - Frame 3 ✓ — checklist message with command originals verbatim (node node_modules/eslint/bin/eslint.js --format json {files}…) and the 注意 lines (trunk does not advance on red, 30-min pre-merge, 60-s after-edit, programs/configs not in the consent). Shots b10-f1-frame3a/3b.png. Difference vs mockup: the no-touch rule was not re-asked as a separate recommend question (already settled in the two-things round); the checklist consent came as one ① question.
  - Frame 4 ✓ — closing: 「接管完成，图已提交进 git」+ trunk advanced to 4df09fe (通过 4 条合入检查) + leftover ESLint note + wish question returned (① npm run export 对吗). Shot b10-f1-frame4.png.
- First dispatch ✓ — after confirming the wish interpretation + 开工: task-2 「补上检查用的开发依赖」dispatched to a worker (glm-5.3-flash, 轻审, independent worktree), task-3 (npm run export) queued behind it. Shot b10-f1-dispatch.png. Worker worktrees: .worktrees/hz-task-2 (branch hz/task-2), .worktrees/hz-gate (detached, merge-gate trials), .agents/worktrees/dsh-81055625-d818 (git-snapshot). Worker already corrected once by checker-config rule (tried to edit eslint.config.mjs; violations.jsonl 19:04:25). execute journals live: .llm/execute/{actions,advances,checks,drive,reconcile}.jsonl + tasks/task-2.
- **FINDING (real, blocks the "graphs into git" checklist item for this workspace): the graph was NOT committed.** Commit 4df09fe "Add the project graph (hourness bootstrap tk-4epcc0b1)" is an EMPTY commit (tree identical to parent 52c6aff; ls-tree shows only the original 6 project files); all 16 docs/graph/nodes/*.json are untracked (git status ?? docs/graph/nodes/). Metrics journal pins the sequence: record_human_answer ok (18:57:18) → Bash "git" out=error (18:57:26, 351-char result) → Bash "copy-item" denied by main-agent-no-write (18:57:35) → later commit lands as empty; execute.reconcile trunk-advanced event recorded files:[]. The closing message claims the graph was committed — claim mismatch. Root cause of the first git error not yet extracted (session log session.v4.jsonl.zstd is a multi-frame/custom container; node zstd decodes only the header frame — "Unknown frame descriptor" on the stream). Follow-up for the bootstrap line: extract the session log (DSH tooling), find why the first git call failed and why the handback's graph-tracked verification accepted an empty commit.
- Notes: auto session title 「本地免费跑检查项目全流程」 (glm session-title call). File-tools-only late/turn-end shadow records for the graph-node writes (designed fallback, mode late). Model advisory card 「建议换强一点的模型 / 这次就用它」pinned throughout; never clicked (advisory only, does not block).

## Flow 2 — b10-new /wish (new-project path attempt) — STOPPED, containment done; prep defect + one design question

- Session session-8ec86e24… in workspace b10-new; /wish 做一个把 Markdown 文件转成 HTML 的小工具. Shot b10-f2-frame1.png.
- **The new-project path did NOT engage.** ws-new is an empty dir INSIDE the main checkout's working tree; the takeover's path judgment walks git upward and resolved projectRoot = the MAIN checkout (journal: "path":"existing","because":"已有项目：800 个代码文件、1470 个提交、清单 package.json、pnpm-lock.yaml","projectRoot":"C:\…\GLM-Hourness","graphDir":"…\ws-new\docs\graph","head":"e04a67c"). Split-brain by construction: journal/rules/metrics resolve to the main checkout's .llm while the graph dir pinned to ws-new/docs/graph. The takeover scanned 1706 files and the model started proposing main-repo graph structure.
- Containment (all evidence kept, nothing deleted): /wish off at 19:08:04 (command success) detached the main-agent role but did NOT close the takeover (journal no close entry; a second /wish off replied 「这个会话本来就不是主 Agent」 while the takeover stayed open — open question for the bootstrap line: should /wish off close the takeover it holds?); /hourness-init off at 19:19:47 closed it: journal seq 6 `takeover-closed reason=abandoned counts.proposed=35` (the model's 35 proposed main-repo nodes all discarded). The runaway turn spent ~1.7M tok (flash, off-peak) before ending on its own.
- Main checkout after containment: git status clean (docs/graph untouched, HEAD e04a67c); artifacts kept as evidence: .llm/bootstrap/journal.jsonl (6 lines) + .llm/bootstrap/tk-xytako7c/{defaults.md,files.txt,floor.md,history.tsv,questions.md,scan.json}; ws-new back to empty.
- One positive observation inside the accident: the wish card told the person 「docs/graph 被 .gitignore 忽略了：项目图进不了 git」 — correct detection that the pinned graph dir sits under the main repo's ignored .llm/ tree.
- Verdict: flow 2 as planned (new-project path) CANNOT run from a workspace nested in an existing repo. Prep defect (b10-park.md item 3 seeded ws-new inside the checkout). If the orchestrator wants the new-project path L4'd, re-seed the workspace outside any repo (e.g. %TEMP%\b10-new) and rerun; not done by this lane (scope + real-token cost already incurred).

## Flow 3 — b10-repo /hourness-init status (read-only) — DONE (asserts pass)

- Session session-56aeefea… in workspace b10-repo (this checkout, cwd = main checkout). /hourness-init status ran at 19:20:44 (main-checkout metrics journal: command run + done, result success, cid cmd-41bda825-10). Shot b10-f3-status.png (onboarding view), b10-f3-status2/3.png.
- UI note: a command-only session keeps the /wish onboarding hero; the status output card is not reachable without starting a real message turn (same view behavior as flow 0). The output text therefore stays unrecorded here; the read-only asserts are filesystem-side and all pass:
  - .llm/bootstrap/journal.jsonl unchanged at 6 lines — status created no journal lines and no new tk-* dir (the only dir is the flow-2 accident's tk-xytako7c, kept as evidence).
  - git status --porcelain -- docs/graph: empty (main graph untouched); HEAD e04a67c unchanged.
- Execute state of flow 1 at close time: task-2 worker installed deps in .worktrees/hz-task-2 (node_modules, package-lock.json present), not yet merged (advances.jsonl has only the takeover's trunk advance); the flow-1 main session idle (sidebar 已完成).
