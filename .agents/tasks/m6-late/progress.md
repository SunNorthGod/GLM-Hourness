# m6-late：脚本门 LATE 机制与投递

分支 `m6-late`，基线 `0c5ebd21`。任务：ORCHESTRATION §16.16「没有做」清单里 sgate 车道留下的四件——
执行器 `late`（超时后台跑到 10 分钟、晚到拦下落地）、`notices` 投递、主 Agent 提醒「有没提交的改动」一行、
探针场景 `rules-script`（抬高探针地板）。

## 读到的规格（动手前定稿）

### late 生命周期（设计 §6.7「超时之后」+ 循环板设计 0.6 §6.6）

1. `purpose: 'gate'` 的脚本到超时（缺省 10 s，条目 1–30 s）：`runScript` 当场返回
   `{kind: 'timeout', stdout, stderr, durationMs, late?: Promise<LateScriptResult>}`；进程**不杀**，转后台继续跑，
   到 `GATE_HARD_CAP_MS`（600 000，10 分钟）才结束。判定（超时按条目 `onError`）当场生效，调用照走。
2. 后台进程不占 `GATE_CONCURRENT`（4）的位置（超时返回时让出 lane 槽），只算进 `GATE_LATE_MAX`（8，每项目）；
   后台满时新超时的那个**当场结束**、`timeout` 不带 `late`。排队满（`GATE_QUEUE_MAX` 16）照旧当场返回不带 `late` 的
   `timeout`（没有起进程）。
3. `LateScriptResult`（promise 不被拒）：`exited`（exitCode/stdout/stderr/durationMs/truncated，输出是全程累计）、
   `crashed`（reason `'signal' | 'io'`）、`capped`（跑满硬上限被结束整棵树）。
4. 调用方 `signal` 在超时之后中止：执行器结束后台整棵树，`late` 得 `crashed('signal')`。私有副本在进程真正结束时删除。
5. 宿主退出时后台进程随执行器清理结束（注册 process exit 处理，尽力而为），规则板不补记（V14）。
6. `work` 一路不变：到时结束整棵树，无 `late` 字段。

### 规则板一侧（晚到结论的含义，rules 设计 §6.7）

- 三个调用方共用 `runJudgedScripts`：
  - **门**（gate.ts）：脚本结局是超时且按 `onError` 判放行时，门不等 `late`，先把判定交出去；每个超时放行的脚本
    带着它的 `late` promise 交给 `src/rules/late.ts` 异步等。最终判定是 block/queue（调用没执行）时晚到结论只记下。
  - **checkCall** 与**等待单重喂**：不等 `late`，返回前用 `signal` 中止，执行器结束后台整棵树；行为与今天相同
    （超时按失败做法判，notes 照旧）。重喂期间原先那次调用的后台脚本继续跑，互不影响。
  - 门里最先拦下的脚本结束等待；gate 一路不再中止其余脚本（设计「其余照『超时之后』跑完、只记下」——门至多等
    最长超时，`Promise.all` 以各自超时为界）。
- 晚到结论落地（`src/rules/late.ts`，门最终判定放行/record/inform 时全额落地）：
  - 晚到退出 2：违规流水一行 `{rule: 'rules:<id>', mode: 'late', effect: 'block', tool, agentId, sessionId, signals,
    script: {path, sha256, outcome, ms}, correction}`（RecordsLateRecord 形状，额外字段 spread 进行的现状与
    gate `note` 相同）；指标 `rules.late-verdict`（`{rule, sig, result: 'exited', afterMs, told}`，schema 已在
    src/shared/metrics.ts:207、calc.ts 已消费）；当场给主 Agent 发 §6.4「Late block」段（来源 `hourness-rules-late`，
    按 wake 表 steer/inject/followup）。收件人：调用会话派发链的根（M3 未合入，dispatchRoot 同 tickets 一路）。
  - `capped`：指标带 `result: 'capped'`；发第二段文字（did not finish within 10 minutes … was stopped）。
  - 晚到退出 0/3/其他退出码与 `crashed`：只记 `rules.late-verdict`，不发消息（`told: false`）。
  - 发不出（gone/unavailable/failed/读不出登记）：写 `notice-add`（kind `late-block` | `script-capped`）进
    `state.notices`，下次主 Agent 在本宿主走步由每步提醒带上；行健康 degraded 一次（两种情形都降）。
  - 门最终判定是 block/queue 时：所有晚到结论只记指标，无流水行、无消息。
- 流水与指标已预埋：`RulesLateRecord` 在 src/guard/records.ts:121；`rules.late-verdict` body 在 src/shared/metrics.ts:207；
  calc.ts 的「晚到判定」「晚到的拦下」两行已在读它；规则页 notices 一节（view-build.ts:260、ui/src/rules/model.ts:488
  「主 Agent 下次走步时会收到」）已在。

### notices 投递（每步提醒）

- reminder（src/rules/reminder.ts）对主 Agent（`caller.role === 'main-agent'`）把 `state.notices` 每条一行带进正文；
  提醒真的注入（reason 算出）时对每条写 `notice-delivered`（board apply，harness）——「发出后删」。正文摘要变化
  自动驱动「带上一步、删掉后下一步去掉」。

### 主 Agent 提醒「有没提交的改动」一行（设计 §6.4 0.9 段）

- 条件：`<root>/.llm/rules/repo-written.json` 存在（规则板写过仓库规则目录）且 `git diff --quiet HEAD -- <规则目录>`
  退出非 0。拥有写入的宿主写入之后每 60 s 查一次（execFile，不经 shell），退出 0 就不再查，直到 repo-written.json
  的 `at` 变了再查。实现放 `src/rules/repo-changes.ts`（watcher 挂行的 60 s 周期），reminder deps 读它的结论；
  行文 `Rules board: <规则目录> has changes the human made that are not committed yet; include them in your next commit.`
  只给主 Agent。与摘要一起进 digest，一致后下一步注入一次去掉。
  - 实现偏差（记入合入说明）：设计写「拥有写入的宿主」查；实现是每个装了行的宿主都查（repo-written.json 在盘上、
    同一仓库同一事实，多宿主同看一行无害），省去跨模块的写者追踪。

### 探针场景 `rules-script`（设计 §15 R4 L3 行）

- 每场景一个 scratch git 仓库；批准走真路：主 Agent `rules_propose`（脚本全文在 body）、人两次
  `/rules accept <p-…>`（第一次只展示原文，30 分钟内第二次生效——proposal id 是随机 `p-<8hex>`，probe-llm.mjs
  的命令输入加 `{proposal:<n>}` 占位符，从 `.llm/rules/state.json` 取第 n 个 open 提议 id）。设计写「预置」；
  批准时刻不能进仓库文件（adoptRepo 只认本机批准），预置只能做到无批准的 pin（不跑、按失败做法），所以批准走
  propose/accept 真路，同场加钉 accept 流程。
- 步骤：propose×2（拦截脚本 + 慢脚本：睡 15 s 退 2）→ accept×4 → 命中词调用（拒绝、文字含脚本理由、未执行）→
  慢词调用（~10 s 后放行、命令真的跑了）→ 后续步等晚到投递（~15 s 退出 2 → Late block 进后续请求）→ done。
- 检查：拒绝文字与未执行；拦下流水行；慢调用已执行；Late block 消息进主 Agent 请求；流水 `mode: 'late'` 行
  （带 script 字段）；指标 `rules.late-verdict`；用户级目录没有 `rules/`（§1.4 第 14 条）。
- 地板：加 N 条检查，612 → 612+N，新地板记 HANDOFF 车道记录与本地 progress。

### 已核对的事实

- 执行器现状：`runProcess` 超时 killTree；gate 队 `enterWithin` 排队时间算进超时；私有副本 `finish` 回调删；
  副本删除失败有 1 s 重试 + 1 小时清扫兜底。`ScriptRequest` 注释明说后台一半未做。
- `judge.pending` 的 `timeoutSeconds` 已按 `validateScriptAction` 填（未写→30 s 封顶）；`judge` 在自带动作 block 时
  不给 pending（不起进程）。
- gate `note()` 以 spread 写进 GuardRecord，`signals` 等额外字段运行时进流水而类型不声明（现状沿用）。
- `notice-add` / `notice-delivered` 两个 op（request/plan/permissions）与 `Notice` 类型已在 model，无调用方——
  本车道接上第一处真实调用方。
- 现成测试件：`approveScript`（rules-helpers.ts，走真 accept 路批准脚本规则）、rules-gate.spec 用真执行器跑真
  node 脚本；loops-script.spec 用真子进程。

## 实施顺序（一件事一个提交）

1. 执行器 late（src/loops/script.ts）+ loops-script.spec 的真进程用例。
2. script-run 分模式（门带 late 出口，checkCall/重喂照旧中止）+ rules-script.spec 用例。
3. src/rules/late.ts（流水行、指标、消息、notices、降级）+ gate 接线 + metrics.ts 事件分支 + 规则门/晚到 spec。
4. reminder notices 行 + notice-delivered + repo-changes watcher + reminder「有没提交的改动」一行 + row spec。
5. 探针场景 rules-script + probe-llm 占位符 + 文档（ORCHESTRATION §16.16、HANDOFF 车道记录）。

## 门禁与落地

- 本分支先过 build / preflight / npm test（棘轮 eslint 69 / knip 18 / jscpd 1）。
- main 0c5ebd21 有已知探针红（exec-review answer race，answer-race 车道所有）：**不在本基线跑全量探针**；
  等 answer-race 落 main 后 rebase 再跑（期望 612+N/612+N），全绿后 ff 合入、推 origin/main + github main。
- 不碰兄弟工作树；不碰 ~/.dsh；日志前缀 `late-`。

## 实施记录（2026-11-18）

### 提交 1（063ac1dc）：执行器 late
- `src/loops/script.ts`：`ScriptResult.timeout` 带 `late?: Promise<LateScriptResult>`；`LateScriptResult` = exited/crashed('signal'|'io')/capped；`GATE_HARD_CAP_MS`（600s）、`GATE_LATE_MAX`（8）；后台按项目计数（不占 GATE_CONCURRENT 槽，超时返回即让出）；后台满时超时当场结束整棵树、无 late；`signal` 超时后中止 → crashed('signal')；副本在进程真结束时删（killed 结局有 1s 重试）；宿主 exit 尽力结束后台 pid（V14）；`ScriptRequest.hardCapMs` 测试专用（≤ 硬上限）——对循环板设计 §6.6 接口的一处加字段，随合入说明报备。
- `tests/loops-script.spec.ts`：新 6 例（超时后台跑完、lane 释放+全程输出、超时后中止、注入上限 capped、后台满 8 第 9 个当场结束、work 不变）+ 常量钉住 + 旧「超时整棵树结束」用例改写为新行为。25/25 过。

### 提交 2（本批）：晚到结论落地 + notices 投递 + 提醒行
- `src/rules/script-run.ts`：`runJudgedScripts` 增 `late` 门；晚到模式下不中止（首个 block 不再取消其余），超时且按 onError 放行的结局带 `late` promise（ScriptOutcome.late）；非晚到（checkCall/重喂）行为不变，返回前整树结束。
- `src/rules/late.ts`（新）：等 late、落地含义。晚到退 2 且调用已执行 → 流水行 `{rule: 'rules:<id>', mode: 'late', effect: 'block', signals, script: {path, sha256, outcome, ms}, correction}`；指标 `rules.late-verdict`（rule/sig/result/afterMs/told，emit 一次）；当场给主 Agent（调用会话派发链根，walkToRoot）发 Late block / capped 文字（§6.4 两段原文）；发不出/不在本宿主 → notice-add 进 state.notices；两种都行健康 degraded 一次。verdict block/queue 或晚到退 0/3/其他/crashed → 只记指标。
- `src/rules/gate.ts`：runJudgedScripts 带 late:true；判定后收晚到脚本交 deps.late（缺省真 handler，测试可换）；GateDeps 加 io。
- `src/rules/metrics.ts`：RulesLateVerdictEvent + toEmittedLate + emitLateVerdict。
- 提醒（`src/rules/reminder.ts`）：主 Agent 正文带 state.notices（每条一行）与 repo 行；真的注入时 `delivered(root, ids)` → 行写 notice-delivered（发出后删）；ReminderDeps 加 repoLine/delivered。
- `src/rules/repo-changes.ts`（新）：repo-written.json 存在且 `git diff --quiet HEAD -- <规则目录>` 退 1 → 行；退 0 停查，repo-written 的 at 变了再查；行文按设计原文。挂行 60s 周期（index.ts，REPO_CHECK_MS）。
- 共用件：wake.ts `walkToRoot`（tickets 的 dispatchRoot 与 late 的收件人同一路）；call.ts `callSummary`（tickets 与 late 的摘要同一段）；tickets `signatureOf` 导出；execute/git 加 `diffQuiet`（封闭清单断言同步更新）；rules-helpers 加 git/gitTest/Repository（rules-repo.spec 改用）。
- 测试：tests/rules-late.spec.ts（7 例直打 handler）；rules-gate.spec 加 2 例集成（真脚本退 2 落地 + queue 判定只记）；rules-row.spec 加 2 例（notices 随提醒 + 划掉；repo 行来去）；rules-repo-changes.spec.ts（4 例）；rules-row fixture 加 period(everyMs)。全部绿。

### 已知偏差（随合入说明报备）
1. 「拥有写入的宿主」查 git diff → 实现为每个装行的宿主都查（repo-written.json 在盘上即查，同一仓库同一事实）。
2. 执行器接口加测试用 `hardCapMs`。
3. 晚到投递的 metrics `told` 在送达判定后 emit（一次事件，不是先 false 再改 true）。

### 提交 3：探针场景 rules-script + probe-llm 占位符 + 文档
- `scripts/probe/probe-llm.mjs`：`withProposals(ctx, request, input)`——命令输入里的 `{proposal:<n>}` 换成 `<cwd>/.llm/rules/state.json` 里第 n 个提议（rules_propose 顺序，不看状态：accept 之后序号不漂移）；接在 stream() 的 command 分支。
- `scripts/probe/run-probe.mjs` 场景 rules-script（glm-5.3，空规则文件的 git 项目）：rules_propose×2（DeferredToolCall；r-script-block：node 脚本退 2 带理由，词 `rules-probe-script`；r-script-slow：睡 9s 退 2，timeoutSeconds 5，词 `rules-probe-slow`）→ `/rules accept` ×4（{proposal:1}/{proposal:2}，第一次给看原文、第二次生效）→ Bash 拦词（拒绝文字含脚本理由）→ Bash 慢词（~5s 超时放行、命令真跑）→ Start-Sleep 8（等晚到）→ Read → done。8 条检查：运行干净+四次 accept 的两种回话；两钉带 approvedAt+脚本文件在盘上；拦词拒绝+流水 enforce block；慢词放行+无 enforce；晚到流水行（mode late、script.outcome exited、ms≥8000、correction 是理由）；后续请求恰一条 Late block（5s/Bash/理由）；`rules.late-verdict` 恰一条（exited、told、afterMs≥3000，readLog(ws)）；用户级无 rules/。
- 偏差报备：设计写「预置提议」→ 实现为场景内 propose+两次 accept（脚本批准只认本机 approvedAt，仓库文件带不进去，approval 只走 proposal-accept）；提议 id 随机 p-<8hex>，脚本步骤够不到，因此加 probe-llm 占位符。
- 文档：ORCHESTRATION §16.16 标题与「没有做」重写（新段落：超时之后的晚到、主 Agent 提醒的未提交改动；L2/L3 清单更新）；§16.6「还剩」句改为已实现；§16.7 L2/L3 清单补 rules-late/rules-repo-changes 与 rules-script；§16.11 设计没写死处 mode 行补 late；§16.12 每步提醒补 notices 行与 repo 行、验证清单同步；§18 两处「随门里跑脚本一步」陈旧句改已实现、script 条目「以后导入」改已导入、work/gate 的 late 区分补一句。
- 门禁本批跑：build / preflight / npm test 全绿（棘轮 eslint 69 / knip 18 / jscpd 1）。
- 落地：rebase 到 main（answer-race 已修）后跑全量探针，期望 612+8/620；新底线与提交哈希在落地批补记 HANDOFF。

### 提交 2 的修正（fixup 进 b6a2c0a5）：普通路不再留下后台进程
- 门路执行器按 §6.7 的契约总是先安排后台位（runScript 的 gate 分支对每次门脚本都构造 LatePlan），超时结局带 `late` 提前返回；`runJudgedScripts` 的普通路（checkCall/重喂）在收尾 abort 掉后台树之后没有等它真的死透——违反了自己注释「returns 时没有进程留着」，`tests/rules-script.spec.ts` 的失败做法用例在清库时 EBUSY（30s 脚本被 abort 杀掉的同时 rm 已在跑；昨夜更有一棵 21:39 的树成了僵尸，含孩子进程）。修正：普通路收齐结局里出现的 `late` promise，`controller.abort()` 之后 `await Promise.allSettled(lateness)`——每个后台运行的 promise 在进程真结束时（或硬上限到时）落定，等待由硬上限兜底。晚到路不变（本就不 abort）。
