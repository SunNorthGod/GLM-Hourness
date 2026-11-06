# 状态板块剩余批次：实施计划

设计：`.agents/tasks/status-hub/design.md` 0.3（`d-status-hub-released`，6 条做完条件见节点 `status-hub` 的 acceptance 与设计 §1.4）。机制与批次地图：`docs/DESIGN.md` §2.6。本文件只排剩下的批次，不改设计。

工作树 `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\status-hub`，分支 `status-hub-2`。批次编号接图上的叫法：第 1、3、4、5 批已做；第 6 批是「M7 的读者与晨报改读」（图上 2026-11-03 批注），仍等 M7；本计划新开第 7、8 批。

## 0. 基线（2026-11-05）

- 合并：`bac6e16` = `Merge remote-tracking branch 'origin/main' into status-hub-2`，并入 origin/main `07b3356`（loops-runner `a9adca8`、user-graph UG3–UG7 `91f1dbd`、metrics `31c9e0f`、视频改版）。冲突三处：`package.json` 的 `test:1` 取 main 的链再插回 `guard-status.spec.ts`（guard-measure 之后）与 `env-status.spec.ts`（env-suppressions 之后），`test:2` 取 main（是本分支的超集），167 个 spec、无重复；`docs/HANDOFF.md` 取 main 的用户图、指标两行与本分支的状态板块一行（main 的状态板块行自上次合并未变）；`src/guard/index.ts` 删 main 那行 `import type { GuardRecord }`（本分支的 records 导入已带它，TS2300 重复标识）。
- 门禁（日志 `.llm\logs\sh-merge2-*.log`）：build 0；preflight 0（2 个包、16 个源目录，dsh-glm-zcode 5 行、dsh-hourness 14 行，共 19 行）；npm test 0（167 个 TAP 汇总，2954 过 / 0 败 / 1 跳过，graph:smoke ok）；probe 0（376/376，锁 `.llm\probe-lock-2`，跑完已删）。
- 棘轮：eslint 73 suppressed / knip 18 / jscpd 1（7 行）。main 已把上限压到比简报的 76/19/1 低，以这组数为「不许上升」的线。

## 1. 依赖现状（以 origin/main `07b3356` 为准）

| 依赖 | 现状 | 对状态板块的意义 |
| --- | --- | --- |
| metrics | 已合入 main（`31c9e0f`），指标行默认启用；`boardView` 的 `load` 组（`relayed: true`）就是三个减负数字，`view.json` 每项目一份 | `metrics/load` 条目现在能做（第 7 批） |
| loops-runner | 已合入 main（`a9adca8`）；循环板页面 `ui/src/loops/` 在 main，`loopsBoard` 明写不交条目；`glmHournessLoops` 没有 `staleEntries`/`timeoutEntries` 成员（只在注释里） | loops 两张周清单与循环板的 items 仍不能做 |
| M7 | origin/m7 `77a0c87` 领先 main 19 个提交，未合入；没有 `src/operate/`、`fourAnswers`、`weeklyReport`，`hourness_report` 只在 `OPERATE_TOOL_NAMES` 里有名字；m7 线在 E7，下一步 E8；运维行是 M7 设计的 P3 一步 | 第 6 批（报告面读收集器、晨报「用量（今天）」两扇窗、`hourness_report` 的 L3）仍等 |
| m4-checks | origin/m4-checks `4da6f93`（B1）；B2 `1e71d10` 本地未推；B2–B6 待做；`limits.jsonl` 在 B5 | M4 的超时条目仍等 |
| 规则板页面 | 不在任何分支；`docs/ORCHESTRATION.md` §6/§16 写「还没有规则页〔规划〕」，ui 里没有 `id: 'rules'` 的板登记 | 规则板 items 与板块路的一源 L3 仍等 |
| M5 lessons | 设计 §12 的 M5 行：本轮可不改（`d-freeze-until-dogfood`） | 不排批次 |

## 2. 做完条件现状（做完第 7、8 批之后）

| 条件 | 已有 | 第 7、8 批补的 | 还缺、等谁 |
| --- | --- | --- | --- |
| 1 四处同一份数 | 报告路 `/hourness` 的「面板」「额度」两节读条目（L2，第 1、3 批） | 第 8 批：真实运行时里两节与收集器读到的条目逐字相等（L3）；第 7 批：指标板 `view.json` 与 `metrics/load` 是同一个对象（L2） | 周报与 `hourness_report` 两处（M7 P3）；ui 板页的 items（规则板页面、loops 两张清单） |
| 2 `hourness_report` 无 person | 收集器 `agent` 档过滤（L2，第 1 批） | 第 8 批：真实运行时 `agent` 档无 person 条目（同一过滤函数，L3） | `hourness_report` 本体与它的探针（M7 P3） |
| 3 无 person、无比率 | 过滤（L2）；指标 pin 测试（`/hourness` 不含板上名字） | 第 7 批：指标行只交 `relayed` 的 `load` 组；第 8 批：`/hourness` 的指标一节只有六个事实组标题、指标行只交 `metrics/load`（L3） | `hourness_report` 一半（M7 P3）；L4 桌面核对（M7 之后） |
| 4 出错隔离 | L2（第 1 批，`tests/status.spec.ts`） | — | 无 |
| 5 陈旧标注 | L2（第 1 批） | — | 无 |
| 6 用量经一条 section 条目 | 「面板」一半：`renderHourness` 经 `glm/usage`（L2，第 1 批） | 第 8 批：「面板」一节等于 `glm/usage` 的 `text`+`detail`（L3） | 晨报「用量（今天）」仍在 `src/workflow/morning-report.ts` 直接调 `usagePanelOf`/`usagePanelLines`（本期切片），等 M7 P3 的 `fourAnswers` 接收集器时定两扇窗 |

HANDOFF 状态板块一行「还缺什么」栏里的「面板与额度两节经条目显示（做完条件 6 的面板一半）」已在代码里做完（第 1、3 批），第 7 批改那一行时挪到「代码」栏。

## 3. 现在能做的批次（按执行顺序）

### 第 7 批：`metrics/load`（设计 §4.2 表、§12 指标行）

- 范围：指标行把指标板 `load` 组（三个减负数字，最近 7 天那一栏）交成一条 `metrics/load` 条目（`audience: 'agent'`，owner `metrics`），读的是写进 `view.json` 的同一个视图对象。报告面今天不列它：设计 §5 定 `/hourness` 不列减负数字，周报（M7）是它的消费方，同第 4 批的做法（先交条目，消费方随 M7）。比率组一律不交。
- L2：`tests/metrics-board.spec.ts` 加两个测试（纯函数；行接线与一源）。L3：无（消费方 `hourness_report` 不在；第 8 批只核指标行不交别的条目）。
- 文档：DESIGN §2.6（标题加第 7 批、新段、把旧段「后续批次」里的 `metrics/load` 一项整条改写、验证段加测试）；ORCHESTRATION §10.6「指标板」一条后加一句；HANDOFF 状态板块行。
- 做完条件：1（板与条目同源，L2）、3（只交 `relayed` 组）。

### 第 8 批：真实运行时的 hub（L3，设计 §11 L3 能做的部分）

- 范围：探针的脚本化 provider 加一个步骤标记 `hub`，在该步命令跑完之后对请求的会话调真实的 `collectStatus`（`agent` 与 `all` 两档）记下结果；glm 场景最后一步（跑 `/hourness` 那步）打上它；`run-probe.mjs` 加 4 条检查。
- L3：探针 +4 条。L2：无新增。
- 文档：DESIGN §2.6（标题加第 8 批、验证段加 L3）；ORCHESTRATION §11.3 的「状态板块」一段加 L3 一句；HANDOFF 状态板块行；`scripts/probe/probe-llm.mjs` 与 `run-probe.mjs` 的文件头注释。
- 做完条件：1、2、3、6 的 L3 中现在够得着的那一半。

## 4. 仍要等的项

| 项 | 等谁 | 依据 |
| --- | --- | --- |
| 第 6 批：M7 的 `fourAnswers`/`weeklyReport`/`hourness_report` 读 `collectStatus(..., 'agent')`；晨报「用量（今天）」与 `glm/usage` 的两扇窗口径；`rules/denials`、`rules/lifts`、`env/suppressions` 进报告版面；周报转述 `metrics/load`；`hourness_report` 两个 kind 的 L3（无 person、无比率） | M7 运维行 P3（`src/operate/`）实现并合入 main；origin/m7 现在在 E7，P3 未开工 | 设计 §6、§10、§12 M7 行；DESIGN §2.6 第 1 批段 |
| M4 的超时条目（超时的数与来源，P13-01 同源那一面） | m4-checks 的 B5（`limits.jsonl`、`check_limit`）合入 main | 设计 §12 M4 行；m4-checks 计划 B4 加 `timing`、B5 加 `limits` |
| `loops/*` 两张周清单与循环板 `snapshot().items` | 循环板服务的 `staleEntries`/`timeoutEntries` 成员（schedules 设计 §6.11、S5 的人同意那条路）；不在任何分支，loops-runner 计划第 5 条把它推到「随报告面那批」，即与 M7 的周报同批 | 设计 §12 循环板行；ORCHESTRATION §18.7 |
| 规则板页面从 snapshot 填 `rules/*` items；板块路的一源 L3（`snapshot().items` 与 `collectStatus` 同一份） | 规则板页面（rules 设计 §9.1，ORCHESTRATION §16「还没有规则页」）；目前没有线在做；面板线的条件 8 也等它 | 设计 §3.4、§11 L3、§12 规则板行 |
| lessons 行条目 | M5 下一稿（`d-freeze-until-dogfood`，自举之后） | 设计 §12 M5 行 |
| L4 桌面核对（面板「现在」一行与晨报一致；主 Agent 转述的晨报无比率） | 第 6 批之后 | 设计 §11 L4 |

## 5. 实施步骤

- [x] 1. 基线收尾（规划步已做）：探针 376/376 全绿后把 `bac6e16` 与本文件推到 `origin/status-hub-2`；本文件单独一个提交 `docs(status-hub): the plan for batches 7 and 8, and what still waits`。
      Files: `.agents/tasks/status-hub/impl-plan.md`
      Verify: `git status --porcelain` 为空；`git rev-parse HEAD` 等于 `git rev-parse origin/status-hub-2`。

- [x] 2. 第 7 批代码：新建 `src/metrics/status.ts`，导出 `metricsStatusItems(view: MetricsBoardView, source: string): StatusItem[]`：`view.at === null` 返回 `[]`；取 `view.groups` 里 `id === 'load'` 的组，组不在、`relayed !== true` 或没有行时返回 `[]`；否则一条 `{ id: 'metrics/load', owner: 'metrics', audience: 'agent', asOf: view.at, source, text }`，`text` = `` `${view.windows[0]}：${rows.map(row => `${row.label} ${row.values[0]}`).join('；')}` ``；不带 `fields`、`detail`、`staleAfterMs`（板自己的 `at` 就是时刻，设计没给陈旧判据，不加）。文件只导入 `../shared/metrics-board.ts` 与 `../shared/status.ts` 的类型；**文件全文（含注释）不得出现字符串 `board-view` 与 `scoresFor`**（`tests/metrics-board.spec.ts` 的 pin 测试扫描 src 全文）。
      改 `src/metrics/index.ts`：导入 `provideRowStatus`（`../shared/status-host.ts`）与 `metricsStatusItems`（`./status.ts`）；在 `lastGood` 旁加 `const boardViews = new Map<string, MetricsBoardView>()`（每项目最近一次写进 `view.json` 的那个视图）；`refreshBoard` 里在 `lastBoardAt.set(root, now())` 之后算 `const capped = capView(view)`、`boardViews.set(root, capped)`，写文件那行改为 `JSON.stringify(capped, null, 2)`（文件与条目是同一个对象）；在 `const health = provideRowHealth(...)` 之后加 `const status = provideRowStatus(ctx, 'metrics', sessionId => { const root = sessionId === undefined ? undefined : projectOfWhere({ sessionId }); const view = root === undefined ? undefined : boardViews.get(root); return root === undefined || view === undefined ? [] : metricsStatusItems(view, viewFileOf(root)) })` 与 `disposers.push(() => { status.dispose() })`，上方一段注释说明：条目是板的 `load` 组、读的是 `view.json` 的同一个对象、算出之前与会话无项目时没有条目、比率组不交（设计 §4.2、§4.3）。`STATUS_ROWS` 已含 `metrics`，不改。
      Files: `src/metrics/status.ts`（新）、`src/metrics/index.ts`
      Verify: `npm run build` 退出码 0。

- [x] 3. 第 7 批测试：在 `tests/metrics-board.spec.ts` 末尾加两个测试，复用文件里已有的 `inputOf`、`compose`、`loadFixture`、`boardFixture`、`untilView`、`AT`、`NOW`、`windows`（不新建 spec 文件：新文件要复制 `boardFixture`，jscpd 会涨）。
      (a) `metricsStatusItems: the relayed load group is the one metrics/load entry, words and moment from the view`：用 `compose(boardView(inputOf(loadFixture('events-design.json'))), '2026-11-04T09:00:00.000Z', ...)` 得到视图；断言恰一条，`id`/`owner`/`audience`/`asOf`/`source` 如上，`text` 等于由该视图 `load` 组各行 `label` 与 `values[0]` 按上式拼出的串，`validateStatusItem(entry)` 为 `ok` 且 `warnings` 为空，`text` 不含 `%`（比率都经 `pct` 带 `%`）；`at: null` 的视图返回 `[]`；去掉 `load` 组返回 `[]`；`load` 组 `relayed: false` 返回 `[]`；`problem` 非空、`groups` 是上次好的那份时仍出条目，`asOf` 是 `view.at`。
      (b) `the metrics row hands metrics/load through glmHournessStatus/metrics: the same view the file holds, none before the first compute or for an unknown session, withdrawn with the row`：`boardFixture()` 之后先断言 `glmHournessStatus/metrics` 视图的 `items(rt.agent.id)` 为 `[]`；`emit(AT)`、`flush()`、`untilView(root, view => view.at !== null)` 之后断言 `items(rt.agent.id)` 深等于 `metricsStatusItems(parseMetricsBoardView(JSON.parse(<view.json 文本>)), join(root, '.llm', 'metrics', 'view.json'))`，`collectStatus(rt.ctx as never, rt.agent.id, 'agent', AT).items` 里 owner 为 `metrics` 的恰是这一条，`items('nobody')` 为 `[]`；`dispose()` 之后 `rt.ctx.get(statusServiceName('metrics'))` 为 `undefined`。新增导入：`metricsStatusItems`（`../src/metrics/status.ts`）、`collectStatus`（`../src/report/status.ts`）、`statusServiceName`、`RowStatusView`（`../src/shared/status-host.ts`）、`validateStatusItem`（`../src/shared/status.ts`）。
      Files: `tests/metrics-board.spec.ts`
      Verify: `node --experimental-strip-types tests/metrics-board.spec.ts` 全过；再跑 `node --experimental-strip-types tests/status.spec.ts` 仍全过。

- [x] 4. 第 7 批文档、门禁、提交：
      `docs/DESIGN.md` §2.6：标题改「第 1、3、4、5、7 批已实现 2026-11-03/04/05」；在「批次 4」段后加「批次 7（指标的减负数字，设计 §12 指标行，2026-11-05）」一段（指标行经 `provideRowStatus(ctx, 'metrics', …)` 交 `glmHournessStatus/metrics`；条目是写进 `view.json` 的同一个视图的 `load` 组、最近 7 天一栏，`text` 的写法、`asOf` 是板的 `at`；板算出之前、会话无项目、组不是 `relayed` 时没有条目；比率组不交；`/hourness` 不列，周报（M7）是消费方）；「`rules/peak` 并成整条」段末的「后续批次：…」整条改写，删去 `metrics/load` 一项；验证段加 `tests/metrics-board.spec.ts` 的两个测试。
      `docs/ORCHESTRATION.md` §10.6「指标板〔第 4a 步…〕」一条末尾加一句：板的 `load` 组同时交成状态板块条目 `metrics/load`（`src/metrics/status.ts`，`DESIGN.md` §2.6），读的是同一个视图，给周报转述，比率不交。
      `docs/HANDOFF.md` 状态板块行：代码栏加第 7 批，并把「面板与额度两节经条目显示」移进代码栏；还缺什么栏删 `metrics/load`，其余按本文件 §4 改写。
      门禁：在工作树里依次 `cmd /c "npm run build > .llm\logs\sh-b7-build.log 2>&1"`、`preflight`、`npm test`、`npm run -s probe`（探针前按简报取锁、跑完删锁），每道之后取 `$LASTEXITCODE`，四道全为 0；棘轮 eslint ≤73、knip ≤18、jscpd ≤1。
      提交 `feat(status-hub): batch 7 — metrics/load, the board's burden numbers as one entry`，正文列文件与门禁数字；推 `origin/status-hub-2`。
      Files: `docs/DESIGN.md`、`docs/ORCHESTRATION.md`、`docs/HANDOFF.md`
      Verify: 四道门禁退出码 0、探针全绿；`git log origin/status-hub-2 -1` 是该提交。

- [x] 5. 第 8 批探针采集：`scripts/probe/probe-llm.mjs` 加 `import { collectStatus } from '../../packages/hourness/dist/report/status.js'`；在 `peakMode` 那一块之后（命令已跑完）加步骤标记 `hub`：`step.hub === true` 时 `const now = Date.now()`，`hub = { agent: collectStatus(this.ctx, request.sessionId, 'agent', now), all: collectStatus(this.ctx, request.sessionId, 'all', now) }`，抛错记 `{ error }`；dump 里照 `peakMode` 的写法加 `...(hub === undefined ? {} : { hub })`；文件头注释加一句「a step marked `hub` records what the status hub's collector reads for the session after the step's command, at the agent and the all audience (status hub design 0.3 §11 L3)」。
      Files: `scripts/probe/probe-llm.mjs`
      Verify: `npm run build` 退出码 0（探针在第 7 步跑）。

- [x] 6. 第 8 批检查：`scripts/probe/run-probe.mjs` 的 glm 场景最后一步改为 `{ text: 'done', status: true, command: { name: 'hourness' }, hub: true }`；在 `glmPanel` 定义之后加 `const glmHub = statusStep(glm)?.hub` 与按 id 取 `glmHub.agent.items` 的小函数；在 `pricing:` 那条检查之后加 4 条：
      (a) `status hub: the collector reads the real runtime's rows without a failure, and the agent audience carries no person entry`：`agent.rows` 非空且没有 `outcome === 'error'`；`agent.items` 全是 `audience === 'agent'`；`agent.items` 的 id 序列等于 `all.items` 过滤 `audience === 'agent'` 之后的 id 序列。
      (b) `status hub: /hourness 面板 is the entries — the peak line first, the usage entry's text and detail last — and 额度 is the quota entry`：`sectionOf(glmHourness.text, '面板')` 第一行等于 `rules/peak` 的 `text`，末尾 `1 + detail.length` 行等于 `[glm/usage.text, ...glm/usage.detail]`；已有的 `glmQuotaSection` 等于 `[glm/quota.text, ...(glm/quota.detail ?? [])]`。
      (c) `status hub: one rules/peak entry for the session (the hourness row's half yields to the rules row)`：`rules/peak` 恰一条。
      (d) `status hub: no metrics ratio on the agent path — the metrics row hands only metrics/load, and /hourness's metrics section heads only the fact groups`：`all.items` 中 owner 为 `metrics` 的 id 都是 `metrics/load`；`sectionOf(glmHourness.text, '指标（流水，今天）')` 非空，其中以 `### ` 开头的行都在 `['### 任务', '### 拦截', '### 撤下', '### 超时', '### 额度停住', '### 汇报']` 内（照 `src/workflow/morning-report.ts` 的 `FACT_GROUP_TITLES`，注释写明出处；不导出该常量，免得 knip 涨）。glm 场景的工作目录是本仓库检出，是 git 项目，这一节应在；若它变成「指标（流水）」读不到，检查要失败，不放宽。
      文件头注释（`run-probe.mjs` 讲 `/hourness` 那几行）加一句：glm 场景的 `/hourness` 一步同时记下收集器读到的条目，核对两节逐字来自条目、`agent` 档无 person、指标只交 `metrics/load`。
      Files: `scripts/probe/run-probe.mjs`
      Verify: 取锁后 `npm run -s probe`，退出码 0，总数比基线多 4 且全绿。

- [x] 7. 第 8 批文档、门禁、提交：`docs/DESIGN.md` §2.6 标题加第 8 批、验证段加「L3：探针 glm 场景……」一句（四条检查各一句话）；`docs/ORCHESTRATION.md` §11.3「状态板块〔2026-11-03…〕」一段末尾加 L3 一句；`docs/HANDOFF.md` 状态板块行代码栏加第 8 批与 L3。全量门禁同第 4 步（日志 `sh-b8-*.log`）。提交 `test(status-hub): batch 8 — the hub in the real runtime (L3)`，推 `origin/status-hub-2`。
      Files: `docs/DESIGN.md`、`docs/ORCHESTRATION.md`、`docs/HANDOFF.md`
      Verify: 四道门禁退出码 0、探针全绿；`origin/status-hub-2` 指向该提交。

## Digest

- `src/metrics/index.ts`（721 行）：`export function apply(ctx: MetricsContext, config: MetricsConfig = {}): () => void` 自 :190。`const lastGood = new Map<...>()` 在 :214；`const disposers: Array<() => void> = []` 在 :223；`const health: RowHealth = provideRowHealth(ctx, 'metrics', 'inactive', '指标行还在起')` 在 :225。`function projectOfWhere(where: { readonly sessionId?: string, readonly dir?: string }): string | undefined` 在 :321（先 `dir`，再 `agents()?.get(id)?.session?.header?.cwd` 经 `projectOf`）。`const viewFileOf = (root: string): string => join(root, '.llm', 'metrics', 'view.json')` 在 :106。`async function refreshBoard(root: string)` 自 :658：`view` 在 try/catch 里定形（成功 `{ version: 1, at: tried, tried, problem: null, basis, windows: windows.labels, groups }`，失败带上次好的 `groups` 与 `problem`），`lastBoardAt.set(root, now())` 在 :689，写文件 `await writeAtomicView(viewFileOf(root), \`${JSON.stringify(capView(view), null, 2)}\n\`, io)` 在 :695。`capView`、`boardView`、`boardWindows` 从 `./board-view.ts` 导入（:35）。被 `tests/metrics-board.spec.ts`、`tests/metrics-row.spec.ts` 覆盖。
- `src/metrics/board-view.ts`：`boardView` 的第一组是 `{ id: 'load', title: '你的负担（周报里主 Agent 也会说这几个数）', relayed: true, note: …, rows: [问你几次, 每次要读的字（中位数）, 你回话等了多久（中位数）] }`，行的 `values` 是 `[最近 7 天, 前 7 天]`；`boardWindows(...).labels` 是 `['最近 7 天', '前 7 天']`。`capView` 先从后面的组丢行，`load` 在第一组。
- `src/shared/metrics-board.ts`：`MetricsBoardView { version: 1, at: string | null, tried, problem: string | null, basis, windows: readonly [string, string], groups: readonly MetricsBoardGroup[] }`；`MetricsBoardGroup { id, title, relayed: boolean, note?, rows: readonly MetricsBoardRow[] }`；`MetricsBoardRow { label, values: readonly [string, string], samples?, note? }`；`parseMetricsBoardView(value: unknown): MetricsBoardView` 在 :104。
- `src/shared/status.ts`：`StatusItem`、`STATUS_TEXT_MAX = 200`、`validateStatusItem(value): { ok: true, item, warnings } | { ok: false, reason }`。`src/shared/status-host.ts`：`provideRowStatus(ctx, row, itemsFn)`、`statusServiceName(row)`（`glmHournessStatus/<row>`）、`RowStatusView { row, items(sessionId) }`。`src/report/status.ts`：`STATUS_ROWS = HEALTH_ROWS`（`HOURNESS_ROWS` 含 `metrics`，`src/shared/health.ts`:26）、`collectStatus(ctx, sessionId, 'agent' | 'all', nowMs): { items, rows: { row, outcome: 'ok' | 'absent' | 'error', reason? }[] }`、`statusViewOf`、`statusPlaceholders`。
- 条目函数的先例：`src/env/status.ts` 的 `envStatusItems(records, source)`（`id: 'env/suppressions'`、`owner: 'env'`、`audience: 'agent'`）；行接线先例 `src/env/index.ts`:127、`src/guard/index.ts`:369（`provideRowStatus` + `disposers.push(() => { status.dispose() })`）。
- `src/report/index.ts`：`renderHourness` 在 :102 `collectStatus(options.status.lookup, options.status.sessionId, 'agent', nowMs)`，按 id 取 `glm/usage`、`rules/peak`、`glm/quota`；「面板」= `['', '## 面板', peak.text?, basis, ...scope, usage.text, ...usage.detail]`，「额度」= `['', '## 额度', quota.text, ...quota.detail]`。`peakStatusItems` 的 owner 是 `rules`（`src/report/panel.ts`:473），`glm/usage`、`glm/quota` 的 owner 是 `glm`。
- `src/workflow/morning-report.ts`：:257 仍直接 `usagePanelLines(usagePanelOf(input.usage, input.pricing, input.problem), options)`（条件 6 的晨报一半，等 M7）；指标一节 `metricsLines`（:390）有项目时标题 `## 指标（流水，今天）`，按 `FACT_GROUP_TITLES = ['任务', '拦截', '撤下', '超时', '额度停住', '汇报']`（:376，未导出）写 `### <title>`；没有项目时 `## 指标（流水）` 加读不到一行。
- `tests/metrics-board.spec.ts`（577 行）：`inputOf`（:40）、`compose(shaped, at, tried)`（:49）、`loadFixture`、`windows`、`AT`、`NOW`；pin 测试（:140）断言 src 全文里提到 `scoresFor` 的只有 `metrics/board-view.ts`、`metrics/calc.ts`、`metrics/cli.ts`，提到 `board-view` 的只有 `metrics/index.ts`；`boardFixture()`（:218）返回 `{ root, rt, health, emit(at), flush(), setClock, failCompute, failRename, dispose }`，`timer` 把回调攒进 `bodies` 由 `flush` 跑；`untilView(root, want)`（:276）轮询 `view.json`。
- `scripts/probe/probe-llm.mjs`：步骤标记的先例 `peakMode`（:471–482，命令之后采集）、dump 写在 :518 起，`...(peakMode === undefined ? {} : { peakMode })` 在 :535；`this.ctx.get(...)` 可用。
- `scripts/probe/run-probe.mjs`（2980 行）：`runScenario(name, model, script, task, overlay = [], cwd = repo, ...)`（:248，glm 场景的工作目录是仓库检出）；glm 场景最后一步 `{ text: 'done', status: true, command: { name: 'hourness' } }` 在 :333；`glmHourness = statusStep(glm)?.command`、`glmPanel` 在 :2020–2021；`sectionOf(text, heading)`（:2135，`## heading` 下的非空行到下一个 `## `）；`glmQuotaSection` 在 :2139；`pricing:` 检查在 :2864。
- `package.json`：`test:2` 已含 `tests/metrics-board.spec.ts`，本计划不改测试链。
- 已验证（`bac6e16`）：build 0、preflight 0、npm test 0（167 个 TAP 汇总，2954 过 / 0 败 / 1 跳过），probe 0（376/376），棘轮 73/18/1。第 8 批之后探针应为 380/380（基线不变时）。
