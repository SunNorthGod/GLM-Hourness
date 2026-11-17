# desktop L4-new progress (rc.3)

Lane: desktop-l4-new (main checkout @ ec51d46f). Isolated desktop instance only
(CDP, no system input; never the person's instance/inputs). Launch recipe:
`.llm/desktop-l4-new/scripts/start.ps1`, port 9353, marker
`--glm-hourness-dl4new`, DSH_HOME `.llm/desktop-l4-new/dsh-home` (fresh; profile
trio modeled on the B10 layout like w1/w2: glm channel on + flash model +
danger-full-access via cordis.patch.yml; NO operate override — shipped defaults),
node_modules junctions to this checkout's packages (build-info ec51d46, dirty
from untracked lanes only), credentials/device-mid COPIED read-only from the
real home into scratch `dsh-home/glm-hourness/` (delete at teardown; NOT while
the host runs). Workspaces live OUTSIDE the repo in `%TEMP%\l4new\ws-*`, each
`git init`ed with one seeded graph node (`goal-1`, via the graph CLI, so /wish
does not open the takeover): `ws-loops` (item 1 loops consent), `ws-rules`
(item 2 rules script gate). desktop-lock owner.txt created before boot.
Installed app: DeepSeek Harness FileVersion 0.2.2-rc.3 (verified via
VersionInfo before boot). Checks: 1 loops consent path (§18.14) / 2 rules
script gate (§16.16) / 3 rc.3 command card / 4 rc.3 welcome-page quirk.
One hard rule: never touch the person's inputs or instance; own instance
closes via CDP Browser.close only; an exit-confirm #32770 stops that step.

## Log

- [prep] 2026-11-18 03:46+08 — main @ ec51d46f (build-info `ec51d46 dirty`,
  dirty = untracked lane dirs only, tracked tree clean). Installed app
  verified 0.2.2-rc.3 (FileVersion via VersionInfo). No DSH desktop instance
  running at start; desktop-lock created. Scratch home assembled: profile trio
  from the B10 layout (no operate override), junctions verified (dsh-hourness →
  packages/hourness), two workspaces in %TEMP%\l4new (git init + one seeded
  graph node each, via the graph CLI — a question node alone is refused:
  "parent: is required for a question node", so each workspace got a standalone
  proposed `goal-1`), credentials/device-mid copied (sizes only: 1374/36 B).
  Note: an L3 probe lane holds its own headless harness processes
  (run-probe.mjs, temp glm-hourness-probe-…, scenario loops-peak-restart) on
  this machine since 03:46 — identified, NOT mine, not touched.
- [item 4 CONFIRMED + PASS, with two findings] rc.3 welcome page on a fresh
  user-data-dir:
  - Boot 1: the app's own welcome window is a SEPARATE renderer target
    (app.asar/renderer/welcome, file:// URL), not an overlay in the main
    window; main UI (dsh-app://app/) loads and renders behind it. Content on
    my layout: 欢迎使用 DeepSeek Harness / 组装无限可能，共探智能上限, buttons
    登录 + 添加 API Key — NO 开始设置 button anywhere (shots/c0-welcome.png).
    The profile carried desktopNextOnboarding outcome=completed, so any
    DSH-host onboarding (开始设置) is suppressed; the reporter's 开始设置 click
    likely corresponds to that surface or a flow step reachable only by
    logging in. The quirk stands as: rc.3 pops its own welcome window on a
    fresh user-data-dir REGARDLESS of the profile's onboarding marker.
  - FINDING (do not repeat): closing the welcome window via CDP
    (Target.closeTarget) TERMINATES the whole desktop app (pid 60528 gone,
    CDP 9353 refused) — the welcome window is not a dismissible overlay; on
    boot 1 the instance died this way and was rebooted (boot 2, same scratch
    home).
  - Boot 2 (same user-data-dir): the welcome window re-pops (it re-pops until
    the flow is completed; shots/c0-welcome-boot2.png, same login step).
  - Passing it WITHOUT logging in: 添加 API Key → 稍后配置 (configure later) —
    two CDP clicks; the welcome window then CLOSES ITSELF and the app stays
    alive (shots/c0-welcome-apikey.png, c0-after-welcome-pass.png). No restart
    after passing yet in this lane, so whether it stays passed is not verified.
  - For future lanes: leave the welcome window alone; drive the dsh-app://
    target directly (it is usable while welcome is up); pass via 添加 API Key →
    稍后配置; never Target.closeTarget the welcome window.
- [setup fix 1] My first storages/workspace.json was INVALID JSON (heredoc
  backslashes not escaped: `"C:\Users\..."` — `\U` is an illegal JSON escape).
  The host never rewrote it and degraded: workspace picker stuck on
  正在加载工作区…, no workspaces, recurring console error
  `[session-controller] control stream failed: … active Service
  "sessionController" is unavailable`. Rewritten via python json.dump (boot 3)
  → all rows came alive (workspaces listed, GLM pill, presets). Lesson:
  write scratch storages with a real JSON emitter, never heredoc.
- [item 3 PASS] rc.3 command CARD: /glm-status run in the ws-loops session
  (session-618301a6). In a never-messaged "hero" session the command only
  lands in the session log (`command/run` + `command/done` with the full
  table; shots/c3-glm-status-card.png shows the empty hero — no render), and
  this matches rc.1's L4 record. Once the session has real conversation
  content, rc.3 renders the command as a visible one-line row
  「>_ glm-status · glm-zcode：已登录（套餐 coding-plan…」 which EXPANDS on
  click into a full card with the entire /glm-status output (login line,
  高峰, 额度, and the whole 21-row 行健康 table) — shots/
  c3-card-in-live-session.png (collapsed) and c3-card-expanded.png (expanded).
  The polish-lane expectation is CONFIRMED: the GenericCommandCard fold is in
  rc.3. Row load on rc.3: 21 rows, all 已加载/生效/部分生效 except `operate`
  未加载 (factory-disabled — I did not override it); scratch credentials work
  (glm-zcode logged in, coding-plan, quota read). No failure rows. Evidence:
  session log of session-618301a6 (command/done seq 4 carries the full table).
  Lane note: the rc.3 composer is a plain DIV (`div[class*="_input"]`), NOT a
  contenteditable — cdp.mjs typefile needed a focus-selector patch; Enter via
  synthetic key events does NOT submit, click the `发送消息` button instead.
  Also: MSYS path conversion mangled a literal `/glm-status` argv exactly as
  w1 recorded — all composer input goes through typefile.
- [item 1 MOSTLY PASS, two product findings] Loops consent path (§18.14) in a
  main-agent session of ws-loops (session-618301a6, main agent via plain
  `/wish` — with a seeded graph node the takeover does NOT open and an empty
  /wish claims the holder without any interview; ENTER_NOTICE rides the
  step-mailbox into the next real message):
  - loop_propose: the model (flash, via LocalToolSearch → DeferredToolCall)
    proposed a script entry add; first attempt errored on `once` format and
    the model self-corrected to full ISO. Proposal `lp-0e15eecf`, via `graph`
    (as the code predicts: dirFor resolves whenever the graph row is loaded —
    board-path proposals are NOT reachable from a desktop main agent).
  - `/loops accept lp-0e15eecf` on the OPEN graph proposal returned the
    designed refusal verbatim: 「这条提议在项目图上交给人：在对话里同意就行，
    不用打命令」 (shots/c4-loops-accept-refusal.png). The two-step happy path
    (first shows detail, second within 30 min takes effect) is only for
    via:'board' proposals, which a desktop main agent cannot create; the
    refusal IS the command path's real desktop behavior.
  - propose_to_human with attach loops:lp-0e15eecf worked: the person saw the
    detail verbatim — the script in a code fence, the ① recommend line with
    the proposal id, cost line, and the five cautions
    (shots/c4-loops-proposal-shown.png). The question node (question-1) landed
    on the graph.
  - The person agreed in chat (「同意，就按这个加。」): the model's
    record_human_answer passed every check and acceptProposal wrote as
    `harness` — journal seq 2 (op add, actor harness, via chat, relay
    recorded, question question-1, proposal lp-0e15eecf) and seq 3 (proposal →
    accepted). Entry `u-f3edf4c6` + script written under docs/loops/.
  - CONSENT PINNING VERIFIED byte-level: the script file bytes ==
    proposalAfter.scriptText stored at propose AND at accept (True/True);
    digest `4ecaa945e62e` identical in both records; entry
    action.script.sha256 `9d64bf98…` == actual sha256 of the file bytes.
    source: {kind: person, via: chat, relay 「同意，就按这个加。」, question,
    proposal}. The board view renders the person's entry exactly per §18.7:
    「你在对话里加的：“同意，就按这个加。”」 + 「脚本：你 11 月 18 日 同意的
    那一版」 + scriptStanding agreed (view.json). /loops listing shows
    你自己加的（2 项） with the ids line.
  - FINDING 1 (product, from loops-runner impl-plan §52): a script/check
    entry with a wall-clock `when` has NO firing path. `clock.ts` ("时间触发
    的 script/harness 条目由循环行自己的钟跑") was deliberately deferred when
    person script entries could not exist; S5's consent channel now CREATES
    them (validateWhen accepts once/daily/cron for script actions), so the
    "现状无缺口" assumption broke. My accepted once-script entry
    (u-f3edf4c6, at 04:18+08) never fired: no loop-fired 45+ min past its
    time, no DSH binding (bind.ts timeEntries = tell-main only), while the
    board renders it as runnable (「跑脚本 …，每次都告诉主 Agent」, state ok).
    Corroboration: /loops shows 下次 only for the tell-main entry.
  - loop_note: the TOOL's gate verified — the model called loop_note on the
    delivered-reminder entry and got exactly the designed invalid refusal
    `{"code":"invalid","message":"这一项还没有交给你的运行","field":"entry",…}`;
    notes.jsonl not written. The HAPPY PATH is blocked on rc.3 by FINDING 2:
  - FINDING 2 (rc.3 adaptation, §18.10 delivery recording): the DSH task the
    board bound for the person's tell-main entry (u-09699c64, once 04:30,
    binding schedule-2fd493a7) FIRED and was delivered — the holder session
    received the [SCHEDULE REMINDER] user message with
    schedule_id_json (session seq 150), the step-line listener ran and
    appended 「Loop board reminder for u-09699c64.」 — but the reconcile did
    NOT record the run: no loop-fired/loop-done, state.last null (the line
    text is the no-run fallback), so loop_note's run gate has nothing to hang
    on. On rc.1 the same chain recorded the cold-fire runs (w2 observation).
    Likely shape drift: the rc.3 host stores lastDelivery on the OUTER
    schedule task row (verified present, messageId 19deafda…) while the
    inner `record.lastDelivery` is null, and the board's catalog view appears
    to carry no lastDelivery — bind.ts:438 (`const delivery = task.lastDelivery`)
    never sees it. Needs an owner pass against the rc.3 host's catalog shape.
- [item 2 PASS] Rules script gate (§16.16) in ws-rules: main agent via
  `/wish` (session-c352d264), rules_propose → proposal p-f0eb17e2 (word
  \bl4gate\b, node script, exit 2, onError block) → the person ran the
  `/rules accept` TWO-STEP in-session: first accept returned the detail with
  the script verbatim in a code fence (docs/rules/scripts/
  r-l4gate-script-gate.mjs, 超过 10 秒算没答…), second accept 30 分钟内 took
  effect — proposal accepted, script file written, sha256 pinned
  (13213f93…), rule active. Trigger: a Bash call containing `l4gate` was
  BLOCKED by the gate in TWO sessions (the flooded main-agent session at
  20:57:20Z and a plain session 6fd2e7ef at 21:00:12Z) with the full
  four-part refusal where the script's reason is visible verbatim:
  「Rule r-l4gate-script-gate "Bash 命令含 l4gate 时先跑脚本再判" (set by the
  human at 2026-11-18 04:47, until lifted) ran its script
  docs/rules/scripts/r-l4gate-script-gate.mjs, which blocked the call:
  "l4new script gate blocked this call\n"」 + Right path + the /rules lift
  Exception. violations.jsonl: enforce block lines (rule rules:r-l4gate-
  script-gate, tool Bash, mode enforce, effect block) + followup records.
  The model then read the script file and reported the block honestly with
  the lift path (shots/c7-gate-blocked.png). The approve-then-gate flow
  works end to end on rc.3 desktop.
- [rc.3 HOST FINDING 3 — schedule-notice flood] With TWO projects' loop
  boards live in one host (ws-loops + ws-rules, each with a main agent),
  the host delivered [SCHEDULE CHANGE] user messages to the holder sessions
  for EVERY schedule mutation (rc.1 skipped the actor session per §18.10's
  wiring). Worse, the two boards' orphan cleanup fought over identically-
  titled plugin tasks (each board deletes the other's 「每天下班前」 task,
  then recreates its own): schedule.json held THREE duplicate active daily
  tasks at once, and the two main-agent sessions received 12,922 + 4,950
  [SCHEDULE CHANGE] messages in ~9 minutes (~1,600/min peak, verified by
  minute buckets) — flooding both session contexts until the ws-rules main
  agent was unusable mid-lane. `/wish off` in ws-rules stopped the fight
  within one beat: flood to zero, schedule.json settled at 2 tasks. Root
  hints (owner to fix): the actor-skip for [SCHEDULE CHANGE] is gone on
  rc.3, and the boards' remove path lacks a cross-project guard (a
  board-shaped task bound to ANOTHER project's holder session is treated as
  an orphan/duplicate).
- [rc.3 CLIENT FINDING 4 — bundle UI compat] rc.3's
  @dsh-client-ui/primitives no longer exports `useAnchoredPosition`:
  ChannelPill (dsh-glm-zcode) and Pill (dsh-hourness) throw on render —
  console: `hourness-ui: wish button failed to render: TypeError: …
  useAnchoredPosition is not a function`. Consequences observed: the /wish
  composer button does not render, and the plugin view tabs (项目图/循环板/
  规则板/经验页) do NOT appear in the session views menu (对话/轨迹/统计/…)
  — the loop board PAGE is unreachable from the UI on rc.3; /loops listing
  + view.json remain the evidence channels. Needs a bundle-side rc.3 client
  adaptation pass (same class as the 3.16→rc.1 UI drift lanes).
- [host observation] The rc.3 session log writes at least one malformed
  JSON line (the [SCHEDULE REMINDER] delivery, session-618301a6 seq 150
  contains a raw control character at char ~406; verified byte-level via
  fzstd) — line-oriented log readers must tolerate it.
- [rc.3 UI navigation notes for future lanes] the composer is a plain DIV
  (`div[class*="_input"]`, contenteditable=false); after switching sessions
  the editor often does not accept Input.insertText until a page reload;
  the reliable composer flow is: (page reload if the view was just
  switched) → typefile → click `发送消息`; the Send click sometimes no-ops
  right after a model turn — retry. Sidebar ⊕ responds to real mouse events
  (click-type.mjs), not synthetic el.click().

## Teardown state

- Instance NOT closed: `Browser.close` on CDP 9353 raised the #32770
  exit-confirm class (the idle main-agent session-618301a6 is the likely
  holder, same as wave 1); per the hard rule the dialog was NOT dismissed
  and no process was killed. The instance is left RUNNING with the dialog
  up; the person may click 退出 (or 取消). CDP 9353 still open at report
  time. Boot lineage: boot 1 (03:48) died when the welcome window target
  was closed via CDP (see item 4); boot 2 (03:51) closed cleanly via
  Browser.close at 03:58; boot 3 (03:59) is the one left running.
- Credential/device-mid copies STILL in
  `.llm/desktop-l4-new/dsh-home/glm-hourness/` (1374 B credentials.json,
  36 B device-mid.txt) — deleting under the running host judged worse
  (w1/w2 precedent); delete after the person closes the instance, or wipe
  the whole `.llm/desktop-l4-new/` directory then.
- desktop-lock released (owner.txt deleted) after the last item.
- Quota: flash tier only. Scratch-home usage.jsonl: 214 GLM calls, input
  1.48M tokens total (mostly cache — the composer's window showed 缓存命中
  66–95%), output 10.5K. The GLM pill window showed 已用 12% (5h) at 04:05
  and 3% after the last turn. The [SCHEDULE CHANGE] flood did NOT trigger
  model requests (the notices are inbox/log writes, not turns).
- Sessions left in the scratch home: ws-loops session-618301a6 (main
  agent; the consent-path session with the two person entries u-f3edf4c6
  script-once [never fires — finding 1] and u-09699c64 tell-once [fired,
  delivery unrecorded — finding 2]), plus five stray hero sessions from
  the picker navigation (harmless, empty); ws-rules session-c352d264
  (flood-poisoned context, /wish off'd) and session-6fd2e7ef (plain; the
  gate-block evidence session). All sessions ended turn/end completed at
  last check.
- Workspaces stay in %TEMP%\l4new\ (ws-loops, ws-rules) with the seeded
  goal-1 nodes, the accepted person entries under docs/loops/, and the
  approved rule under docs/rules/ — they are the on-disk evidence; wipe
  with the lane directory when done with the report.




