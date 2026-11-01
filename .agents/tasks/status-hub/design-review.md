# 状态板块设计复审

- 被审文件：`.agents/tasks/status-hub/design.md`
- 设计版本：0.1（2026-11-01）
- 复审轮次：第 1 遍（无在先的 `design-gate.json` 与复审稿，非修订轮）
- 判定：CHANGES_REQUESTED（HIGH 2、MEDIUM 1、NIT 3）

判定依据机械计数：HIGH 或 MEDIUM 大于 0 即 CHANGES_REQUESTED。

## 复审范围与读过的源

- 决定节点 `d-status-hub`、`status-hub`、`d-metrics-ratios-person-only`（`node .agents/tasks/m1-l4/show-nodes.mjs`，并读 `docs/graph/nodes/*.json` 正文）。
- `docs/CHARTER.md`（§3.2 第 5 条四个减负数字、§6 三个杠杆、§8 指标不注入模型上下文）。
- `.agents/tasks/design-context.md` 全文。
- main 源码：`src/shared/health.ts`、`src/report/index.ts`、`src/report/panel.ts`、`src/workflow/morning-report.ts`、`src/graph/panel-row.ts`。
- 模块设计接口节：plain-ui 1.3（§4.7）、M4 0.6（F16、§3.10）、metrics 0.7（§7.2、§7.3、§7.6、§16）、M6 0.7、M7 0.6（§3.11.1、m7-8、工具表）、schedules 0.6、rules 0.10、M5 0.7（worktree）、M3 附录 0.6。
- DSH 契约：`reference/dsh-desktop-0.2.1-rc.3/` 的 dsh-tools、dsh-commands、dsh-session、dsh-session-projection、dsh-api-workspace-files。

## 发现

### H1（HIGH）指标设计引用的是已被取代的 0.6，对接面与事实均失真

位置：design.md 依据清单第 15 行「指标 … 0.6」；§4.2 表（`metrics/load`、`metrics/ratios` 两行）；§12 指标行。

当前 `.agents/tasks/metrics/design.md` 是 0.7，正是落实 `d-metrics-ratios-person-only` 的那一稿。设计全篇只引 0.6，未提 0.7、§7.6、指标板、`MetricsBoardView` 或投影 `hournessMetrics`（已核：design.md 中无一处出现）。由此产生两处实质错误：

1. 事实错误：§12 与 §4.2 称「`factsFor` 的四个减负数字」。metrics 0.7 §7.2、§7.3 把四个减负数字里流水算得出的**三个**（每周问几次、每次读多少字、等多久）移入 `factsFor`；第四个（因人的决定返工几次）流水不算，由 M7 周报从图算（0.7 §7.2「问人（减负数字）」行、§7.3）。所以 `metrics/load` 不能定义为「来自 `factsFor` 的四个数」。
2. 架构未对账：metrics 0.7 §7.6 已为比率设计了一块专门的「指标」板，登记在面板板块登记表上（`ui/src/metrics/board.tsx`，`id:'metrics'`），数据是宿主写的 `view.json`、经投影 `hournessMetrics` 与 `remote.workspaceFiles.readBytes`/`changes` 读，形状是 `MetricsBoardView`（groups/rows/windows/relayed），**不是** `StatusItem`。本设计 §4.2/§12 却把比率定义为 `audience:'person'` 的 `metrics/ratios` 条目、称「面板…经条目取（指标 §7.3 已是此向）」，与 0.7 已放行的 bespoke 指标板直接重叠且形状不同。

要求的改动：重读 metrics 0.7 并改引该版本；把 `metrics/load` 改为「三个来自 `factsFor` 的减负数字 + 第四个由 M7 从图算、不经 metrics 条目」；就 `metrics/ratios` 与 0.7 §7.6 指标板二选一并写明——要么指标板的 `MetricsBoardView` 就是比率的 person 面、hub 不再把比率复制成 `StatusItem`（指标板不纳入「一件事一处算 → items」模型，§3.4 不对它成立），要么给出 `StatusItem` 与 `MetricsBoardView` 的精确映射与迁移。相应修正 §12 指标行与草拟的 graph-ops 对 `metrics` 节点的批注。

### H2（HIGH）把 person 比率放进 `/hourness`，与 metrics 0.7 §7.3 冲突，并有触碰宪章 §8 的风险

位置：design.md §0 第 3 条、§4.1、§5「`/hourness`」项、§1.4 验收第 3 条。

设计让 `/hourness` 走 `collectStatus(..., 'all')`，输出含 `person` 的指标比率一行，并把「`/hourness` 的人面输出含 `person` 条目（指标比率一行）」写成验收。metrics 0.7 §7.3 明确相反：`/hourness`「它的输出经主 Agent 的对话给人（`d-one-main-agent`），所以只用 `factsFor` … 不含任何比率与比较」，并说 0.7 新进 `factsFor` 的三个减负数字在 `/hourness` 里仍不列。决定 `d-metrics-ratios-person-only` 也只把比率放到面板的指标板与命令行 `summary`，未提 `/hourness`。

两处前提互斥：设计断言命令结果不进模型上下文（据 dsh-commands，属实——命令事件不是 surface 条目），metrics 0.7 则按 `/hourness` 经主 Agent 到人、即进模型上下文处理。若 metrics 0.7 的前提成立，则在 `/hourness` 放 `person` 比率会让指标进入模型上下文，违反宪章 §8，并违背本设计自己的核心不变量「主 Agent 不读 `person` 条目」。无论哪一前提为真，两份设计对「`/hourness` 装什么」的结论不能并存。

要求的改动：对照 DSH 契约与 `d-one-main-agent` 钉死「`/hourness` 的输出是否进模型上下文」，并与 metrics 0.7 §7.3 对齐（现状是比率不进 `/hourness`）。除非能证明人敲的 `/hourness` 结果绝不经 harness 投给主 Agent，否则不要在 `/hourness` 列 `person` 比率；person 比率由面板指标板承载。相应删除或改写 §1.4 验收第 3 条与 §5 的 `/hourness` 版面。

### M1（MEDIUM）`homeLine` 必须等于某条 item 的 text —— 这条不变量过强，与已放行板设计冲突

位置：design.md §3.4 第二点、§9 不变量表「面板首页一行与板页同源」、§12 plain-ui 行与 schedules 行。

设计要求 plain-ui 把 `homeLine` 改为「等于 `items` 里某一条的 `text`」，否则为 `null`，并作 L2 断言。但已放行的板设计里 `homeLine` 常是诊断/状态行、不是条目正文：metrics 0.7 §7.6.3 的 `homeLine` 是「指标板读不出/没更新/停在 <时刻>」一类，且明说「比率不上首页」；schedules 0.6（§6 对账、验收第 26 项）的 `homeLine` 有「主 Agent 的会话已归档…」等，额度停住一行来自 M7。这些既非某条 item 的 `text` 也非 `null`，会使该断言失败。

要求的改动：把不变量收窄为「当某块板的首页行反映一条状态条目时，它取该条目的 `text`（同源）；健康/陈旧/归档/额度停住等诊断型首页行豁免」，并写明非条目型 `homeLine` 如何与 `items` 共存，再据此改 §12 的 plain-ui 与 schedules 行。

### N1（NIT）DSH 行号偏差：「without sending it to the model」注释不在 329 行

位置：design.md 依据清单第 22 行。

`dsh-commands/lib/index.js` 该注释在第 300 行（`execute` 的 JSDoc：「Parse and execute a known command without sending it to the model.」），第 329 行是 `if (parsed === void 0) return void 0;`，`execute` 方法体自第 327 行起；`command/run`、`command/done` 的 lifecycle 追加在第 334、341 行。事实无误，仅行号需改为 300（或 300/327）。

### N2（NIT）供客户端引用的 `StatusItem` 与宿主侧 `provideRowStatus` 同处一文件

位置：design.md §2（`src/shared/status.ts`）、§3.2、§3.4。

§3.4 让客户端模块 `ui/src/graph/boards.ts` 的 `BoardState` 引用 `src/shared/status.ts` 的 `StatusItem`，而同一文件又含宿主侧 `provideRowStatus`/`RowStatusView`（经 `./dsh-min.ts` 引 `ProvideHost`）。metrics 0.7 §7.6.2 已立下客户端安全的共享类型文件约定（`src/shared/metrics-board.ts`，「不导入 Node 内置模块」）。建议把纯 `StatusItem` 类型与 `validateStatusItem`/`isStale` 放进客户端安全的模块，宿主侧 `provideRowStatus`/`collectStatus` 分开，使客户端构建只拉可被类型擦除的部分。

### N3（NIT）提供状态的行清单未列出，`§4.2` 的 owner 多数不在 `HEALTH_ROWS` 内

位置：design.md §3.3（「同 `HEALTH_ROWS` 的办法」的常量清单）、§4.2（owner 含 `metrics/*`、`execute/*`、`loops/*`）。

当前 `src/shared/health.ts` 的 `HEALTH_ROWS` 不含 metrics、execute/operate、loops 等行（未合入）。设计说「新行加进清单即被收」，但未指明状态行清单是 `HEALTH_ROWS` 的超集、随各行落地而扩，也未说如何与 `HEALTH_PACKAGES`/preflight 保持一致。建议补一句点明该清单与同步办法。

## 已核实的断言（Verified）

- DSH：`dsh-tools/lib/index.js` 的 `register(definition)` 校验 `output { schema, render, presentationMeta? }`（register 在 2974 行，throw 在其下）。
- DSH：命令经 `execute` 执行不发给模型；`command/run`、`command/done` 为 lifecycle 追加、非 surface 条目（dsh-commands 300/327–346）。
- DSH：`tool/result` 是模型可见的 surface 条目（dsh-session README 50、157）。
- DSH：第三方不能追加自定义会话事件（`appendPluginRecord` 仅限 `packages/experimental/`，README 70）。
- DSH：session-projection `register(definition)` 与 `stateVersion`（README 56–58）；workspace-files `readBytes`（34）、`changes`（36）。
- 源码：`panel.ts` 导出 `usagePanelOf`/`usagePanel`/`usagePanelLines`/`rangeLine`/`parseGaps`/`gapLines`/`peakLineOf`/`quotaSection`；`index.ts` 有 `renderHourness`、`/hourness`、`/hourness-status`、调 `reportFromFiles`；`morning-report.ts` 调 `usagePanelLines(usagePanelOf(...))`；`health.ts` 的 `provideRowHealth`/`collectHealth`/`healthServiceName`/`HEALTH_ROWS`/`glmHournessHealth/<row>`；`panel-row.ts` 的 `/graph-apply`、`/graph-run`、`hournessProject` 投影、`provideRowHealth('graph-panel', …)`。
- plain-ui 1.3 §4.7：`BoardState { available, homeLine, guideLine, peakApplies }`、`Board { id:string, label, subscribe, snapshot(sessionId):BoardState, Page }`、`BOARD_ORDER = ['rules','loops','lessons']`、按 id 去重、面板只读、`snapshot`/`subscribe` 抛错当板不在。
- M7 0.6：`hourness_report` 是只给主 Agent 的常驻工具；`fourAnswers`（`src/report/four-answers.ts`）、`weeklyReport`（`src/report/weekly.ts`）为 M7 新建；周报所有者是 M7（m7-8）。
- M4 0.6 F16：对账与「撤下的规则」读整份流水、不限当天，设计对 F16 的转述准确。
- 决定节点：`d-status-hub`、`d-metrics-ratios-person-only` 正文与设计 §0、§1.1 的转述一致。
- 版本核对（设计所引 = 当前文件）：plain-ui 1.3、M4 0.6、M6 0.7、M7 0.6、schedules 0.6、rules 0.10、M5 0.7（worktree）/0.6（主检出）、M3 附录 0.6，均相符。

## 未核实或错误的断言（Unverified / Wrong）

- 错误：指标设计引为 0.6，当前为 0.7（H1）。
- 错误：「`factsFor` 的四个减负数字」——0.7 的 `factsFor` 只有三个，第四个由 M7 从图算（H1）。
- 未对账：比率作 `person` 的 `StatusItem`「经条目取」，忽略 0.7 §7.6 指标板的 `MetricsBoardView`（H1）。
- 冲突：`/hourness` 列 person 比率与 metrics 0.7 §7.3「只用 `factsFor`」相悖，并有触碰宪章 §8 之虞（H2）。
- 行号偏差：`dsh-commands` 注释在 300 行而非 329（N1）。
