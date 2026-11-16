# M7 规矩阶梯与周报车道进度（m7-8）

Worktree `.worktrees/m7-8`，分支 `m7-8`，基线 main `07b7cbbb`（2026-11-16）。
任务：M7 规矩阶梯与底线清单的提议——`src/report/ladder.ts` 的 `ladderProposals`、
`src/report/floor-proposals.ts` 的 `floorProposals`（纯函数）、周报接线（提议节，至多 3 件带草稿）、
L2 `tests/report-ladder.spec.ts` + `tests/weekly.spec.ts` 扩展
（M7 设计 0.6 §3.12、批次表 P2 行 m7-8；图节点 m7-8 尚不存在，见文末风险）。

## 批次读法（读到的定案）

### 阶梯是什么（§3.12.1、§3.12.2）

规范节点（图 `type: 'norm'`）正文的标签由 M3 的 `labeledSections`（`src/graph/stage.ts`）解析：
`级别：记忆 | 提示词 | 阶段提醒 | 门禁`、`模式：影子 | 生效`、`规则：<规则 id>, …`。
没有 `规则：` 标签的规范不进阶梯，周报只报个数（本仓库现有 5 颗规范节点全部没有这三个标签，
所以机制完整、今天不产生提议，等规范带上标签）。

提议方向（按固定的数，数据全部走违规流水的 `classifyRecord`，`src/guard/records.ts`）：

- 升一级：级别低于门禁，近 7 天拦截不少于 3 条。拦截 = 分类 `denial`（真拦下；`rule` 字段
  精确等于规范标签里的规则 id 之一）。
- 影子转生效：**已被人决策删除，不做**（见下）。
- 降一级：门禁级、近 28 天拦截与影子都是 0。影子记录 = `mode: 'shadow'` 且分类可读的流水行
  （M4 0.6 之后不再有新写者，旧流水里可能还有，读它们不算发明）。

### 人决策核对（本批最重要的两个）

1. `d-metrics-ratios-person-only`（2026-11-01，图节点已读原文）：管的是「比率」不进对话——
   问法分布、原样同意的比例、按模型比较等。**提议不是比率**，且循环板已落地的
   `operate.weekly` 提醒词（`src/operate/entries.ts`）明确说 "Put its proposals (at most three)
   to the person with propose_to_human"——周报文本带提议节，与该决策不冲突。
   提议附带的数据是计数（近 7 天拦截 N 条），不是比率，同样不冲突。
   m7-p3/m7-9 两道把「质量对照」「交付四数」等比率节挡在周报文本外的先例继续成立，
   本批不往周报文本加任何比率。
2. `d-code-rules-enforce`（2026-10-31，人原话「试运行规则啥的直接拦就行了，这样反而有问题好发现」，
   图节点 approved）：代码规则启用即拦，删掉整个转正阶梯，M4 0.6 的删除清单点名
   「M7 周报阶梯的『影子转生效』一步」。M7 0.6 §3.12.2 写的影子转生效阈值、§12.1 的
   `RuleMode`/`PROMOTION` 引用、R4-F10 的处置（「§3.12.2 引用 PROMOTION」）都随此作废。
   **阶梯只实现升一级、降一级两个方向**；偏离记 §19.4。

`d-rules-human-only`：M7 不写规则，升降提议只是把数据和草稿交给主 Agent 问人，
人同意之后的改动（改规范正文、写门禁）是主 Agent 的计划内任务——本批只产出提议，不改任何规范。

### 底线清单提议（§3.12.3）

`floorProposals`：近 28 天某一组降档后的返工不少于 2 件、且这组路径不在 `norm-review-floor`
任何 `files` 判定里时，提议把这类路径加进清单（`askDraft('floor-add', …)`）。

- 降档 = 有效深浅轻审或不审。有效深浅的耐久来源：交回批注的「有效深浅 全审|轻审」行
  （`parseHandbackComment`，HANDBACK_DEPTH 只认全审|轻审）；声明不审的任务没有审查、
  没有该行，按不审算。派发批注的「审查：」行是声明深浅，作回退。
- 返工 = 进主干后 14 天内被重开（done→doing）或出现 `source` 指向它的任务；
  进主干时刻读任务自己的「进主干 <sha>（从 <sha>）」证据批注（`src/execute/advance.ts:1084`）。
- 分组按改动文件的顶层目录。**缺口：改动文件的路径今天没有耐久来源**——交回批注只记
  「文件 N 个」个数，`execute.handback` 指标事件也只有个数，worker 交回的 files 列表
  （hourness-handback-v1）没有落图。本批实现完整的分组提议逻辑（L2 用夹具数据驱动），
  接线侧传不出路径就不产生提议，不发明。缺口记 §19.4，来源长出来的批次补。

### 草稿从哪来、谁消费

- 草稿的唯一产地是 `askDraft`（`src/execute/asks.ts`，P2 之前的批次已落）：
  `norm-ladder`（LadderFacts：norm、title、direction、counts）与 `floor-add`
  （FloorAddFacts：paths、reworked、declared）两个 case 都已在。
  本批的纯函数产 facts、调 `askDraft`、把 Ask 原样交给周报文本；L2 钉每条草稿过
  `draftRefusal`（proposalRecordRefusal + plainWordsIn）。
- 消费链：`hourness_report {kind:'weekly'}` 的文本 → 主 Agent 按循环板 `operate.weekly`
  的提醒用 `propose_to_human` 问人（每周至多 3 件，一份一个方案）→ 人回话由
  `record_human_answer` 记图。人否掉过的（规范节点下最近 28 天有一张提议式待决、
  批注有「人在对话里否掉」，即 `answerKindOf === 'reject'`）不再提——辅助函数
  `rejectedNorms(graph, nowMs)` 出这个集合。

### 接线与文件

- `weeklyReport` 输入加 `violations?: readonly GuardRecord[]`（违规流水行）；
  规范、否掉集合、降档任务、floor 解析全部从它已有的 `graph` 派生
  （floor 用 `parseFloor`/`floorPathIn`，`src/execute/floor.ts`；floor-add 排在 norm-ladder 前，
  合计至多 3 件——R4-F5 建议序「加类 > 升降」，其余三类候选等规则板/循环板）。
  提议节随提议或规范存在而出现：无规范无提议就没有这一节；有规范时先报一行个数
  （§3.12.1「周报只报个数」）。`src/operate/index.ts` 的 weekly 分支读 violations 流水
  （`auditPaths(dataHomes(ctx)).violations`，读不到按空处理不抛）——这是 m7-7 的文件，
  按并发图在落地时 rebase。
- 阶梯方向名沿用 `asks.ts` 的 `LadderDirection`，但本批只产 `'up' | 'down'`。
- 测试注册：`package.json` test:3 加 `tests/report-ladder.spec.ts`（紧挨 weekly.spec）。

### 签名对设计的偏离（记录用）

设计写 `ladderProposals(norms, violations, decided)`。实现按仓库报告纯函数的惯例收成
input 对象（`{ nowMs, norms, violations, rejected }`）——时钟必须注入才能「同输入一字不差」，
`rejected` 是 `rejectedNorms` 预算好的 28 天内被否规范 id 集（28 天窗的判断留在帮手函数里）。

## 批次（每批一个提交）

1. 批 1：`src/report/ladder.ts`（`ladderProposals` + `rejectedNorms`）+
   `src/report/floor-proposals.ts`（`floorProposals` + 任务面帮手）+ L2 `tests/report-ladder.spec.ts`
   + package.json test:3 注册。
2. 批 2：`src/report/weekly.ts` 提议节接线 + `src/operate/index.ts` weekly 分支读流水
   （m7-7 的文件，落地时 rebase）+ `tests/weekly.spec.ts` 扩展。
3. 批 3：文档（ORCHESTRATION §12 周报行、HANDOFF §10 M7 行、M7 设计 §19.4 第六次修订——
   影子转生效方向被 `d-code-rules-enforce` 删除、floor 路径无耐久来源两件都要记）
   + rebase、合 main、推 origin + github。图批注因 m7-8 节点不存在，只记此处，
   等编排者/人补节点。

## 记录

- [2026-11-16] 开线。设计读毕（§1.2 m7-8、§3.7.4、§3.11.1、§3.12 全节、§8.2 P2 行、
  §18.2 R4-F5/R4-F10、§19.4 第四五次修订、M4 0.6 决定一、metrics 0.7 §7.3/§14、
  m7p3-progress、m7-9/progress.md）。盘面：asks.ts 两个 case 已在；floor.ts 的
  parseFloor/floorPathIn 已在；answer-marks 的 reject 标记已在；规范节点全无标签；
  违规流水读取面 classifyRecord/journalRecords/auditPaths 已在；weekly.ts/operate/index.ts
  现状读毕。人决策两条都已核对（见上）。
- [2026-11-16] worktree 环境踩坑记录：bash 每次调用 cwd 重置回主检出，带变量的 mklink
  循环第一次跑在主检出（幸而是 no-op，没污染）；worktree 的 node_modules 需要逐个裸跑
  `cmd //c "mklink /j …"` 建 junction（bash 的 `[ -e ]` 对 cmd 建的联接有一段视图滞后，
  判断存在要用 cmd dir）；主检出的 node 进程可能是别的车道的，幽灵挂起删除条目不动它，
  挪目录重建绕过。
- [2026-11-16] 批 1 + 批 2 代码完成。`ladderProposals`（up：近 7 天 denial≥3；down：
  门禁级 28 天拦截与影子全 0；影子转生效不做，`d-code-rules-enforce`）+ `rejectedNorms`
  + `floorProposals`（顶层目录分组、28 天窗、14 天返工窗、floor files 覆盖排除）+
  `floorTasks`（交回「有效深浅」行优先于派发声明，声明不审顶替为 skip，「进主干」批注
  是落地证据，reopensAfter + source 边是返工）+ weekly「规矩的提议」节（floor-add 先、
  升降后、slice 3）+ operate weekly 分支读 violations 流水（读不到按空）。
  sourcedMoments 与 m7-9 的重复被 jscpd 棘轮抓住，改为复用 metrics.ts 导出的同一函数；
  LadderMove 未被外部使用，knip 抓住，退为模块内类型。
- [2026-11-16] 门禁（主检出 `.llm/logs/`，前缀 m78-）：build 0（m78-build1）、preflight 0
  18 行（m78-preflight1）、npm test 0 败（m78-test2，日志里两处「not ok」是测试名用词）、
  lint 持平 eslint 73 / knip 18 / jscpd 1。L2：report-ladder.spec 9/9、weekly.spec 8/8。
  tsc 净。提交 2420e6d0（批 1）、3113cc0b（批 2）。探针锁 probe-lock-2 被 loops-seam
  持有，probe-lock 空；探针按 m7-9 先例在合并 main 后跑全量。
- [2026-11-16] 落地。rebase 到 main fa9f0bbd（loops-seam 已落地，ORCHESTRATION §12 同行
  冲突一次：取 main 侧行原文 + 追加本道句子，第一次合并误猜了 loops 的措辞，重做并核过
  HEAD 行原文完整保留）。rebase 后门禁重跑：build 0（m78-build2）、preflight 0
  （m78-preflight2）、test 0 败（m78-test3，0 条真 not ok）、lint 持平 73/18/1（m78-lint2）。
  FF 合入 main（→ efe930f0），主检出重建 dist（m78-build-main），取 probe-lock-2
  （probe-lock 当时被 m7-7 批 2 探针持有；loops-seam 释放后目录已删，重建目录写 owner），
  全量探针 608/608 exit 0（.llm/logs/m78-probe-main.log，本道无新场景，设计只要 L2）。
  锁随推送释放。origin/main 与 github/main 均核实在 efe930f0（git fetch 后核对；
  两条 push 都报 Everything up-to-date——推送时机与另一道的落地推送重叠，终态已核）。
  最终提交链：5404c996（批 1）、bf97f57f（批 2）、efe930f0（docs，rebase 后哈希）。
  遗留：图节点 m7-8 不存在（其余车道都有节点），落地批注没法落格，要编排者或人补节点；
  askDraft('norm-ladder') 提议行的空粗体（`升一级****：…`）归 asks 所有者顺手可修。
