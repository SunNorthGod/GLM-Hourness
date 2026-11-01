# 状态板块设计复审

- 被审文件：`.agents/tasks/status-hub/design.md`
- 设计版本：0.3（2026-11-01，第 3 稿）
- 复审轮次：第 3 遍（在先的 `design-gate.json` pass 2、`design-review.md` 存在；本遍为修订轮，先核上一遍 5 条是否关闭，再查 0.3 的改动）
- 判定：APPROVED（HIGH 0、MEDIUM 0、LOW 2）

判定机械计数：HIGH 或 MEDIUM 大于 0 即 CHANGES_REQUESTED。本任务按 HIGH/MEDIUM/LOW 三级，LOW 不挡路。

## 复审范围与读过的源

- 决定节点 `d-status-hub`、`status-hub`、`d-metrics-ratios-person-only`（`node .agents/tasks/m1-l4/show-nodes.mjs`，从仓库根）。
- `docs/CHARTER.md`：§3.2 第 5 条四个减负数字（每周被问次数、每次读字数、拍板等待时间、因人的决定返工次数，第 46 行）、§6 第 1 条「模型看到什么」（三个杠杆，第 70 行）、§8「指标不注入模型上下文」（第 128 行）。
- main 源码：`src/shared/health.ts`（`GLM_ROWS`、`HOURNESS_ROWS`、`HEALTH_ROWS`、`HEALTH_PACKAGES`、`provideRowHealth` 返回 `{ report, reactivate, dispose }`、provide 失败 `console.warn` 一次且激活不抛错、`collectHealth` 逐行取视图、`healthServiceName` 产 `glmHournessHealth/<row>`、`sessionIdOf`、`renderHealthTable`）、`src/report/index.ts`（`renderHourness` 第 45 行、`## 面板` 由 `usagePanel`+`usagePanelLines` 构成第 66/69 行、`## 额度` 由 `quotaSection` 第 71 行、`/hourness-status` 经 `renderHealthTable(collectHealth(...))` 第 110 行、导入 `reportFromFiles`）、`src/report/panel.ts`（经导入确认 `usagePanel`/`usagePanelLines`/`peakLineOf`/`quotaSection`/`rangeLine`/`parseGaps`/`gapLines` 导出）、`src/workflow/morning-report.ts`、`src/graph/panel-row.ts`（存在）。
- 模块设计接口节：plain-ui 1.3（§4.7 `BoardState { available, homeLine≤60, guideLine≤60, peakApplies }`、`BOARD_ORDER = ['rules','loops','lessons']`、`Board.id: string`、非 BOARD_ORDER 的 id 排三块之后按登记先后、§8.2 对 `snapshot` 结果校验第 813 行）、metrics 0.7（§7.2 `factsFor`/`scoresFor` 第 669 行、§7.6 `MetricsBoardView` 第 772 行、`src/shared/metrics-board.ts` 不导入 Node 内置模块第 769 行、`id:'metrics'` 第 804 行、投影 `hournessMetrics`）、M4 0.6、M6 0.7、M7 0.6（m7-8 周报所有者第 115 行、`fourAnswers`/`weeklyReport` 第 181 行、`hourness_report` 只给主 Agent 第 229 行、§3.12.3 返工从图算）、schedules 0.6（诊断型 homeLine「会话已归档」「在另一个 DSH 进程」第 101/155/657 行、额度停住来自 M7）、rules 0.10、M5 0.7（`.worktrees/m5`）、M3 附录 0.6。
- DSH 契约（`reference/dsh-desktop-0.2.1-rc.3/`）：`dsh-commands/lib/index.js` :300 `execute` JSDoc「without sending it to the model」、:327 方法体、:329 `if (parsed === void 0) return void 0;`、:334 `command/run`、:341 `command/done`〔实读〕；`dsh-tools/lib/index.js` :2970 `register(definition)`、:2973 throw「must declare output { schema, render, presentationMeta? }」、:2974 `assertSupportedJsonSchema(output.schema)`〔实读〕；`dsh-session/README.md` :50 surface 事件含 `tool/result` 要 `surfaceOp`、:157「What the model sees」含 `tool/result`、:70 `appendPluginRecord` 限 `packages/experimental/`、仓外插件不得调用〔实读〕；`dsh-session-projection/README.md` :56–58 `register(definition)` 与 `stateVersion`〔实读〕；`dsh-api-workspace-files/README.md` :34 `readBytes`、:36 `changes`〔实读〕。

## 上一遍（pass 2）5 条发现的关闭核验

- SH2-01（MEDIUM，§10 `glm/usage` 面板显示路自相矛盾、无板承载）：**已关闭**。0.3 §10 第二 bullet 改为「晨报与 `/hourness` 的「面板」一节都经 `collectStatus(ctx, sid, 'agent', now)` 取 `glm/usage` 的 `text`+`detail`」，并明写「此处的「面板」即 `renderHourness` 产出的 `## 面板` 一节，是报告路，不是 ui/ 项目图面板板块」「用量今天没有承载它的已登记板，§12 也未新增，故仅经报告路显示、不上 ui/ 面板板块 `snapshot().items`」。核对 `src/report/index.ts`：`## 面板` 由 `usagePanel`+`usagePanelLines` 构成，确为报告路，与 M6 0.7 §6、验收 2/3 一致。§5/§6/§3.1/§3.4 覆盖映射同向，矛盾消除。
- SH2-02（MEDIUM，`text` 上限 200 与 homeLine 上限 60 未对齐）：**已关闭**。0.3 §2 新增「两套长度上限（SH2-02）」：`text` 上限 200 码点，凡可能上 `homeLine` 的条目 `text` 须落在 60 码点内；`text > 60` 不上 `homeLine`，由板给 ≤60 缩写或诊断型 `homeLine`（M1 豁免），该行不受逐字相等断言约束。§3.4/§9/§11/§12 plain-ui 行一致：`items` 按 ≤200 校验、`homeLine` 按 §8.2 的 ≤60 校验、逐字相等只覆盖 `text ≤ 60` 的 item。核对 plain-ui 1.3 §4.7「homeLine 至多 60 个码点」，收窄后成立。
- SH2-03（LOW，无板落点的 owner 在 ui/ 面板归属未写明）：**已关闭**。0.3 §3.4 新增「两条显示路的覆盖范围（SH2-03）」：板块路承载 `rules/*`、`rules/peak`、`rules/stale`、`loops/*`、`lessons`；报告路另承载今天无登记板的 `glm/*`、`execute/*`、`metrics/load`。§4.2 表下段与 §4.1、§9 同步。
- SH2-04（LOW，`CollectedStatus` 未定义）：**已关闭**。0.3 §3.3 给出接口 `{ items: readonly StatusItem[]; rows: readonly { row, outcome: 'ok'|'absent'|'error', reason? }[] }`，并点明消费方 M7（§6）与面板一源核对（§11）。
- SH2-05（LOW，文件超 40 KB 目标）：**按发现自身条款关闭**。该 LOW 发现许可「或在变更记录注明为何保留当前篇幅」，0.3 §13 变更记录注明「文件 47,800 字节仍高于 40 KB；§12 对接表与〔实读〕依据清单构成下限，未删减规范内容去凑 40 KB」。符合发现给的第二种修法。说明（非新发现）：文件由 0.2 的 42,979 字节增至 47,800 字节，增量来自 SH2-01/02/03/04 加入的规范内容（覆盖映射、`CollectedStatus` 接口、200/60 规则），属 LOW 软目标，不影响正确性与可实现性，不挡路。

结论：pass 2 的 5 条全部关闭（SH2-05 按其允许的「注明理由」条款关闭）。

## 本遍新发现

### SH3-01（LOW）homeLine 逐字相等断言的「命中」判定机制未指明

位置：§3.4 第二点、§9 不变量表「面板首页一行命中某条 item 时与它同源」、§11 面板断言、§12 plain-ui 行。

设计把面板断言写成「`homeLine` 命中 `items` 里某条且该条 `text ≤ 60` 时与它逐字相等」，但未指明测试如何判定 `homeLine`「命中」的是哪一条 `item`。若按「在 `items` 里找一条 `text` 与 `homeLine` 相等者再断言相等」理解，断言恒真、不测任何东西；若按「板声明它的 `homeLine` 取自哪一条 `item`」理解，则需要一处把 `homeLine` 与来源 item 关联的机制，而设计未给。核心不变量「一件事一处算」由 §3.1（投影与 `collectStatus` 调同一 `statusItemsOf`）与 §11 的 L3 一源核对守住，不依赖本断言，故本条不挡路；但该 L2 断言若落成前一种理解会失去意义。

要求的改动：在 §3.4 或 §11 指明「命中」的判定来源，二选一——(a) 由板显式声明其 `homeLine` 取自哪一条 item 的 id（面板断言据此取该 item 的 `text` 比对）；或 (b) 在 L2 夹具里令该板恰有一条 `text ≤ 60` 的 item 且 `homeLine` 取自它，断言该 item 的 `text` 与 `homeLine` 逐字相等。写明其一即可，短设计一句话。

### SH3-02（LOW）`dsh-tools` register 的行号引用与源不精确

位置：依据清单「`dsh-tools/lib/index.js`:2974 `register(definition)` 校验 `output { schema, render, presentationMeta? }`〔实读〕」。

实读 `reference/dsh-desktop-0.2.1-rc.3/dsh-tools/lib/index.js`：`register(definition)` 在 :2970；校验并抛「must declare output { schema, render, presentationMeta? }」在 :2973；:2974 是 `assertSupportedJsonSchema(output.schema)`。设计把 register 与 `output { schema, render, presentationMeta? }` 两项都系到 :2974，与源差 1–4 行。事实（register 校验 `output { schema, render, presentationMeta? }`）正确，仅行号不精确；因任务要求 DSH 契约事实对齐源，宜改准行号。

要求的改动：把依据行改为「:2970 `register(definition)`，:2973 校验 `output { schema, render, presentationMeta? }`（:2974 `assertSupportedJsonSchema(output.schema)`）」。

## 已核实的断言（Verified）

- DSH 契约全部属实：`dsh-commands` :300 JSDoc「without sending it to the model」、:327/:329 方法体与 `parsed === void 0` 返回、:334/:341 为 log-only lifecycle 追加；`dsh-tools` register 校验 `output { schema, render, presentationMeta? }`（行号见 SH3-02）；`dsh-session` README :50/:157 `tool/result` 为 surface（模型可见）条目、:70 第三方不能追加自定义插件记录；`dsh-session-projection` README :56–58 `register`/`stateVersion`；`dsh-api-workspace-files` README :34 `readBytes`、:36 `changes`。
- `src/report/index.ts` 的 `renderHourness` 中 `## 面板` 一节由 `usagePanel`+`usagePanelLines` 构成、`## 额度` 由 `quotaSection` 构成、`/hourness-status` 经 `renderHealthTable(collectHealth(...))`；支持 §10 把「面板」钉为报告路的前提（SH2-01 关闭）。
- `src/shared/health.ts`：`provideRowHealth` 返回带 `dispose` 的对象、provide 失败 `console.warn` 一次且激活不抛错；`collectHealth` 逐行取 `ctx.get(healthServiceName(row))`、视图缺席记 `absent`；`HEALTH_ROWS = GLM_ROWS ∪ HOURNESS_ROWS`（`glm-llm/glm-login/glm-prompt/glm-compact` 与 `data/guard/memory/workflow/hourness/graph/graph-panel/rules/design`），`HEALTH_PACKAGES` 供 preflight 核对。§3.2/§3.3 对 `provideRowStatus`/`collectStatus`/`STATUS_ROWS` 的「照搬行健康」转述与之一致。
- plain-ui 1.3 §4.7：`BoardState` 今天无 `items`（故 §12 的 `items?` 为真实新增）；`homeLine`/`guideLine` 为 `≤60` 码点的 `string | null`、`null` 不显示；`BOARD_ORDER = ['rules','loops','lessons']`；`Board.id: string`，非 BOARD_ORDER 的 id 排三块之后按登记先后；§8.2（第 813 行）对 `snapshot` 结果校验 `homeLine`/`guideLine` 等。
- metrics 0.7：§7.2 两出口 `factsFor`/`scoresFor`；§7.6 比率走 `id:'metrics'` 专用板、形状 `MetricsBoardView`（非 `StatusItem`）、宿主写 `view.json`、投影 `hournessMetrics`、客户端安全类型 `src/shared/metrics-board.ts` 不导入 Node 内置模块；三个减负数字在 `factsFor`、第四个（返工）由 M7 从图算。设计 §0/§2/§3.4/§4.2/§6/§9/§12 与之一致。
- M7 0.6：周报所有者是 M7（m7-8）；`fourAnswers`（`src/report/four-answers.ts`）、`weeklyReport`（`src/report/weekly.ts`）、`hourness_report` 只给主 Agent；§3.12.3 返工从图算。
- schedules 0.6：诊断型 `homeLine`「主 Agent 的会话已归档」「在另一个 DSH 进程里」自循环板、「额度停住」来自 M7；两张单子（4 周没结果、7 天超时 3 次以上）由循环板给。
- CHARTER §3.2 第 5 条四个减负数字、§6 第 1 条「模型看到什么」、§8「指标不注入模型上下文」逐字属实。
- 版本核对（设计所引 = 当前文件）：plain-ui 1.3、metrics 0.7、M4 0.6、M6 0.7、M7 0.6、schedules 0.6、rules 0.10、M5 0.7（`.worktrees/m5`）、M3 附录 0.6，均相符。
- 受众边界设计自洽：`collectStatus` 的 `audience` 档为 `'agent' | 'all'`（过滤模式，区别于 `StatusItem.audience` 的 `'person' | 'agent'`）；能进模型的两路（`hourness_report`、作为晨报提示的 `/hourness`）传 `'agent'`，ui/ 面板走板块 `snapshot().items`、不经 `collectStatus`，`'all'` 档今天无调用方。与 `d-metrics-ratios-person-only`、宪章 §8 相符。

## 未核实或错误的断言（Unverified / Wrong）

- 无 HIGH/MEDIUM 级别的未核实或错误断言。
- 行号不精确（SH3-02，LOW）：`dsh-tools` register 的依据行号系到 :2974，源在 :2970/:2973；事实正确，行号差 1–4 行。
- 跨设计协同（非本设计缺陷，备注）：指标板 `id:'metrics'` 作为生产板登记于同一张 `boards.ts`，plain-ui 1.3 §4.7 的 `Board.id` 注释把非 BOARD_ORDER 的 id 举例为 L4 测试板 `homeline-test`，其登记机制（非 BOARD_ORDER 的 id 排三块之后、按登记先后）允许第四块板，metrics 0.7 §7.6 亦声明「对面板 1.3 核过登记表装得下这块板、不改面板设计」。该板的存在与登记归 metrics ↔ plain-ui 协同，status-hub 只引用、未就此向 plain-ui 提接口改动（§12 plain-ui 行仅新增 `items?`），不构成 status-hub 的缺陷。
- 上一遍（pass 2）的 2 条 MEDIUM 与 3 条 LOW 已在 0.3 关闭（见上）。
