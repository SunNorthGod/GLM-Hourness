# metrics design addendum: step 10 retirement (consumer map and migration decisions)

依据:`.agents/tasks/metrics/design.md` §12 第 10 步、§13(第 10 步的 L3 预检)、§15 第 9 条、§2 表「派遣决策流水」「M4 的压制计数」两行、§11 验收 17、§9.3、§10 表第 6 条。基线 main `826422cd`。本补记先于代码落地,记录 2026-11-20 实读的消费者迁移图与逐项去向;实现与本图不符时先改本图。

## 1. 消费者迁移图(2026-11-20 实读)

### 1.1 `glmHournessWorkflow` 服务

全仓 grep(src、ui、scripts、packages、tests、docs、*.yml、*.json)无任何消费者。该服务名不存在:workflow 行(`src/workflow/index.ts`,`dsh-glm-hourness/workflow`)不 provide 任何服务,只有行健康 `glmHournessHealth/workflow`。brief 预想的「M3 design-mode 的决策记录」消费者不在:design 行经 `openEngine().apply` 写图(被引擎观察者统一记),不读 `decisions.jsonl`。

`decisions.jsonl` 的全部读者(实读核对):

| 读者 | 位置 | 去向 |
| --- | --- | --- |
| 写入 | `src/workflow/index.ts`(`applyOverJournal` → `journal.decision`) | 随行删除 |
| 读取 | `src/workflow/morning-report.ts` `reportFromFiles`(`readJsonl(paths.decisions)`) | 改从指标流水算:期内 `tool` 事件 `cat === 'dispatch'` 计数(设计 §2 表「被取代」行的口径) |
| 路径 | `src/memory/audit.ts` `auditPaths().decisions`、`AuditJournal.decision`、`RowJournal.decision`、`DecisionRecord` | 全删(唯一写者与唯一读者都消失) |
| 测试 | `tests/workflow.spec.ts`(行测试+晨报测试)、`tests/hourness.spec.ts`、`tests/memory-audit.spec.ts` | 行测试删除;晨报测试改用流水事件夹具;memory-audit 的 decision 沉积测试删除 |
| 历史 | `docs/ORCHESTRATION.md` §3.10 段、`docs/DESIGN.md` §2.4a 工具名表 | docs 批改写 |

`decisions.jsonl` 旧文件留在磁盘上不删(设计 §15 第 9 条)。

### 1.2 `suppressions.jsonl` 账本

| 读者/写者 | 位置 | 去向 |
| --- | --- | --- |
| 写入+当日去重 | `src/env/index.ts` `installWork`(`dailySuppressions` → `appendSuppression` → `emitSuppressionCount`) | 只保留计数与 `count` 事件;跨重启的「一天一次」改读流水最近一条 count 事件的日键(见 §2.1) |
| 状态条目 | `src/env/index.ts` 状态视图(`readJournal(suppressionsPath(home))` → `envStatusItems`) | 改从流水的 count 事件算(`countEventsSync`,同步契约见 §2.2);条目 id、文案、staleAfterMs 不变 |
| 晨报 | `src/workflow/morning-report.ts` `reportFromFiles`(`readJsonl(paths.suppressions)`) | 改从流水算(与 `metricsLines` 合并成一次 `readLog`,见 §2.3) |
| 路径 | `src/memory/audit.ts` `auditPaths().suppressions` | 删(唯一读者是晨报) |
| 计数逻辑 | `src/env/suppressions.ts`(`countMarkers`、`countRepository`、`suppressionDay`、`dailySuppressions`) | 保留计数与去重逻辑,删账本形状(`SuppressionRecord` 的 `at/repo`、append 回调、lastRecord);`countMarkers` 的另一读者 `src/guard/suppression.ts` 不变 |
| `count` 事件 | `src/env/metrics.ts` `emitSuppressionCount`(已上线) | 保留,签名改为 `(ctx, root, tally)` |
| 测试 | `tests/env-suppressions.spec.ts`、`tests/env-status.spec.ts`、`tests/env-checks.spec.ts`(`settleRepositoryWork`)、`tests/four-answers.spec.ts` | 重写为流水夹具;`settleRepositoryWork` 删;four-answers 断言条目 id 不变 |
| 文档 | `docs/ORCHESTRATION.md` §10.1、`docs/DESIGN.md` §2.4 | docs 批改写,并写明旧文件由人删 |

brief 提到的「`journalEarliest` 的账本来源改读流水或删」经实读不适用于 suppressions:`journalEarliest`(`src/guard/records.ts`)读违规流水,供撤下对账行用,与 suppressions.jsonl 无关,不动。晨报读账本的「一处」即 `reportFromFiles` 的 `readJsonl(paths.suppressions)`。

### 1.3 workflow 行本身

| 引用 | 位置 | 去向 |
| --- | --- | --- |
| 行登记 | `packages/hourness/cordis.patch.yml` 50–52 行 | 删行;头部注释「sets `home` for memory, workflow and hourness」去 workflow |
| 行目录 | `scripts/packages.mjs`(src 数组 `workflow`、rows `glm-hourness/workflow`) | 两处删 |
| 行名导出 | `packages/hourness/package.json`(`./workflow`、`./workflow/locale/*.json`)、`locale/workflow/` 目录 | 删 |
| 编译 | `packages/hourness/tsconfig.json` include `../../src/workflow` | 删(morning-report 移入已在 include 的 `src/report`) |
| 行清单 | `src/shared/health.ts` `HOURNESS_ROWS`(17→16) | 删 `workflow` |
| 沙盒 profile | `scripts/sandbox.mjs`(home 覆盖行清单) | 删 workflow |
| 契约 | `tests/contracts.spec.ts` `ROW_IDS`、`DISPATCH_TOOLS` ⊆ pin | 行 id 删;pin 改为 tool-names 内两份名单的关系(见 §2.4) |
| 行健康测试 | `tests/health.spec.ts`(workflow 行 apply 测试、期望表) | 行测试删;期望表改 |
| 收集器期望 | `tests/status.spec.ts`(STATUS_ROWS 逐行期望含 workflow) | 改 |
| 探针 | `scripts/probe/run-probe.mjs`:`DISPATCH_TOOLS` import、`plainSubagentTools` 检查、GLM 健康表 workflow 在列、`CHECK_SCENARIO_PREFIXES['workflow']` | 检查改写为 toolCategory 契约检查(不经 workflow import),健康表期望去 workflow,前缀映射删 |
| 客户端 bundle | `packages/hourness/ui/client.js`(构建产物里的 HOURNESS_ROWS) | 构建自动再生成 |
| 导入 morning-report | `src/report/index.ts`、`src/operate/index.ts`、`src/report/four-answers.ts`、`src/report/panel.ts`(注释)、tests 7 个 | `src/workflow/morning-report.ts` 移到 `src/report/morning-report.ts`(设计第 10 步),导入路径随改 |
| 文档 | `docs/ORCHESTRATION.md`(§3.10、§10.1、沙盒覆盖、指标节、验证清单)、`docs/DESIGN.md`(§2.1 树、§2.2、§2.4a 表、§2.5 行数)、`docs/HANDOFF.md` §3、两份 README 行表 | docs 批整段改写 |

## 2. 逐项迁移决定

### 2.1 压制计数:每天一条 `count` 事件,账本退役

- `countRepository` 返回 `{total, byMarker}`(`SuppressionTally`);`at`/`repo` 由信封与 `{dir: root}` 承担,不再进任何文件。
- `dailySuppressions(root, options)`:去掉 append 回调与 `lastRecord`,改 `lastDay?: () => string | undefined | Promise<string | undefined>`——返回流水里最近一条压制 count 事件的日键(`suppressionDay(事件 at)`),与今天同日则跳过。跨进程去重由此保住「每天一条」(设计 §4.2 count 行、§2 表)。
- 日键来源是新的同步助手 `countEventsSync(root, what, files = 3)`(`src/metrics/read.ts`):按文件名取最近 3 个日文件,逐行 JSON,`k === 'count' && body.what === what` 的取 `{at, value}`,坏行跳过,出错返回空。只读不校验链——状态视图与去重都是尽力读,事实以流水的链核对(`verify`)为准。
- 事件 `what` 仍是 `suppression-comments`,`byKey` 键仍过 `markerKey`。
- 旧账本文件不迁移不读;`docs/ORCHESTRATION.md` 写一句由人删。

### 2.2 `env/suppressions` 条目改读流水

- `RowStatusView.items` 是同步契约(`src/shared/status-host.ts`,收集器 `collectStatus` 同步消费),流水读取走 `countEventsSync`(同一次条目计算里已经同步读 timing/limits 账,先例在)。
- `src/env/status.ts` 的读者类型改为 `SuppressionCount {at, total}`;`suppressionTotalLine`、`suppressionLineOf`、`envStatusItems` 三个纯函数与条目 id/文案/字段/staleAfterMs 逐字不变——条目与晨报同一份计算(status-hub 约束)不破,变的只是数据源与 `source` 路径串(改为项目的 `.llm/metrics` 目录)。
- 流水不在(`.llm/metrics` 目录缺)时没有条目,与旧「账本不在没有条目」同义;坏行跳过。

### 2.3 晨报:压制行与派遣行同源流水

- `reportFromFiles` 里 `options.metrics` 带 `root` 时 `readLog` 一次,结果同时喂「指标(流水,今天)」一节(`metricsLines`,读失败时它的「读不到」行原样)与压制行(`k === 'count'` 且 `what === 'suppression-comments'`,按 `since` 切期,映射 `{at, total}`)。`readEffects` 维持自己的 `readLog`(operate 行单独调用,错误口径独立)。
- `ReportInput.suppressions` 类型改 `readonly SuppressionCount[]`;`suppressionLineOf` 不变。
- 「派遣类调用 N 次」:`ReportInput.decisions` 删,改 `dispatches?: number`,来自期内 `tool` 事件 `cat === 'dispatch'` 计数;流水读不到时行写作「派遣类调用 — 次」。行文案其余逐字不变(探针 `/^- 派遣类调用 \d+ 次$/m` 在有流水的场景不受影响)。

### 2.4 派遣类名单与 toolCategory

- 设计 §4.3:「派发类就是 `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 六个名字」;`docs/DESIGN.md` §2.4a 工具名表现钉七个名字(含 M7 E4 并入的 `dispatch_task`)。现行 `toolCategory` 只把 `DISPATCH_TOOL_NAMES`(`subagent`、`subagent_fork`,规则板 gate 名单)归 dispatch,与其余五个名不符——行退役后 `DISPATCH_TOOLS` 无处安放,此步把它移进 `src/shared/tool-names.ts` 作为派发类的名单,`toolCategory` 改用它(对齐设计 §4.3,`toolCategory` 唯一消费者是 `src/metrics/observe.ts` 的 tool 事件)。
- `DISPATCH_TOOL_NAMES` 不动(规则板 gate 名单,`tests/contracts.spec.ts` 354 行钉 `dispatch_task` 不在其内——板全量落地时再加)。`DISPATCH_TOOL_NAMES ⊆ DISPATCH_TOOLS` 的契约钉保留,两端都指 tool-names。
- 已知口径差,接受并记录:旧派遣账本只记根调用(`payload.parent === undefined`),`tool` 事件来自会话日志、含子会话;设计 §2 表「被取代」行已明示 `tool` 事件按类别 dispatch 是替代形态,按设计执行。

### 2.5 workflow 行退役清单

- 删 `src/workflow/index.ts` 与整个 `src/workflow/` 目录;`morning-report.ts` 移 `src/report/`(设计第 10 步)。
- `audit.ts`:`DecisionRecord`、`AuditPaths.decisions`、`AuditJournal.decision`、`RowJournal.decision`、`rowJournal` 的 decision 沉积删除;`decisions.jsonl` 旧文件留盘。
- 行清单 17→16(`HOURNESS_ROWS`),宿主行合计 21→20(含 glm-ui、ui 客户端行 23→22);`tests/health.spec.ts`、`tests/status.spec.ts`、`tests/contracts.spec.ts` 的逐行期望随改。
- `tests/workflow.spec.ts` 拆分:行测试删;晨报/askSummary/报告文件测试移 `tests/morning-report.spec.ts`;`package.json` test:1 随改。
- 探针:workflow 前缀检查改写为「运行时 subagent 工具是派发类名单的名字」(不经 workflow import);GLM 健康表期望去 workflow;`CHECK_SCENARIO_PREFIXES` 去 `workflow`。

### 2.6 L3 预检(设计 §13 第 10 步,探针 +2)

1. 场景运行后,运行目录里任何位置都不再产生 `audit/suppressions.jsonl`;正向钉:glm 场景项目的流水里至少一条 `count` 事件 `what: 'suppression-comments'`(证明退役没有把计数本身退掉)。
2. 健康表(`HEALTH_ROWS` 与 glm、non-glm 两张表)不含 workflow 行;status hub 收集结果(`glmHub.agent.rows`)没有 workflow 的 error,`/hourness` 正文不出现 workflow 行缺席的错误。

### 2.7 落地批次

1. 本补记。 2. suppressions 退役(env 三文件 + read.ts 助手 + audit.ts 路径 + 晨报压制行 + 测试)。 3. workflow 行退役(行删、morning-report 移家、派遣行改流水、行清单与全部 pin、探针旧检查改写)。 4. L3 预检两条。 5. docs(ORCHESTRATION、DESIGN、HANDOFF、两份 README)。每批 build/preflight/test 全绿;棘轮 eslint 69 / knip 18 / jscpd 1 只减不增;探针地板 ≥624。
