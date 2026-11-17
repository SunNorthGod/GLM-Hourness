# dtm：规则板脚本的超时维护（d-timeout-measured）

分支 `dtm`，基线 `ec51d46f`。任务：§16.16「没有做」清单里 m6-late 车道留下的最后一件——
「agent 估计、按实测最慢一次的 3 倍调整（`d-timeout-measured`）的超时维护与留痕」。

## 读到的规格（动手前定稿）

### 缺口是什么

纯函数 `effectiveTimeoutSeconds` 已在（`src/loops/trigger.ts:667`，两块板共用）；
`validateScriptAction` 的上下文已收 `estimateSeconds`（trigger.ts:696）但规则板一侧三个调用点
（`rules/model.ts:833`、`judge.ts:255`、`proposal.ts` 的 `gateTiming`）都不传估计也不传实测，
于是没写 `timeoutSeconds` 的脚本永远取上限 30 秒，跑过之后什么也不会变。

决定与面板第 8 条要求：跑过之后 harness 把超时维护成最近若干次里最慢一次的 3 倍（估计让位），
钳在下限 1 秒与上限 30 秒之间；每个值记来源、时刻与旧值；每次超时记条目、上限、实际耗时与结局；
实测 3 倍超过上限时保持上限并告诉主 Agent；人在规则页看到四种来源。

### 估计从哪进来

- `ScriptAction`（`src/loops/trigger.ts`）加 `estimateSeconds?: number`（正整数秒）。规则板自己的
  字段检查（`src/rules/model.ts` `checkScript` 的键清单）放行并校验它；三处 `validateScriptAction`
  调用点把动作上的估计传进上下文。`rules_propose`（`proposal.ts` 的 `ruleProposal`）把
  `estimateSeconds` 带进存储的动作与提议脚本；`scriptCautions` 按 12:56Z 裁定 F7 的写法把
  第一次超时写成「3 倍估计」；`propose-tool.ts` 的工具描述补字段。
- 估计的会话留痕：`propose-tool.ts` 在提议写入成功后往账里追加一条 `estimate`（按规则 id 键，
  带 `proposedBy.sessionId`）。被拒的提议留下一条键指向永不生效规则的孤儿行——读的人只查在生效
  的规则，无害。
- 循环板条目本车道不给这个字段（loops `checkScript` 的键清单不动）：§18.2 剩下的
  「取值变更记录随提议通道走的那一半」是别的车道的活。

### 维护在哪里跑

- 新 `src/rules/timing.ts`，镜像 `src/env/timeout.ts` 的账本纪律（任务指名的模板）与
  `src/env/status.ts` batch-9 的来源口径：
  - 账本 `<root>/.llm/rules/timing.jsonl`（只追加、不入 git；`.llm/` 已被规则板运行时目录排除），
    行四种：`estimate`（propose 写）、`run`、`value`、`timeout`。
  - `run` 行：`{at, rule, run: <信封 run id>, ms, outcome}`——由 `runJudgedScripts` 对每个被读的
    结局追加（普通路与晚到路都算）；参与 3 倍的秒数取 `ceil(ms/1000)`，让整秒结果与页面 0.5 秒
    容差的 3 倍核对一致（`effectiveTimeoutSeconds` 向上取整）。
  - 到点的运行按它的上限计（镜像 env runner.ts:466 的 censored-at-limit）。
  - `value` 行：生效值与上一条 value 行不同时追加：`{at, rule, seconds, previousSeconds?,
    capped?: {wantedSeconds}, source: {by:'estimate', estimateS, session?} | {by:'runs', runIds,
    seconds, factor} | {by:'ceiling'}}`；用 `effectiveTimeoutSeconds({estimate, recent,
    purpose:'gate', previous})` 对最近 `RULES_RECENT_RUNS`（10，env 的 CHECK_RECENT_RUNS 同数）次算。
  - `timeout` 行：`{at, rule, limitSeconds, elapsedSeconds, outcome: 'allowed'|'blocked'}`——
    第 8 条的人面记录（条目、上限、实际耗时、失败做法怎么判的这次调用）。
  - 每条规则 KEEP：run 10、value 20、timeout 20、estimate 5（env 的 KEEP 同数）。
  - 永不抛错；问题以字符串交回调用方的出声通道。
- `judge.ts` 的 `JudgeOptions` 加 `timing?: ReadonlyMap<string, readonly {runId, seconds}[]>`；
  judge 把 recent 与动作上的估计传进 `validateScriptAction`。三个调用方各在判定前读一次账
  （check.ts 的 readView、gate.ts、tickets.ts 的 rejudge）——与它们已经每次读状态的路径同级。
- `runJudgedScripts` 加可注入的 `record`（缺省由 timing.ts 给）；结局读完后追加 run 行、算并追加
  value 行、追加 timeout 行，实测值被上限截住时按次告诉主 Agent。
- 告知：`notice-add` 新类型 `timeout-capped`（entries.ts 的 oneOf 与 model 的 Notice 联合各加一值）
  进 `state.notices`——主 Agent 的每步提醒带上、注入后 `notice-delivered` 删掉（m6-late 的机制，
  不新增投递路）。F8：harness 不抬上限只告知（规则板没有 check_limit 的对应物，主 Agent 修脚本
  或去说人）。

### 人看到什么

- `src/rules/view.ts` 的 `RulesScriptView`：`timeoutSeconds` 留着；`timeoutFrom` 从
  `'entry'|'design'` 展宽为 `'entry'|'estimate'|'measured'|'ceiling'`（显式 `timeoutSeconds` 保持
  `'entry'`——规则原文钉住它，不做实测维护，与 `validateScriptAction` 的契约一致，也保住探针场景
  `rules-script` 里 r-script-slow 钉的 5 秒）；新增 `held?`（`{by:'cap'|'floor', wantedS}`）、
  `history?`（value 行新的在前）、`timeouts?`（末 5 条）、`timeouts7d?`——只在 estimate/measured
  两类给（第 8 条：上限与固定值来源这几样可以没有）。
- `view-build.ts` 的 `scriptOf` 用与 judge 同一公式、同一份账算生效值；`RulesViewInput` 加账本行。
- `ui/src/rules/model.ts` 的 `scriptLines` 把 estimate/measured/ceiling 的超时行交给
  `ui/src/loops/timeouts.ts` 的 `checkCell`——与循环板页面同一套句子（第 8 条：面板照板给的写，
  自己不定数），不复制措辞（jscpd 棘轮 1）。`'entry'` 自己一行（「规则里写明的」），checkCell
  写不了它。

### 边界

- 显式 `timeoutSeconds`：钉住、不维护。
- 拦路脚本上限没有调高工具（`GATE_TIMEOUT_MAX_SECONDS` 是设计定的数）；`RulesScriptView`
  不加 `capRaised`。
- 晨报可见性不在本车道清单文字里（「超时维护与留痕」）；人面的一半按任务的
  「the person-visible line via the board's existing fields」落在视图字段上。

## 实施顺序（一件事一个提交）

1. `src/loops/trigger.ts` ScriptAction 加 `estimateSeconds` + `src/rules/model.ts`/`proposal.ts`
   校验与承载 + `propose-tool.ts` 描述与 estimate 行 + judge/validateScriptAction 传估计。
2. `src/rules/timing.ts`（账本）+ `script-run.ts` 的 record 接线 + judge 三调用方读账传 recent +
   timeout-capped 告知。
3. 视图与页面：`RulesScriptView` 展宽 + view-build + ui `scriptLines` 经 checkCell。
4. L2 各 spec + 文档（ORCHESTRATION §16.16「没有做」改写、§16.7 清单、HANDOFF）。

## 门禁与落地

- build / preflight / npm test（棘轮 eslint 69 / knip 18 / jscpd 1）。
- 全量探针地板 620/620，`GIT_CONFIG_*` 不设，日志写主检出 `.llm/logs/`、前缀 `dtm-`。
- rc.3 漂移的探针红先查 `.agents/tasks/rc3-probe/progress.md` 再复钉。
- 不碰兄弟工作树、`~/.dsh`、真实密钥；落地 rebase → gates → ff → 推 origin/main + github main。

## 执行记录（2026-11-18，续会 Instance 3）

- 续接：前两次实例死于 Start Plan 指标饱和。交接时报告 WIP 为 7 个文件，实为 11 改 + 2 未跟踪（`git status` 为准）：多出 `tests/rules-fixtures.ts`、`tests/rules-panel-model.spec.ts`、`tests/rules-timing.spec.ts`、`tests/rules-view.spec.ts`、`ui/src/rules/model.ts` 与未跟踪的 `src/shared/journal.ts`、`.agents/tasks/rc3-probe/`（并行泳道的进度副本，不属本车道，未动）。
- WIP 审计结论：故事线完整且与上面的计划一致——stage 3（视图与页面：`RulesScriptView.timeout`、`timeoutFrom` 展宽、`view-build.ts` 的 `scriptOf` 同公式同账、ui 规则板 `scriptLines` 经 `checkCell`、`index.ts` 把账喂进 view 输入）+ 两本超时账（env 与 rules）的解析与整理提取为 `src/shared/journal.ts` + `package.json` 把 `tests/rules-timing.spec.ts` 挂进 `test:2`（c05e7fe8 的遗留，spec 落了没挂）。前实例遗言的「细节断言没算上『被上限截住』的后缀」：句子本身对，断言错——`checkCell` 把「来历（新的在前）：」表头与每条历史分放在不同行，原断言要两个字串同行；修法是拆成两条 `some(...includes)`，后缀「想要 33 秒，被上限截在 30 秒」照实断言（tests/rules-panel-model.spec.ts）。
- 棘轮两处（c05e7fe8+WIP 的欠账）：knip 7 条新发现 = `src/rules/timing.ts` 只在模块内用的导出（`RULES_RECENT_RUNS`、`timingFile`、`lastValueOf`、`heldValueText`、类型 `RunLine`/`TimingSource`/`TimeoutLine`）——去掉 export；jscpd 1 个新克隆 = ui 规则板照抄循环板的 `told`+`CONSOLE_TELL` 块——提升到 `ui/src/loops/timeouts.ts`（`PageTell` 的所在地）导出共用，两块板同一份。jscpd 报告的文件名/行号在 Windows 路径上错位，认 fragment 认出来的。
- 门禁：build exit 0（dtm-build.log）、preflight exit 0（2 包 23 行，dtm-preflight.log）、npm test 首轮 1 例红（即上述断言，其余全过），修后复跑全绿；棘轮 eslint 69 suppressed / knip 18 / jscpd 1 不变（dtm-test.log）。
- 探针：按交接指示先查 `.agents/tasks/rc3-probe/progress.md`——并行泳道在装的 0.2.2-rc.3 上跑全量探针，run 1 = 465/620（155 红，两个根因：`subagents.startActivation` 契约拍平、`agents.roots()` 移除），run 2 在飞（05:01 落盘 465/620 的 run 1 尾巴是 rc3-probe-1.log；05:11 还有 build3 日志，泳道仍在迭代）。rc.3 基线未钉稳 → 本车道按指示 park green-on-tests，不跑全量探针、不吸收未知红。探针地板 620/620 的验证欠着，等 rc3 泳道钉稳基线后补。
- 文档：ORCHESTRATION §16.16 头括注加一段已实现、新 bold 段「超时的估计与实测维护」整段写入、原「没有做」段改为证据清单（保留其余特性的 L2 列表并补 timing/view/env-timeout 条目）；§16.7 清单加 rules-timing/rules-view；§16.14 头注加超时行展宽一句；§18.2 尾条改写（剩下的一半明确只在循环板）；HANDOFF M6 行已做/欠两列更新。
- 提交切分：c05e7fe8 之后的 WIP 按一件事一个提交切成两个行为提交——先 `refactor(env,rules)`（journal.ts 提取 + timing.ts 收敛模块面），再 `feat(rules)`（页面与接线 + ui 共用 CONSOLE_TELL + test:2 挂 spec + 断言放宽），文档一个提交。落地时 rebase 到 origin/main（b049b3ef，desktop-l4-new 的 docs 提交，无源码改动）。
