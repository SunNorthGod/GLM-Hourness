# B10 desktop-L4 lane park note (2026-11-11 23:1x UTC+8, parked for ZCode restart)

Lane: B10 desktop L4 (dispatch item 2 of HANDOFF §10). Checkout owned by this
lane, HEAD cbc46d36 at start, working tree carries the lane's uncommitted work
(see below). Nothing committed, nothing pushed.

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
