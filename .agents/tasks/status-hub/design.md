# 状态板块（status hub）：设计

版本：0.3（2026-11-01），第 3 稿，依据决定 `d-status-hub`。本稿按第 2 遍设计复审（`design-gate.json` pass 2、`design-review.md`）的 5 条发现修订：SH2-01、SH2-02、SH2-03、SH2-04、SH2-05（逐条见 §13）；第 1 遍的 6 条（H1、H2、M1、N1、N2、N3）已在 0.2 关闭。本稿是短设计：跨几份已放行模块设计的对接面，自身不引入新子系统。范围、决定与非目标见 §1、§12。本稿只写设计，不改任何产品代码，不改被引用的那几份设计，不写 `docs/graph/`。

依据（读到的版本，均不改动）：

- 决定 `d-status-hub`、`d-metrics-ratios-person-only`（项目图节点，`node .agents/tasks/m1-l4/show-nodes.mjs` 读）。
- `docs/CHARTER.md`（§6 第 1 条「模型看到什么」；§8「指标不注入模型上下文」；§3.2 第 5 条的四个减负数字：每周被问几次、每次读多少字、拍板等待时长、因人的决定返工几次）。
- `docs/ORCHESTRATION.md` §2.10（面板）、§11.3（`/hourness` 面板与额度）、§12（运维与晨报）、§13（呈现与落点）、§16（规则板最小一片）。
- `.agents/tasks/design-context.md` 全文（尤以 `d-ask-three-gates`、`d-rules-in-repo`、`d-one-main-agent`、`d-main-agent-peak-exempt`、最后几节）。
- main 上的源码：`src/report/index.ts`（`/hourness`、`renderHourness`、`/hourness-status`）、`src/report/panel.ts`（`usagePanelOf`、`usagePanelLines`、`usagePanel`、`peakLineOf`、`quotaSection`、`rangeLine`、`parseGaps`、`gapLines`）、`src/workflow/morning-report.ts`（`morningReport`、`reportFromFiles`）、`src/graph/panel-row.ts`（`/graph-apply`、`/graph-run`、`hournessProject` 投影、行健康）、`src/shared/health.ts`（行健康登记：每行 `provideRowHealth` 提供只读视图服务 `glmHournessHealth/<row>`，`collectHealth` 汇总，`/hourness-status`、`/glm-status` 各渲染一张表）。
- 面板设计 `.agents/tasks/plain-ui/design.md` 1.3（2026-11-01；§4.7 板块登记表、`BoardState`、`homeLine`、`guideLine`、`BOARD_ORDER`、§8.2 外部输入校验、§11 衔接）。只读接口部分。
- M4 `.agents/tasks/m4/design.md` 0.6（§2.2、§3.10 晨报、§6.3.1 超时与 `limits.jsonl`、§6.8 交给循环板的两项、F16）。
- 指标 `.agents/tasks/metrics/design.md` 0.7（2026-11-01，落实 `d-metrics-ratios-person-only`；评审通过的 0.6 存档为同目录 `design-0.6.md`）：§7.2 事实（`factsFor`）与打分（`scoresFor`）两个出口、§7.3 报告怎样改读、§7.6 指标板（宿主纯函数 `boardView` 由 `scoresFor` 算成一份 `view.json`，投影 `hournessMetrics` 给路径、客户端只读，形状 `MetricsBoardView`，登记在面板板块登记表上的 `id:'metrics'` 板）。
- M6 `.agents/tasks/m6/design.md` 0.7（§6 面板与晨报，`usagePanelOf`/`usagePanelLines` 一份用量清单由晨报与面板共用）。
- M7 `.agents/tasks/m7/design.md` 0.6（§3.10 四答晨报 `fourAnswers`、§3.11.1 运维行与 `hourness_report`、§3.12.4 周报 `weeklyReport`、§3.13 DORA；**周报今天的所有者是 M7**，见 §6）。
- 循环板 `.agents/tasks/schedules/design.md` 0.6（§8 面板、§8.4 `view.json` 与投影 `hournessLoops`、§6.11 周报两张单子）。
- 规则板 `.agents/tasks/rules/design.md` 0.10（§7.2 服务 `glmHournessRules`、§9.1 规则页、§10.5 晨报与指标）。
- M5 `.worktrees/m5/.agents/tasks/m5/design.md` 0.7（§4.9 `stats`、§4.7 板块登记 `lessons`）；主检出的 `.agents/tasks/m5/design.md` 是 0.6，0.7 较新，按 0.7 读。
- M3 附录 `.agents/tasks/m3/design-addendum.md` 0.6（`propose_to_human`、`record_human_answer`、`isMainAgent`、持有者记录）。
- 契约证据：`reference/dsh-desktop-0.2.1-rc.3/`。`dsh-tools/lib/index.js`:2974 `register(definition)` 校验 `output { schema, render, presentationMeta? }`〔实读〕；`dsh-commands/lib/index.js`:300 `execute` 的 JSDoc「without sending it to the model」（方法体自 :327，`parsed === void 0` 返回在 :329），`command/run`、`command/done` 为只记录的 lifecycle 追加（:334、:341）〔实读〕；`dsh-session/README.md`:50、157 `tool/result` 是 surface（模型可见）条目，投影只折叠已有会话事件、第三方不能追加自定义事件（README:70）〔实读〕；`dsh-session-projection/README.md`:56–58 `register(definition)` 与 `stateVersion`〔实读〕；`dsh-api-workspace-files/README.md`:34、36 `readBytes`、`changes`〔实读〕。

## 0. 摘要

- 一件事只在它的模块里算一次。每个模块把自己的状态算成一组「状态条目」（`StatusItem`），面板、晨报、周报、主 Agent 的回答都是这一份条目的不同显示，不各算一遍。起因：面板 P13-01 与 M4 F16 都是同一件事从两处取数、显示对不上（§1）。
- 每条条目注明给谁看（`audience`：`person` 只给人看，或 `agent` 主 Agent 也能读），并带何时（`asOf`）、来源引用（`source`）、给人看的一行字（`text`）、可选的结构化字段（`fields`）与可选的明细行（`detail`）、以及陈旧判据（`staleAfterMs`）。形状见 §2。
- 主 Agent 只经现成工具 `hourness_report` 读 `agent` 条目（结果进模型）；`/hourness` 的晨报内容也由 harness 提示给那唯一的主 Agent（`d-one-main-agent`、指标 0.7 §7.3），按进模型处理、只收 `agent`；只有面板（界面，永不进模型）收两种。指标比率不是 hub 条目，是指标 0.7 §7.6 的专用「指标」板（`MetricsBoardView`、同一张登记表），只给人看（宪章 §8、`d-metrics-ratios-person-only`）。四个减负数字里流水算得出的三个标 `agent`（`metrics/load`），第四个（返工）由 M7 从图算（§4、§6）。
- 不另起登记表（`d-status-hub`）。host 侧照搬行健康的样式：新函数 `provideRowStatus`（宿主登记，`src/shared/status-host.ts`）与 `collectStatus`（报告收集，`src/report/status.ts`）与 `src/shared/health.ts` 的 `provideRowHealth`/`collectHealth` 平行，提供与 `glmHournessHealth/<row>` 并列的 `glmHournessStatus/<row>`；面板侧复用 plain-ui 已有的板块登记表 `ui/src/graph/boards.ts`，只在 `BoardState` 上加 `items`，不新建第二套面板登记（§3）。
- 一件事只算一次由一条不变量钉住：每个模块把自己的条目写成一个纯函数，它的投影（面板那一路）与 host 收集器（报告那一路）都调这同一个函数。P13-01/F16 由此关闭（§3、§9）。
- 模块拥有字（`text`、`detail` 的措辞，过人话检查）；hub 拥有版面（哪一处显示哪些条目、次序、分组、受众过滤、陈旧与缺失的写法）。hub 不改写模块的字（§5）。
- 已并入 main 的 M6 用量清单（`usagePanelOf`/`usagePanelLines`，已由晨报与面板共用）是第一条按 hub 登记的 section 型条目，作为迁移样板（§10）。

## 1. 需求与范围

### 1.1 来源与问题

人 2026-11-01 提：「要不要统一一个状态板块，把什么周报啊晨报啊高峰之类的所有全部移进去，UI能看Agent也能说？」编排方建议统一数据来源而不是合成一页，人答「可以」，并同意现在就写设计（`d-status-hub`）。

问题的证据是两条已记的发现：面板 P13-01（面板与循环板对同一个超时上限各取一份数据，显示会对不上）与 M4 F16（晨报的对账只读当天流水，而撤下多半是几天前的事，照字面每天误报）。两者都是同一件事从两处取数。

### 1.2 功能需求

- F1 条目形状：定义一条状态条目的字段（谁交、给谁看、何时、来源、人话一行、结构化字段、明细、陈旧），一处定义、各处引用（§2）。
- F2 一件事一处算：每件状态由它的模块算一次，面板 / 晨报 / 周报 / 主 Agent 的回答读同一份（§3.1）。
- F3 受众：每条标 `person` 或 `agent`；能进模型的路只收 `agent`，`person` 只到面板这类界面；指标比率不是 hub 条目（在指标 0.7 §7.6 的专用板）（§4）。
- F4 复用板块登记表：面板侧用 plain-ui 已有的 `boards.ts`，不另起登记（§3.4）。
- F5 晨报、周报成为视图：晨报（`/hourness`、M7 四答）与周报（M7）读 hub 条目，模块拥有字、hub 拥有版面（§5、§6）。
- F6 主 Agent 的读路与禁区：经 `hourness_report` 读 `agent` 条目，永不读 `person` 条目与指标比率（§4.3）。
- F7 失败：激活期不抛错；条目取不到或形状不对时降级、写可见占位并告警，不静默顶替（§7）。
- F8 迁移：把已并入的 M6 用量清单纳入 hub 的一条 section 型条目（§10）。

### 1.3 非功能需求

- 一件事一处算是本设计的核心不变量，由每个模块的单一纯函数与 L2/L3 守（§9、§11）。
- host 侧收集与渲染是纯函数（输入条目与窗口，输出文字），可在不起 DSH 的情况下测。
- 依赖的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）：单一事实源（single source of truth）、关注点分离（数据契约 / 版面）、受众分级的信息披露（least-privilege 读）。

### 1.4 验收（建议写进节点，人定「怎样算做完」）

1. 同一件状态在面板、晨报、周报、`hourness_report` 四处的数值一致（同一份条目，L3）。
2. `hourness_report`（任一 `kind`）的结果里没有一条 `person` 条目（L2 受众过滤 + L3 探针）。
3. `/hourness` 与 `hourness_report` 的输出里都没有 `person` 条目、没有指标比率（L2 受众过滤 + L3 探针）；指标比率只在面板的指标板上（指标 0.7 §7.6），L4 核人能在面板看到、主 Agent 转述的晨报/周报看不到。
4. 某模块的条目函数抛错时，别的模块的条目照显示，出错处写一条可见占位并告警（L2）。
5. 陈旧条目带「截至 <asOf>」的提示，不被丢掉（L2）。
6. M6 用量清单经 hub 的一条 section 条目显示，面板与晨报不各自调 `usagePanelOf`（L2、L3）。

## 2. 一条状态条目的形状

类型与校验定义在客户端安全的公共库 `src/shared/status.ts`（两个包都编进去；不导入 Node 内置模块，同指标 0.7 §7.6.2 的 `src/shared/metrics-board.ts` 约定），纯数据与纯函数、无 I/O，客户端只取类型 `StatusItem`（类型擦除）。宿主侧的登记与收集分开放在别的文件（§3.2、§3.3），不把引 `ProvideHost` 的宿主代码塞进客户端构建（N2）。

```ts
export type StatusAudience = 'person' | 'agent'

export interface StatusItem {
  /** 稳定 id，写成 '<owner>/<name>'，例 'glm/quota'、'rules/peak'、'metrics/load'。 */
  readonly id: string
  /** 交它的模块或行（行健康的 HealthRow，或板块 id）。 */
  readonly owner: string
  /** 给谁看：person 只给人；agent 主 Agent 也能读。 */
  readonly audience: StatusAudience
  /** 这件事何时的，ISO 时刻（Date.parse 得有限数）。 */
  readonly asOf: string
  /** 来源引用：流水路径加键、投影名、或节点 id。用于追溯，不进人面显示。 */
  readonly source: string
  /** 给人看的一行字，过人话检查（plain-ui 的换词表），至多 STATUS_TEXT_MAX 个码点、一行。 */
  readonly text: string
  /** 可选结构化字段，供机器视图与核对；不含秘密与命令原文（同指标流水的隐私口径）。 */
  readonly fields?: Readonly<Record<string, string | number | boolean>>
  /** 可选明细行（section 型条目的展开体，例用量清单），每行已是人话、一行。 */
  readonly detail?: readonly string[]
  /** 多久之后算陈旧，毫秒；缺省不陈旧。 */
  readonly staleAfterMs?: number
}

export const STATUS_TEXT_MAX = 200
```

`isStale(item, nowMs)`：`item.staleAfterMs` 有值且 `nowMs - Date.parse(item.asOf) > item.staleAfterMs` 为真。

`source` 写成「包 文件:行」或「投影名」或「节点 id」一类的引用，只给追溯用，不进人面显示（避免把内部符号名放到人面前，`d-plain-questions`）。

两套长度上限（SH2-02）：`text` 上限是 200 码点；但凡其所有者板可能把它放上面板首页 `homeLine` 的条目，`text` 须落在 plain-ui 1.3 §4.7 的 `homeLine` 上限 60 码点内，这样首页那一行与板页同源的逐字相等断言（§3.4、§9、§11）才成立。`text` 超过 60 的条目（section 型的 `glm/usage`、整行较长的 `glm/quota` 等）不上 `homeLine`，由板给一条自写的 ≤60 缩写或诊断型 `homeLine`（§3.4、M1 豁免），该行不受逐字相等断言约束。

受众的判据（§4 展开）：操作态（高峰、额度、用量、推进停住、汇报进度、合入前检查的结果）标 `agent`；宪章四个减负数字里流水算得出的三个标 `agent`；指标比率与按模型/版本比较不作为 hub 条目（在指标 0.7 §7.6 的专用板，§4.2）。

## 3. 一份来源：模块怎样交、谁怎样读

### 3.1 一件事一处算（核心不变量）

每个模块把自己的状态写成一个纯函数 `statusItemsOf(data, nowMs): StatusItem[]`，放在该模块里（host 侧）。这个函数是这些条目的唯一算处。它有两个调用方：

1. **面板那一路**：该模块的会话投影（`hournessRules`、`hournessLoops`、M6 的计价服务读到的 host 状态等）把 `statusItemsOf` 的结果放进它交给面板的数据里（经 `view.json` 或投影）；面板板块登记表的 `snapshot` 读出来。
2. **报告那一路**：host 侧的收集器 `collectStatus`（§3.3）经服务读同一个函数的结果，供晨报、周报、`hourness_report` 用。

两路调同一个函数，所以面板上的一行与晨报里的同一行是同一份数据。P13-01（面板与循环板各取一份超时上限）与 F16（晨报对账的口径）由此收口：超时上限、撤下状态这类跨视图的事实，由拥有它的模块（M4、规则板）算一次，面板与报告都读它，不各自按 `ValueLine` 或按当天流水重算。

### 3.2 host 侧登记：照搬行健康

不新建基础设施样式。宿主侧登记放在 `src/shared/status-host.ts`（与 `src/shared/health.ts` 平行、经 `./dsh-min.ts` 引 `ProvideHost`；与客户端安全的 `src/shared/status.ts` 分开，N2），加一对与 `provideRowHealth` 平行的函数：

```ts
export interface RowStatusView {
  readonly row: string
  items(sessionId: string | undefined): readonly StatusItem[]
}

/** 某行提供它的状态视图服务 glmHournessStatus/<row>；provide 失败告警一次，激活不抛错（同 provideRowHealth）。 */
export function provideRowStatus(ctx: Partial<ProvideHost>, row: string, itemsFn: (sessionId: string | undefined) => readonly StatusItem[]): { dispose(): void }

export function statusServiceName(row: string): string  // 'glmHournessStatus/<row>'
```

每个有状态要交的行在 `apply` 里调 `provideRowStatus(ctx, '<row>', sid => row.statusItemsOf(...))`，`itemsFn` 内部调 §3.1 的纯函数。与 `glmHournessHealth/<row>` 并列，互不依赖加载顺序，行卸载时随 fiber 撤回。这是 host 侧的「交一次」，不是面板的第二套登记表（面板登记表是 `ui/src/graph/boards.ts`，见 §3.4）。

### 3.3 host 侧收集器

`src/report/status.ts`（新）：

```ts
export interface CollectedStatus {
  /** 已过受众过滤与 §8 校验、按 owner 与 id 稳定排序的条目。 */
  readonly items: readonly StatusItem[]
  /** 每个已知行的取数结果，供 §7 的占位/告警与一源核对用。 */
  readonly rows: readonly {
    readonly row: string
    readonly outcome: 'ok' | 'absent' | 'error'
    readonly reason?: string  // outcome 为 'error' 时的告警原因（前 80 字符）
  }[]
}

export function collectStatus(ctx: ServiceLookup, sessionId: string | undefined, audience: 'agent' | 'all', nowMs: number): CollectedStatus
```

消费方：M7（§6）读 `items` 作报告节次，面板一源核对（§11）比对 `items`；`rows` 供 §7 的占位与告警。照 `collectHealth` 的写法：对每个已知行经 `ctx.get(statusServiceName(row))` 取视图，调 `items(sessionId)`，按 `audience` 过滤（`agent` 只收 `audience==='agent'`；`all` 两种都收），逐条过 §8 的校验，陈旧的按 §7 标注。某行的视图缺席（行未启用）跳过；`items` 抛错时这一行计一条占位、告警一次、别的行照常（§7）。返回按 owner 与 id 稳定排序的条目，和每行的取数结果（成功 / 缺席 / 出错）。

已知行取自常量清单 `STATUS_ROWS`（`src/report/status.ts`，写法同 `src/shared/health.ts` 的 `HEALTH_ROWS`），是 `HEALTH_ROWS` 的超集：今天 `HEALTH_ROWS` 只有已合入 main 的行（`glm-*` 与 `data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel`、`rules`、`design`），§4.2 里 owner 为 `metrics`、`execute`/`operate`、`loops` 的行随各自的包合入时加进 `STATUS_ROWS`（新行默认 `disabled: true`，没启用的行被 `collectStatus` 当缺席跳过）。preflight 照 `HEALTH_PACKAGES` 的办法核对每一项都是 `scripts/packages.mjs` 里真有的 loader 行（对不上即报错）。`StatusItem.owner`（`<owner>/<name>`，如 `glm/usage`）标的是交这条的模块或板，可不等于 loader 行名（例 M6 用量由 `glm-login` 行代交，§10）。

### 3.4 面板侧：复用板块登记表，不另起

plain-ui 1.3 §4.7 的 `ui/src/graph/boards.ts` 是面板唯一的板块登记表：`Board`（`id: string`、`label`、`subscribe`、`snapshot`、`Page`）与 `BoardState`（`available`、`homeLine`、`guideLine`、`peakApplies`），`BOARD_ORDER = ['rules','loops','lessons']`，按 id 去重，面板只读。本设计复用它，只请 plain-ui 在 `BoardState` 上加一个可选字段：

```ts
readonly items?: readonly StatusItem[]  // 这块板的状态条目（§2）
```

- 每块板的 `snapshot(sessionId)` 返回它的 `items`，由该板的投影经 §3.1 的 `statusItemsOf` 填出。
- `homeLine`（首页「现在」的一行，plain-ui §4.7 定为至多 60 码点）由各板自己定。当它反映一条 `text ≤ 60` 码点的状态条目时，取该条目的 `text`（同源）；面板断言只核这种情形：`homeLine` 命中 `items` 里某条且该条 `text ≤ 60` 时与它逐字相等（L2），所以首页那一行与板页上的同一条是同一份数据。`text > 60` 的条目（section 型的 `glm/usage`、整行较长的 `glm/quota` 等）不放上 `homeLine`：要它上首页的板给一条自写的 ≤60 缩写或诊断型 `homeLine`（M1 豁免），该行不受逐字相等断言约束（SH2-02）。诊断型首页行同样豁免，照各板设计原样：指标板的 `homeLine` 是「指标板读不出 / 没能更新 / 停在 <时刻>」一类且比率不上首页（指标 0.7 §7.6.3）；循环板的「主 Agent 的会话已归档…」「在另一个 DSH 窗口里…」来自它自己、「额度停住」一行来自 M7（schedules 0.6 §6、验收第 26 项）。这些既不是某条 `items` 的 `text`、也不必为 `null`，断言不覆盖它们；一块板可以同时有 `items` 和一条诊断型 `homeLine`。读不到又没有诊断行时 `homeLine` 为 `null`。
- `guideLine`、`peakApplies` 不变。
- 板页（`Page`）列这块板的 `items`，按 §5 的版面。
- 面板首页「现在」一节与晨报「现在」一类的几行都来自条目：首页读板块 `snapshot().items`，晨报读 `collectStatus`，两边同源（§3.1）。
- 两条显示路的覆盖范围（SH2-03）。**板块路**（`snapshot().items` 上 ui/ 项目图面板板页）只承载 owner 落在某块已登记板上的条目：规则板的 `rules/peak`、`rules/*`、`rules/stale`，循环板的 `loops/*`，经验板的 `lessons`。这些条目两路都走（板页经 `snapshot().items`、报告经 `collectStatus`，同一 `statusItemsOf`）。**报告路**（`collectStatus`，进 `/hourness` 报告、晨报、周报、`hourness_report`）另承载今天无登记板的 owner：`glm/*`、`execute/*`、`metrics/load`——它们不作为 ui/ 面板板块的 `items`。ui/ 面板上的高峰一行是规则板的 `homeLine`（反映 `rules/peak` 的 `text`）、额度停住一行是循环板的 `homeLine`（来自 M7），都是 `homeLine` 而非这些 `StatusItem` 本身（schedules 0.6 §6）。指标比率走指标板的 `MetricsBoardView`，两路都不走（下段）。

不新建第二套面板登记表；不新建跨板的面板端条目聚合器。跨板的首页「现在」仍按 `BOARD_ORDER` 遍历已登记的板、各取它的 `items`。

指标板（指标 0.7 §7.6）登记在同一张登记表上（`id:'metrics'`、在 `BOARD_ORDER` 之外、排在三块已知板之后），但它交的是自带的 `MetricsBoardView`（宿主算 `view.json`、客户端只读），不用 `items`：§3.1 的「一件事一处算 → `items`」对它不成立，因为它的单一源就是指标流水本身，没有第二处在算同一个比率；hub 不把比率复制成 `StatusItem`。这是复用（同一张登记表、同一种板）而不是第二套登记（`d-status-hub`）。

## 4. 受众与禁区

### 4.1 两种受众落在两条读路上

- `hourness_report`（M7 的主 Agent 工具，`dsh-tools` 注册，结果是 `tool/result` surface 条目、进模型上下文）：传 `audience = 'agent'`，只收 `agent` 条目。主 Agent 把它的文字原样转给人（晨报、周报），所以这一路的内容必须是 `agent` 的。
- `/hourness`（人敲的斜杠命令）：`dsh-commands` 的 `execute` 本身不把命令结果作为模型提示发出（`command/run`、`command/done` 只记录，:300/:334/:341），但它渲染的晨报内容会由 harness 另行提示给主 Agent（`d-one-main-agent`：晨报、周报、巡检由 harness 提示给那唯一的主 Agent；指标 0.7 §7.3 据此把 `/hourness` 当作经主 Agent 到人、即进模型上下文）。所以保守起见 `/hourness` 也传 `audience = 'agent'`，不含任何 `person` 条目与比率（与指标 0.7 §7.3「只用 `factsFor`、不含比率」一致）。
- 面板（ui/ 项目图界面，经 `remote.workspaceFiles` 与投影读板块 `snapshot().items`，不经 `collectStatus`，永不进模型）：板页列板的全部 `items`（`person` 与 `agent` 都显示，界面只给人看，§5）。`collectStatus` 的 `'all'` 档为将来需要列 `person` 条目的报告面留着；今天没有 `person` 型 hub 条目（唯一面向人的比率由指标板承载，§3.4），暂无调用方。

受众边界因此落在「会不会进模型上下文」上：能进模型的两路（`hourness_report` 工具结果、作为晨报提示给主 Agent 的 `/hourness` 内容）只经 `collectStatus(..., 'agent')` 拿 `agent`；ui/ 面板走板块路、不进模型。过滤是单一收口点（§9）。

### 4.2 条目的受众（本设计定；可由各模块在自己的设计里细化）

| 条目 | id（示例） | 受众 | 理由 |
| --- | --- | --- | --- |
| 此刻是否高峰、到几点、高峰模式档位 | `rules/peak` | `agent` | 主 Agent 要据高峰决定子 agent 的收放（`d-peak-mode`、`d-main-agent-peak-exempt`）；人也在面板看 |
| 额度：5 小时窗口剩余、周额度、预计耗尽 | `glm/quota` | `agent` | 操作态，主 Agent 要据它判断是否避峰；人在面板看（一页稿场景：人看面板、问主 Agent 额度） |
| 用量清单（按模型调用/token/积分） | `glm/usage` | `agent` | 晨报已转述、模型已看到；section 型（§10） |
| 推进停住（GLM 额度用完）、重置时刻 | `execute/stopped-quota` | `agent` | 主 Agent 要知道为何停、何时自己接上（用户图 G15） |
| 汇报进度（一块做完、目标做完） | `execute/progress` | `agent` | 主 Agent 在对话里说（用户图 G18） |
| 三个减负数字（每周问几次、每次读多少字、等多久；来自 `factsFor`） | `metrics/load` | `agent` | 宪章 §3.2 第 5 条要每周报、主 Agent 转述（`d-metrics-ratios-person-only`、指标 0.7 §7.2「问人（减负数字）」）。第四个（因人的决定返工几次）由 M7 从图算（M7 §3.12.3），不是 hub 条目 |
| 规则拦下计数、撤下状态、超时的数与来源 | `rules/*`、`env/*` | `agent` | 晨报、规则页都显示，主 Agent 要能答 |
| 周报里的两张单子（4 周没结果的、反复超时的）与规矩阶梯提议 | `loops/*`、`rules/stale` | `agent` | 主 Agent 据它提议、转述（§6） |

裸指标流水与指标比率从不作为 hub 条目（宪章 §8、`d-metrics-ratios-person-only`）：比率走指标 0.7 §7.6 已放行的专用指标板（`MetricsBoardView`、同一张登记表，§3.4 末段），hub 只收 `metrics/load` 的三个减负数字（`agent`），不复制比率为 `StatusItem`；指标的两个出口（`factsFor`/`scoresFor`）仍在指标设计里分（指标 0.7 §7.2）。显示路（SH2-03）：表中 `glm/*`、`execute/*`、`metrics/load` 今天无登记板、仅经报告路（`collectStatus`）显示；`rules/*`、`rules/peak`、`rules/stale`、`loops/*` 经各自板的 `snapshot().items` 也上 ui/ 面板板页（§3.4 覆盖范围）。

### 4.3 主 Agent 永不看到的

- 任何 `audience === 'person'` 的条目。
- 指标流水的原始事件与 `scoresFor` 的比率、按模型/版本的比较（宪章 §8、`d-metrics-ratios-person-only`）。
- 条目的 `source`（内部引用）与 `fields` 里的键名不进 `hourness_report` 给人看的文字（它们只供机器视图与追溯）。

主 Agent 的读没有新增工具（YAGNI）：`hourness_report` 已是它读晨报/周报的入口，受众过滤加在它与 `collectStatus` 之间。不加 `status_read` 之类的新工具，也不往主 Agent 的系统提示词里塞一节状态（状态随会话变，提示词是静态槽，`.agents/tasks/prompt-audit/report.md` §0 的布局）。

## 5. 模块拥有字、hub 拥有版面

- **模块拥有**：每条的 `text` 与 `detail` 的措辞由拥有它的模块写，过人话检查（换词表只在 `src/graph/plain-question.ts` 定义一次，plain-ui §5.3），不出「门禁」「验收」「标定」「投影」一类内部词。晨报、周报、面板不改写这些字。
- **hub 拥有**：哪一处显示哪些条目、按什么次序与分组、受众过滤、陈旧与缺失怎么写、section 型条目怎么折叠。版面规则：
  - 面板首页「现在」：按 `BOARD_ORDER` 遍历板，各取该板的 `homeLine`（命中某条 item 时是它的 `text`，否则是诊断行，§3.4），至多各一行。
  - 面板板页：这块板的全部 `items`，`person` 与 `agent` 都列（界面只给人看）；指标板另按 `MetricsBoardView` 显示它的比率（§3.4）。
  - `/hourness`（晨报，经主 Agent 进模型上下文）：晨报节次之后，`collectStatus(..., 'agent')` 的条目按 owner 分组列出；不含指标比率（比率在面板的指标板，指标 0.7 §7.3、§7.6）。`metrics/load`（三个减负数字）不在晨报，按 `d-metrics-ratios-person-only` 与指标 0.7 §7.3 放在周报（版面决定，hub 拥有版面）。
  - `hourness_report` 晨报/周报：`collectStatus(..., 'agent')`，并入 M7 既有的节次（§6），不含 `person` 条目；周报列 `metrics/load` 的三个减负数字，第四个由 M7 从图算。
  - 陈旧：`isStale` 为真的条目，`text` 后加「（截至 <asOf 的人话时刻>）」，不丢。
  - 缺失/出错：某行取不到时写一行「<模块>的状态暂时读不到：<原因>」，不静默，不用别处的值顶替。

模块的字与 hub 的版面在不同层，所以改字不动版面、改版面不动字。

## 6. 晨报、周报与所有者

今天的所有者（读 main 与 M7 0.6）：

- `/hourness` 开头的基础晨报在 `src/report/index.ts`（`renderHourness`）与 `src/workflow/morning-report.ts`（`morningReport`、`reportFromFiles`）。用量一节由 M6 的 `usagePanelOf`/`usagePanelLines` 出（M6 0.7 §6）。
- 四答晨报与**周报**在 M7：`fourAnswers`（`src/report/four-answers.ts`）、`weeklyReport`（`src/report/weekly.ts`），经主 Agent 工具 `hourness_report {kind}`（M7 §3.10、§3.11.1、§3.12.4）。**周报的所有者是 M7**。按指标 0.7 §7.3，M7 的晨报与周报今天从图、检查与前进的记录、违规流水和用量流水算，不读指标流水；`d-status-hub` 要让周报也成为那一份源的视图，这条接缝写成对 M7 的请求（§12），自举之后落地。

成为视图：

- M7 的 `fourAnswers`、`weeklyReport` 读 `collectStatus(ctx, sid, 'agent', now)` 取状态节次（高峰、额度、用量、推进停住、汇报、三个减负数字 `metrics/load`、超时与撤下、两张单子），不再各自从流水/图重算这些行；第四个减负数字（返工）仍由 M7 从图算（指标 0.7 §7.2、M7 §3.12.3）。M7 仍拥有节次的编排与它自己的计算（任务计数、DORA 等不是跨视图共享的那几项照旧在 M7 算）。
- `renderHourness`（`/hourness`）读 `collectStatus(ctx, sid, 'agent', now)`，在晨报节次之后列 `agent` 条目，不含指标比率；`metrics/load` 的三个减负数字也不在 `/hourness`（指标 0.7 §7.3：`/hourness` 不列它们，人定的是周报里转述）。
- 「数字由 harness 算，模型只转述」（M7 §3.12.4）与 hub 一致：条目的 `fields`/`text` 由 harness 算，主 Agent 只转述 `text`。
- 周报比率的归属见 §12 M7 行：M7 0.6 §3.12.4 现在把质量对照等比率放进 `hourness_report {kind:'weekly'}`，人 2026-11-01 定（`d-metrics-ratios-person-only`，指标 0.7 §7.3 据此已写成对 M7 的请求）周报只转述四个减负数字（三个来自 `metrics/load`、第四个由 M7 从图算），其余比率只给人看、在面板指标板上（指标 0.7 §7.6），结果末尾一行指人去看那块板。本设计只把 `metrics/load` 标 `agent`、不改 M7 文件，自举后随 M7 下一稿落地（§12）。

## 7. 失败怎样被发现、怎样退

`apply`（激活期）不抛错：`provideRowStatus` 的 `provide` 失败告警一次、条目留在本行不外露（同 `provideRowHealth`）。本设计不写图、不写流水、不跑命令，没有不可逆动作。

| 哪里会坏 | 怎样发现 | 退路 | 人看到 | 记录 |
| --- | --- | --- | --- | --- |
| 某模块的 `statusItemsOf` 抛错 | `collectStatus` 对每行 `try` | 这一行的条目不出，别的行照常 | 「<模块>的状态暂时读不到：<原因>」 | `console.warn` 每行每种原因一次；行健康 degraded |
| 某条条目形状不对（§8） | 逐条过校验 | 丢这一条；该条有固定槽位时写「没有记录：<原因>」占位 | 那一格的占位 | `console.warn` 每行每种原因一次 |
| 条目陈旧 | `isStale` | 照显示，加「截至 <asOf>」 | 时刻提示 | 无 |
| 状态服务缺席（行未启用） | `ctx.get` 返回空 | 跳过这一行 | 不出这一行 | 无（未启用不是错） |
| 面板板块 `snapshot` 抛错 | plain-ui §4.7 的错误边界 | 这块板当作 `available` 为假 | 该板一行不显示 | `console.warn` 一次（plain-ui 侧） |
| 受众过滤被绕过（`agent` 路出现 `person` 条目） | L2 对 `collectStatus(...,'agent')` 断言无 `person`；L3 探针核 `hourness_report` 无比率 | 过滤是单一函数，改一处 | — | L2/L3 失败 |

出声不藏：取不到的状态写出占位并告警，不用估计值或别处的值顶替（`d-failure-plans`、`docs/DEVELOPMENT.md` §1.1）。

## 8. 外部输入的校验（条目）

`collectStatus` 对每条条目校验（`validateStatusItem`，`src/shared/status.ts`）：

| 字段 | 必填 | 规则 | 不满足时 |
| --- | --- | --- | --- |
| `id` | 是 | 非空字符串，`<owner>/<name>` 形状 | 丢这一条，告警 |
| `owner` | 是 | 非空字符串 | 丢，告警 |
| `audience` | 是 | `'person'` 或 `'agent'` | 丢，告警（不默认任何一种：错判受众是披露风险） |
| `asOf` | 是 | 字符串，`Date.parse` 得有限数 | 丢，告警 |
| `source` | 是 | 非空字符串 | 丢，告警 |
| `text` | 是 | 字符串，一行，去空白后非空，至多 `STATUS_TEXT_MAX` 个码点 | 丢，告警 |
| `fields` | 否 | 对象，值为 string/number/boolean；不含命令原文与秘密（同指标隐私口径） | 非对象当作没有；不合法的键丢弃，告警 |
| `detail` | 否 | 字符串数组，每行一行、至多 `STATUS_TEXT_MAX` | 非数组当作没有；超长行截断并告警 |
| `staleAfterMs` | 否 | 正有限数 | 不合法当作缺省（不陈旧），告警 |

`audience` 不合法时整条丢弃而不是默认 `person`：一条该给人看的丢了，人在面板仍看得到别的来源；一条该给人看的被错当 `agent` 进了模型，是不可逆的披露。两害取前者。

## 9. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 一件状态只算一次 | 拥有它的模块的 `statusItemsOf` 纯函数；投影与 `collectStatus` 都调它 | 不存第二份就不会对不上（P13-01、F16） |
| 主 Agent 不读 `person` 条目 | 能进模型的两路（`hourness_report`、作为晨报提示的 `/hourness`）都传 `agent`，`collectStatus` 过滤；裸指标流水与比率不作为条目交（比率在指标 0.7 §7.6 的专用板） | 过滤是单一函数，收口在一处（§4.1） |
| 能进模型上下文的只收 `agent`；ui/ 面板走板块路、不进模型 | `collectStatus` 只被报告面调用、传 `agent`（`hourness_report`、`/hourness`）；ui/ 面板读板块 `snapshot().items`、两种受众都显示、不经 `collectStatus`，`'all'` 档为将来的 `person` 报告面留着 | `/hourness` 的晨报内容经主 Agent 进模型（`d-one-main-agent`、指标 0.7 §7.3），保守按进模型处理 |
| 指标比率不是 hub 条目；三个减负数字 `agent`、第四个由 M7 从图算 | 指标设计的 `scoresFor`→指标板、`factsFor`→`metrics/load`；hub 不收比率 | 宪章 §8、`d-metrics-ratios-person-only` |
| 面板首页一行命中某条 item 时与它同源 | `homeLine` 命中 `items` 某条且该条 `text ≤ 60` 时等于其 `text`（面板断言）；`text > 60` 与诊断型 `homeLine` 豁免（§3.4） | 首页与板页不各算一行；60 是 plain-ui §4.7 的 `homeLine` 上限，200 是 `text` 上限（SH2-02） |
| 条目的字是人话 | 各模块写 `text`，过 `plainWordsIn`（换词表一处定义） | `d-plain-questions`；人话由模块写、检查由 harness 做 |

## 10. 迁移已并入的 M6 用量清单

M6 0.7 已把用量清单做成一份：`usagePanelOf` 算、`usagePanelLines` 渲染，晨报（`morningReport`）与面板（`/hourness` 的「面板」一节）共用（M6 §6.3）。这正是 hub 要的「一件事一处算、多处显示」，只是今天两个调用方各自调 `usagePanelLines`。

迁移（最小改动，作为 section 型条目的样板）：

- M6 在它的行里 `provideRowStatus(ctx, 'glm-login', ...)`（或由 `hourness` 行代交，视 M6 下一稿定），交一条 `id: 'glm/usage'`、`audience: 'agent'` 的条目：`text` 是用量合计一行，`detail` 是 `usagePanelLines(panel, {basis:false})` 的其余行，`fields` 带合计数，`asOf` 为本期末，`source` 指用量流水路径。
- 晨报与 `/hourness` 的「面板」一节不再各自调 `usagePanelOf`/`usagePanelLines`：两者都经 `collectStatus(ctx, sid, 'agent', now)` 取 `glm/usage` 的 `text`+`detail`。此处的「面板」即 M6 0.7 §6 与验收 2/3 所指 `/hourness` 报告里由 `renderHourness` 产出的 `## 面板` 一节，是报告路，不是 ui/ 项目图面板板块（SH2-01）。用量今天没有承载它的已登记板，§12 也未新增，故仅经报告路显示、不上 ui/ 面板板块 `snapshot().items`（§3.4 覆盖范围）。`usagePanelOf`/`usagePanelLines` 作为该条目的内部实现保留在 `src/report/panel.ts`，只被 `statusItemsOf` 一处调用。
- 额度（`glm/quota`）、高峰（`rules/peak`）同样化为条目；`peakLineOf`、`quotaSection` 作为它们的内部实现保留，只被各自的 `statusItemsOf` 调。

迁移先后：M6 的用量清单已在 main；本设计第 1 步建 `src/shared/status.ts`（类型与校验）、`src/shared/status-host.ts`（`provideRowStatus`）与 `src/report/status.ts`（`collectStatus`、`STATUS_ROWS`），第 2 步把 `/hourness` 的用量与面板的用量改经 `glm/usage` 一条。与 M6 下一稿改同一批文件时，后合入的一方 rebase。

## 11. 测试

- L2（纯函数，不起 DSH）：
  - 每个模块的 `statusItemsOf`：给定投影/流水夹具，返回期望条目（受众、`asOf`、`source`、`text` 正确）。
  - `collectStatus`：`agent` 只收 `agent`；`all` 两种都收；某行视图抛错时别的行照常并出占位；陈旧条目带时刻提示；形状不对的条目被丢并告警。
  - `validateStatusItem`：§8 每条规则各一例，含 `audience` 不合法整条丢弃。
  - 面板断言：当 `homeLine` 命中某条 `text ≤ 60` 的 item 时与它的 `text` 逐字相等；`text > 60` 的 item 与诊断型 `homeLine`（指标板、会话已归档、额度停住）不被此断言覆盖。
  - 迁移：`glm/usage` 一条经 hub 出的 `text`+`detail` 等于旧 `usagePanelLines` 的输出（逐字钉住）。
- L3（探针，真实运行时）：
  - `hourness_report {kind:'morning'}` 与 `{kind:'weekly'}` 的结果里没有一条 `person` 条目、没有指标比率。
  - `/hourness` 的输出里没有 `person` 条目与指标比率；人在面板的指标板看到比率（指标 0.7 §7.6）。
  - 面板板块 `snapshot().items` 与 `collectStatus` 对同一夹具给出同一份条目（一源核对；覆盖 `rules/*`、`loops/*`、`lessons` 这些两路都走的条目）。仅报告路的 `glm/usage` 由上面 L2 的迁移用例（逐字钉住晨报与 `/hourness` 面板一节同源）覆盖。
- L4（桌面版）：面板「现在」的高峰/额度一行与晨报同一行一致；主 Agent 转述的晨报不含比率；人在面板看到比率。

可测性：受众过滤、陈旧、校验、收集都是纯函数，L2 用假服务（手动返回条目）即可测，不渲染 React、不起 DSH。难测处只有「投影与 `collectStatus` 调同一函数」这一条跨进程约束，由 L3 的一源核对覆盖。

## 12. 各设计要采纳的对接改动（不改它们的文件，只列）

下表每一行是该设计要在它自己的下一稿里采纳的接口改动。按 `d-freeze-until-dogfood`，已放行的设计不在本轮改，先记在图上、自举之后各自改；本设计只列、不改。

| 设计（读到的版本） | 要采纳的接口改动 |
| --- | --- |
| 面板 plain-ui 1.3 | `ui/src/graph/boards.ts` 的 `BoardState` 加可选 `items: readonly StatusItem[]`（`StatusItem` 来自客户端安全的 `src/shared/status.ts`，只取类型）；`homeLine` 保持可诊断：命中某条 `text ≤ 60` 的 item 时等于它的 `text`（面板断言只核这种），`text > 60` 的 item 与健康 / 陈旧 / 归档 / 额度停住等诊断型 `homeLine` 不被断言覆盖（M1、SH2-02）。两套上限共处：`items` 全按 ≤200 码点校验，`homeLine` 仍按 §8.2 的 ≤60 校验，逐字相等只覆盖 `text ≤ 60` 的 item。板页（`Page`）与首页「现在」按 §5 的版面渲染 `items`，`person` 与 `agent` 都显示。首页遍历仍按 `BOARD_ORDER`，不新建跨板聚合器。§4.7、§8.2 的 `BoardState` 校验加 `items`（数组、每条过 `validateStatusItem`）。指标板按它自带的 `MetricsBoardView` 流（指标 0.7 §7.6），不走 `items`，与此并存。 |
| M4 0.6 | 超时的数与来源、撤下状态经 M4 的 `statusItemsOf`（`env/*`、`rules/*` 相关的那几条）算一次，交 `provideRowStatus`；晨报「检查的超时」一节与面板那一格读同一条条目，不各自按 `ValueLine` 或 `limits.jsonl` 在两处取（关 P13-01 同源那一面）；对账（F16）读整份流水的口径由 M4 的条目函数定一次，面板与晨报都读它。撤下一行的 `liftHow` 等字段作为条目的 `fields`/`detail`。 |
| 指标 0.7 | 确认性对接，不要求指标改接口：`factsFor` 的三个减负数字作为 `metrics/load`（`audience:'agent'`，供周报转述），第四个（返工）仍由 M7 从图算、不经 metrics 条目（§7.2、§7.3）；`scoresFor` 的比率不作为 hub 条目，走指标 0.7 §7.6 的专用指标板（`boardView`→`view.json`→`MetricsBoardView`、同一张登记表），hub 不复制为 `StatusItem`；裸指标流水从不交出（宪章 §8）。周报比率改在面板看的接缝在下一行。 |
| 晨报/周报所有者 M7 0.6 | `fourAnswers`、`weeklyReport` 的跨视图状态节次改读 `collectStatus(ctx, sid, 'agent', now)`，不各自从流水/图重算高峰、额度、用量、推进停住、汇报、三个减负数字（`metrics/load`）、超时与撤下、两张单子；第四个（返工）仍由 M7 从图算（M7 §3.12.3）。`hourness_report` 传 `audience='agent'`，结果不含 `person` 条目与比率；周报只转述四个减负数字，其余比率改由面板指标板承载、末尾一行指人去看（指标 0.7 §7.3、§7.6，人已定 `d-metrics-ratios-person-only`）。M7 自有的任务计数、DORA 等非共享项照旧在 M7 算。 |
| 循环板 schedules 0.6 | 循环板的板块 `snapshot` 的 `items` 由它的 `view.json` 经 `statusItemsOf` 填（晨报/周报的两张单子 `loops/*`、运行结果的那几行）；`homeLine` 保持可诊断：反映某条状态条目时取该条目的 `text`（同源），而「主 Agent 的会话已归档」「在另一个 DSH 窗口里」（循环板自有）与「额度停住」（来自 M7）等诊断行照旧（§6、验收第 26 项），不被面板的同源断言覆盖（M1）。周报的两张单子（§6.11）作为 `agent` 条目交给 M7 读，不另走一路。 |
| 规则板 0.10 | 规则板的板块 `snapshot` 的 `items` 由 `glmHournessRules` 经 `statusItemsOf` 填（`rules/peak`、拦下计数、撤下状态、规矩阶梯提议、`rules/stale`）；高峰一行（`homeLine`）为其中一条的 `text`；`rules/peak` 标 `agent`。晨报的规则板一节（§10.5）与规则页读同一份条目。 |
| M6 0.7 | 用量清单 `glm/usage`、额度 `glm/quota`、高峰 `rules/peak`（高峰的计算在 M6、档位在规则板）化为 `audience:'agent'` 条目（§10）；`usagePanelOf`/`usagePanelLines`、`peakLineOf`、`quotaSection` 作为条目的内部实现保留，只被 `statusItemsOf` 一处调；晨报与面板不再各自调它们。 |
| M5 0.7（`.worktrees/m5`） | 经验板已登记 `id:'lessons'`（§4.7）；若经验板要在首页「现在」出一行，由它的 `statusItemsOf` 交 `items`、`homeLine` 命中该条时取其 `text`（今天 `homeLine` 为 `null`，不出首页行，可不改）。`stats`（§4.9）里给人看的比率不进 hub 条目（与指标比率一致，宪章 §8）：真要上面板，照指标板那一种做法登记一块自己的只读板或并进指标板，不作为 `StatusItem`；给主 Agent 看的计数若有，按 `agent` 条目交。本轮 M5 可不改。 |

## 13. 变更记录

- 0.3（2026-11-01）：按第 2 遍设计复审（`design-gate.json` pass 2，`design-review.md`）的 5 条发现修订。finding → 改动：
  - SH2-01（MEDIUM）：§10 把 `glm/usage` 的显示路钉为报告路——晨报与 `/hourness` 的「面板」一节（`renderHourness` 的 `## 面板`，M6 0.7 §6、验收 2/3）都经 `collectStatus(..., 'agent')` 取同一条、不经板块 `snapshot().items`；用量无承载板，仅报告路显示、不上 ui/ 面板板页（§10、§3.4）。
  - SH2-02（MEDIUM）：补 200（`text`）与 60（`homeLine`）两套上限共处——逐字相等断言只覆盖 `text ≤ 60` 的条目，`text > 60` 不上 `homeLine`、由板给 ≤60 缩写或诊断型 `homeLine`（M1 豁免）（§2、§3.4、§9、§11、§12 plain-ui 行）。
  - SH2-03（LOW）：§3.4、§4.2 写明覆盖——板块路只承载已登记板的 owner（`rules/*`、`rules/peak`、`rules/stale`、`loops/*`、`lessons`）；`glm/*`、`execute/*`、`metrics/load` 今天无板、仅报告路显示；§4.1、§9 同步为 ui/ 面板走板块路、不经 `collectStatus`。
  - SH2-04（LOW）：§3.3 给出 `CollectedStatus` 最小接口（`items` + 每行 `{row, outcome, reason?}`）与消费方。
  - SH2-05（LOW）：合并点名的重复（§4.2、§6、§12 指标 / M7 行）并压缩 §0、§1.2。因 SH2-01/02/03/04 加入规范内容（覆盖映射、`CollectedStatus` 接口、200/60 规则）净增，文件 47,800 字节仍高于 40 KB；§12 对接表与〔实读〕依据清单构成下限，未删减规范内容去凑 40 KB。
- 0.2（2026-11-01）：按第 1 遍设计复审（`design-gate.json` pass 1，`design-review.md`）的 6 条发现修订。finding → 改动：
  - H1：依据清单改引指标 0.7（§7.2、§7.3、§7.6），0.6 存档为 `design-0.6.md`；`metrics/load` 改为「三个来自 `factsFor` 的减负数字，第四个（返工）由 M7 从图算、不经 metrics 条目」（§0、§2、§4.2、§6）；删 `metrics/ratios` 条目，改为「比率是指标 0.7 §7.6 已放行的专用指标板（`MetricsBoardView`、同一张登记表），hub 不复制为 `StatusItem`」（§3.4、§4.2 表下段、§9、§12 指标/M7 行）。
  - H2：钉定 `/hourness` 晨报内容经 harness 提示给主 Agent（`d-one-main-agent`、指标 0.7 §7.3）即进模型，改传 `audience='agent'`、不含 person 比率（§0、§1.2 F3、§4.1、§5、§6）；受众边界由「工具/命令」改为「是否进模型」（§4.1、§9）；验收第 3 条与 §5 的 `/hourness` 版面随改；比率由指标板承载。
  - M1：`homeLine` 不变量收窄为「命中某条 item 时取其 `text`（面板断言只核这种），健康/陈旧/归档/额度停住等诊断型首页行豁免、与 `items` 并存」（§3.4、§9、§11、§12 plain-ui 与 schedules 行）。
  - N1：`dsh-commands` 的「without sending it to the model」注释改标 :300（`execute` 的 JSDoc；:327 方法体、:329 `parsed===void 0` 返回、:334/:341 lifecycle）（依据清单）。
  - N2：`src/shared/status.ts` 收窄为客户端安全的类型与校验（不导入 Node 内置模块，同指标 0.7 §7.6.2），宿主登记移到 `src/shared/status-host.ts`、收集器在 `src/report/status.ts`（§0、§2、§3.2、§3.3、§10）。
  - N3：点明 `STATUS_ROWS` 是 `HEALTH_ROWS` 的超集、随 `metrics`/`execute`/`operate`/`loops` 等行合入扩充，preflight 照 `HEALTH_PACKAGES` 核对，区分 `StatusItem.owner` 与 loader 行名（§3.3）。
- 0.1（2026-11-01）：初稿。定义状态条目形状（§2）、一件事一处算的纯函数与 host 收集器（§3）、复用 plain-ui 板块登记表只加 `items`（§3.4）、受众与禁区（§4）、模块拥有字 / hub 拥有版面（§5）、晨报周报成为视图与周报所有者 M7（§6）、失败与校验（§7、§8）、不变量（§9）、M6 用量清单迁移（§10）、测试（§11）、各设计的对接改动表（§12）。
